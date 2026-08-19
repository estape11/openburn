#!/usr/bin/env node
// scripts/changelog.js — Changelog by fragments (towncrier/scriv style).
// Ported from Examentico's scripts/changelog.js (same repo family, MIT).
//
// PROBLEM it solves: if every PR edits the SAME `## [Unreleased]` section of
// CHANGELOG.md, merges conflict in chains. Instead each PR adds its OWN file
// under `changelog.d/` (two PRs never touch the same file → no conflicts), and
// the fragments are folded together when a release is cut.
//
// Usage:
//   node scripts/changelog.js preview
//       Prints the [Unreleased] block that would result (fragments + anything
//       left manually in [Unreleased]). Writes nothing.
//
//   node scripts/changelog.js release <version> <YYYY-MM-DD> "<title>"
//       Folds the fragments (+ manual [Unreleased] entries) into a new section
//       `## [<version>] - <date> — <title>`, leaves [Unreleased] empty, and
//       DELETES the fragments. The section format is what the create-release
//       job (release.yml) knows how to extract.
//
// No dependencies, no network, deterministic (the date is an argument).
//
// Fragment format: `changelog.d/<ref>.<type>.md`
//   <ref>  = PR/issue number (e.g. 42) or a short slug.
//   <type> = Keep a Changelog category in lowercase:
//            added | changed | deprecated | removed | fixed | security
//            (+ any custom type; sorted last with a capitalized heading).
//   Content = the markdown bullet as it should appear under its `###`.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRAG_DIR = path.join(ROOT, 'changelog.d');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');

// Order and heading of the known types (Keep a Changelog 1.1.0).
const KNOWN_TYPES = [
  ['added', 'Added'],
  ['changed', 'Changed'],
  ['deprecated', 'Deprecated'],
  ['removed', 'Removed'],
  ['fixed', 'Fixed'],
  ['security', 'Security'],
];
const ORDER = new Map(KNOWN_TYPES.map(([type], i) => [type, i]));
const HEADING = new Map(KNOWN_TYPES);
const headingOf = (type) => HEADING.get(type) || type.charAt(0).toUpperCase() + type.slice(1);
const orderOf = (type) => (ORDER.has(type) ? ORDER.get(type) : 100);

// Read the fragments in changelog.d/ → [{ file, ref, type, text }].
function readFragments() {
  if (!fs.existsSync(FRAG_DIR)) return [];
  return fs
    .readdirSync(FRAG_DIR)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .sort() // deterministic within each type
    .map((file) => {
      const m = file.match(/^(.+)\.([A-Za-z]+)\.md$/);
      if (!m) {
        throw new Error(
          `Invalid fragment name: '${file}'. Format: <ref>.<type>.md (e.g. 42.added.md).`,
        );
      }
      const ref = m[1];
      const type = m[2].toLowerCase();
      let text = fs.readFileSync(path.join(FRAG_DIR, file), 'utf8').trim();
      if (!text) throw new Error(`Empty fragment: '${file}'.`);
      if (!text.startsWith('- ')) text = `- ${text}`; // tolerate a missing bullet
      return { file, ref, type, text };
    });
}

// Parse the [Unreleased] body (between "## [Unreleased]" and the next "## [")
// into { type: [bullet, ...] }. Supports multi-line bullets. Kept so manual
// entries still work.
function parseUnreleased(body) {
  const sections = {};
  let type = null;
  for (const line of body.split('\n')) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) {
      type = h[1].trim().toLowerCase();
      sections[type] = sections[type] || [];
      continue;
    }
    if (line.startsWith('- ')) {
      if (!type) continue;
      sections[type].push(line);
    } else if (type && sections[type].length && line.trim() !== '') {
      // Continuation of a multi-line bullet.
      sections[type][sections[type].length - 1] += `\n${line}`;
    }
  }
  return sections;
}

// Combine fragments + manual bullets → "### Heading\n\n- ...\n\n### ..." text.
function assemble(fragments, manual = {}) {
  const byType = new Map();
  const add = (type, text) => {
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(text);
  };
  // Manual first (respects what was already written in [Unreleased]), then fragments.
  for (const [type, bullets] of Object.entries(manual)) bullets.forEach((b) => add(type, b));
  for (const fr of fragments) add(fr.type, fr.text);

  const types = [...byType.keys()].sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b));
  return types
    .map((type) => `### ${headingOf(type)}\n\n${byType.get(type).join('\n')}`)
    .join('\n\n');
}

// Split the CHANGELOG into { header, unreleasedBody, rest }.
function splitChangelog(text) {
  const lines = text.split('\n');
  const iUnreleased = lines.findIndex((l) => /^##\s+\[Unreleased\]/i.test(l));
  if (iUnreleased === -1) throw new Error('No "## [Unreleased]" section found in CHANGELOG.md.');
  let iRest = lines.findIndex((l, i) => i > iUnreleased && /^##\s+\[/.test(l));
  if (iRest === -1) iRest = lines.length;
  return {
    header: lines.slice(0, iUnreleased + 1).join('\n'),
    unreleasedBody: lines.slice(iUnreleased + 1, iRest).join('\n'),
    rest: lines.slice(iRest).join('\n'),
  };
}

function cmdPreview() {
  const { unreleasedBody } = splitChangelog(fs.readFileSync(CHANGELOG, 'utf8'));
  const fragments = readFragments();
  const manual = parseUnreleased(unreleasedBody);
  const body = assemble(fragments, manual);
  process.stdout.write(`## [Unreleased]\n\n${body || '(no changes)'}\n`);
  process.stderr.write(`\n[preview] ${fragments.length} fragment(s) in changelog.d/.\n`);
}

function cmdRelease(version, date, title) {
  if (!version || !date) {
    throw new Error('Usage: node scripts/changelog.js release <version> <YYYY-MM-DD> "<title>"');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error(`Invalid date: '${date}' (expected YYYY-MM-DD).`);
  // The title is MANDATORY: release.yml names the GitHub Release from this
  // section's heading. Without it the release would be called "vX.Y.Z" bare,
  // in a list where every other release has a focus. The workflow only warns
  // (a release must not fail over a title) — but warnings in logs go unread,
  // so we ask here, while someone is still looking.
  if (!String(title || '').trim()) {
    throw new Error(
      'Missing release title.\n' +
        `  Usage: node scripts/changelog.js release ${version} ${date} "What this release brings"\n` +
        '  It names the GitHub Release and the CHANGELOG section heading.',
    );
  }

  const { header, unreleasedBody, rest } = splitChangelog(fs.readFileSync(CHANGELOG, 'utf8'));
  const fragments = readFragments();
  const manual = parseUnreleased(unreleasedBody);
  const body = assemble(fragments, manual);
  if (!body)
    throw new Error('Nothing to publish: no fragments and no manual [Unreleased] entries.');

  const sectionHeader = `## [${version}] - ${date} — ${String(title).trim()}`;
  const next = [header, '', sectionHeader, '', body, '', rest]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '\n');

  fs.writeFileSync(CHANGELOG, next);

  // Delete the folded fragments (they show up in the diff as removed).
  for (const fr of fragments) fs.unlinkSync(path.join(FRAG_DIR, fr.file));

  process.stdout.write(`Published ${sectionHeader}\n`);
  process.stdout.write(`Fragments folded and deleted: ${fragments.length}\n`);
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === 'preview') return cmdPreview();
    if (cmd === 'release')
      return cmdRelease(args[0], args[1], args.slice(2).join(' ') || undefined);
    process.stderr.write(
      'Usage:\n  node scripts/changelog.js preview\n  node scripts/changelog.js release <version> <YYYY-MM-DD> "<title>"\n',
    );
    process.exitCode = 2;
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exitCode = 1;
  }
}

main();
