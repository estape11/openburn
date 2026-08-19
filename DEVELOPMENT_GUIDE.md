# Development Guide — OpenBurn

> Reference document for process, conventions and operating rules. It applies to
> human contributions and AI-assisted contributions alike.
>
> Adapted from the conventions of CIRO Technologies projects (Examentico) and
> aligned with industry standards:
> - [Semantic Versioning 2.0.0](https://semver.org/)
> - [Conventional Commits 1.0.0](https://www.conventionalcommits.org/)
> - [Keep a Changelog 1.1.0](https://keepachangelog.com/)
> - [12-Factor App](https://12factor.net/)
> - [OWASP Top 10](https://owasp.org/Top10/)
> - [WCAG 2.1 AA](https://www.w3.org/TR/WCAG21/)
> - GitHub Flow / trunk-based development with short-lived feature branches

---

## 1. General principles

1. **`main` is untouchable.** Every change lands through a Pull Request. GitHub
   Flow with short-lived branches (ideally ≤1 week).
2. **One issue, one branch, one PR.**
3. **Green CI + approval, or no merge.**
4. **The PR includes the tests and their results.** No evidence, no approval.
5. **Document the decision.** Commit message and PR description answer: *if I
   apply this change, what do I get and why*.
6. **The roadmap drives the order.** `ROADMAP.md` says what comes next;
   `FEATURE_CATALOG.md` is the map against LightBurn and the source of issues.
7. **Config through environment variables** (12-factor). Zero secrets in code.
8. **Safety first.** This software drives a laser. Anything that can make the
   machine move, fire, or keep firing unexpectedly is treated as a bug of the
   highest severity, tested accordingly, and never merged "to fix later".

## 2. Workflow

### 2.1 Branches

```bash
git checkout -b <action>/<summary>   # kebab-case, ≤40 chars, name the result
```

| Prefix | Use |
|---|---|
| `feature/` | New functionality |
| `update/` | Improvement on existing functionality |
| `fix/` | Bug fix |
| `hotfix/` | Urgent production fix |
| `security/` | Vulnerability fix (communicates the *class of risk*; use `hotfix/` only when it can't wait for the next release) |
| `refactor/` | Reorganization without functional change |
| `docs/` | Documentation only |

Security branch names describe the area, not the exploit (`security/api-auth`,
not `security/anyone-can-fire-the-laser`) — branches are public before the fix.

### 2.2 Keeping up to date

```bash
git fetch origin && git rebase origin/main
git push --force-with-lease   # never plain --force
```

### 2.3 Opening the PR

- Title follows the commit format (§3), ≤70 chars. Measure it before opening.
- Body uses `.github/pull_request_template.md` (loads automatically). For
  bodies with code blocks from the CLI, write the body to a file and use
  `gh pr create --body-file <file>` (inline heredocs mangle backticks).
- Link the issue with `Closes #N` (or `Refs #N` for partial work). CI enforces
  this (`pr-issue-link` job).
- Squash merge unless there is a reason to preserve history. Delete the branch
  after merge. When merging a chain of stacked PRs: one command per line, never
  `&&`, and `--delete-branch` only on the last of the chain (deleting a base
  branch makes GitHub close the child PR).

## 3. Commits (Conventional Commits 1.0.0)

Title (≤70 chars): `<type>(<area>): <imperative summary>`

Types: `feat fix security refactor docs test chore style perf ci build revert`.
Areas: `core`, `server`, `web`, `infra`, `docs`, `db` (future), or omitted.

- `security` commits always leave a `### Security` CHANGELOG entry; if the fix
  doesn't deserve one, it was a `fix`. The summary describes the fix, not how
  to exploit the hole.
- Breaking changes: `!` after the type or `BREAKING CHANGE:` footer → MAJOR bump.
- Body explains the *why*, ≤72 chars per line, ends with `Closes #N`/`Refs #N`.
- Sign commits (`git commit -S`). For AI-assisted commits see §10.

## 4. Versioning (SemVer 2.0.0)

`VERSION` at the repo root is the single source of truth (`scripts/bump-version.sh`
is the only way to change it — it also updates the README badge and every
workspace `package.json`). Each ROADMAP release is a MINOR bump; hotfixes are
PATCH bumps. The release workflow aborts if the git tag and `VERSION` diverge.

## 5. Issues

- Use the templates (`.github/ISSUE_TEMPLATE/`): **bug report**, **user story**,
  **technical task**. Blank issues are disabled.
- The template applies the `type:` label; add `area:` and `priority:` (and the
  milestone) manually — GitHub Issue Forms write dropdown choices into the
  body, not as labels.
- Exactly one label per family: `type:` (`feature|bug|refactor|docs|infra|security`),
  `area:` (`core|server|web|infra|docs|cross`), `priority:` (`high|medium|low`).
  Use `area: cross` instead of stacking areas. `status: blocked` when stuck.
- One milestone per release (`v0.1.0`, `v0.2.0`, …). A milestone is only
  trustworthy if issues close when their work lands — hence `Closes #N` (the
  keyword must be in English; GitHub does not parse translations).
- When creating from the CLI, `gh issue create --body` skips the template:
  reproduce its fields and pass labels/milestone explicitly.

Definition of Ready: clear context, observable acceptance criteria, labels +
milestone, dependencies identified, understandable in ≤30 min. Architecture
decisions get discussed in a technical-task issue *before* the PR.

## 6. Pull Requests

Template sections are mandatory: Summary, Main changes, Tests performed and
results (exact commands + outputs), How to verify locally, **Findings during
development**, Checklist, Notes for the reviewer.

**Findings during development** documents what appeared during the work but was
NOT fixed in the PR — one line each, tagged `[latent bug]`, `[decision]`,
`[workaround]`, `[dependency]`, with a link if it got its own issue. If there
genuinely were none, write `"none"` — empty doesn't count (we distinguish
"there weren't any" from "nobody bothered to write them down").

Golden rules: no giant PRs (>500 functional lines → split), no PRs without
tests, no PRs without an issue, no merge on red CI.

Definition of Done: acceptance criteria met and verifiable; CI green; coverage
does not decrease; no new console warnings; docs updated; **changelog fragment
in `changelog.d/`** (§8); findings section completed; no commented-out code,
debug logs, or TODOs without an issue.

## 7. Testing and evidence

Every PR carries at least one of, according to what it touches:

- **core**: unit tests (vitest). Geometry/G-code changes come with golden-file
  tests (known SVG in → expected G-code out).
- **server**: integration tests against the **GRBL simulator over a real TCP
  socket** (`packages/server/src/sim/`). Protocol changes must show the
  streaming invariants hold (never more than the RX buffer in flight; `!`, `~`
  and `0x18` effective).
- **web**: type-check passes; smoke described in the PR ("opened X, did Y, saw
  Z"); Playwright for critical flows (load → configure → run job).

### 7.1 Mutation verification (mandatory)

A test that passes with the fix **and** with the bug proves nothing and is
worse than no test. Every test accompanying a fix or a new rule is validated by
**mutation**: deliberately revert the rule it protects, run the test, confirm
it goes **red**. Record it in the PR as a table `what was reverted → what broke`.

Practical rules (each one paid for in blood elsewhere):
- Verify the mutation actually applied (look at the diff of the mutant); a
  pattern that didn't match leaves the code intact and fakes coverage.
- The pattern must be **unique** in the file — `String.replace` mutates the
  first occurrence, which may be the wrong function.
- Revert from a **copy** of the file, not `git checkout --` (it wipes
  uncommitted work).
- A red that doesn't match the reverted rule is not coverage, it's a hint of
  test contention or environment leakage — investigate before celebrating.

### 7.2 Binary/generated artifacts

On generated output (G-code buffers, images), `expect(x).not.toContain(y)` is
only meaningful if the equivalent **positive** assertion finds something.
Before writing the negative, prove the extraction works.

## 8. Changelog

Keep a Changelog format, per-PR fragments in `changelog.d/` (see its README).
`node scripts/changelog.js release X.Y.Z YYYY-MM-DD "Title"` folds them at
release time. The title is not decorative: the release workflow names the
GitHub Release with it. Including the fragment is part of the DoD.

## 9. Code conventions

- **English everywhere**: identifiers, comments, UI strings, commit messages,
  issues, PRs. (UI i18n may come later; English is the source language.)
- **TypeScript strict** everywhere; no `any` without a comment saying why.
- `packages/core` stays **pure**: no Node APIs, no I/O, no timers — it must run
  in the browser. The dependency direction is `web → server → core`; core
  imports nothing from the other two.
- Units discipline: geometry in **millimeters** as `number`, machine coordinates
  explicit. SVG px→mm conversion happens once, at import. Names carry units
  when ambiguous (`feedMmPerMin`, `powerPercent`).
- Server errors follow a small stable catalog (`code` in SCREAMING_SNAKE +
  actionable message); never hand-written ad hoc responses.
- Errors are never silenced: an empty `catch {}` requires a comment.
- Vue: Composition API with `<script setup lang="ts">`, Pinia stores, typed
  interfaces for server data. Feedback via toasts/banners, never swallowed.
- File naming: root docs `UPPERCASE.md`; packages lowercase; source follows the
  language standard (`camelCase.ts`, `PascalCase.vue`).

## 10. Accessibility

WCAG 2.1 AA is the goal; **no regression** per PR meanwhile. Checklist for UI
PRs: semantic HTML; `alt` on informative images; contrast 4.5:1 (3:1 large);
keyboard operable (Tab/Enter/Esc); visible focus; `aria-label` where visible
text isn't enough; no `tabindex > 0`.

## 11. Releases

1. Close the milestone's issues.
2. `./scripts/bump-version.sh X.Y.Z` (VERSION + badge + package.json versions).
3. `node scripts/changelog.js preview`, then `release X.Y.Z YYYY-MM-DD "Title"`.
   Update `ROADMAP.md` (status + demo).
4. PR `release/vX.Y.Z` → green CI → merge.
5. Signed tag by the owner: `git tag -s vX.Y.Z -m "vX.Y.Z - <focus>"` and
   `git push origin vX.Y.Z` (the specific tag, not `--tags`). Tag push triggers
   `release.yml`: it validates tag == `VERSION` and publishes the GitHub
   Release from the CHANGELOG section.
6. Close the milestone, create the next one.

Not implemented yet (deliberately): package publishing (npm/Docker images) —
deferred until there is something users would install; revisit at v0.1.0.

## 12. Operational practices

- No secrets in the repo. `.env` is gitignored; document variables in
  `.env.example` when it appears (and add the env-doc CI check with it).
- No `git push --force` to `main` or shared branches.
- Communicate before touching `ROADMAP.md` or this guide — they are process
  documents.
- Destructive operations against a real machine (anything that fires the laser
  or moves axes) are operated by a human present at the machine. Tests use the
  simulator.

## 13. For AI-assisted contributors

- The AI can open PRs but **never approves, merges or tags its own PRs**.
- Every AI-generated PR includes the exact commands run to validate (no
  paraphrasing).
- Commit authorship is the human operator (signed `-S`); AI assistance is
  recorded with a `Co-Authored-By: <Model> <noreply@anthropic.com>` trailer on
  **all** assisted commits, docs and chores included.
- Out-of-scope improvements → new issue, not a bigger PR. Unmeetable
  acceptance criterion → `Blocked by: ...` in the PR + `status: blocked`.
- **Surface findings proactively** in the PR's findings section: the chat
  closes and knowledge is lost, but the PR stays indexable.
- Issue/PR bodies with code blocks: write the body to a file with the editor
  tool and use `--body-file` (inline heredocs escape backticks).

## 14. Glossary

| Term | Meaning here |
|---|---|
| **core** | `packages/core` — pure TS: SVG → IR → toolpaths → G-code |
| **server** | `packages/server` — transports, GRBL protocol, HTTP/WS API |
| **web** | `packages/web` — Vue 3 SPA |
| **IR** | Intermediate representation: Document/Layer/Shape → Toolpath |
| **toolpath** | Ordered list of rapid/cut moves with power and feed |
| **streaming** | Sending G-code respecting the controller's RX buffer (character-counting) |
| **framing** | Tracing the job outline at zero/low power to position material |
| **sim** | The GRBL simulator (TCP server) used by tests and hardware-less dev |
| **release** | Signed tag `vX.Y.Z`, one publishable unit; milestone = release |
