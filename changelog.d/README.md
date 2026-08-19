# Changelog fragments

Every PR that changes behavior adds **one file here** instead of editing the
`[Unreleased]` section of `CHANGELOG.md`. Two PRs never touch the same file, so
changelog merge conflicts cannot happen (a lesson inherited from a sibling
project where every PR edited `[Unreleased]` and merges conflicted in chains).

## Format

File name: `<ref>.<type>.md`

- `<ref>` — the PR/issue number, optionally with a short slug for readability:
  `42.added.md` or `42-tcp-transport.added.md`.
- `<type>` — a Keep a Changelog category in lowercase:
  `added | changed | deprecated | removed | fixed | security`.

Content: the markdown bullet exactly as it should appear under its `###`
heading. Multi-line bullets are fine. Prefer explaining the problem that
existed, not just the change:

```markdown
- **TCP transport for GRBL controllers (#42)**: the server can now connect to
  a laser over the network (port 23). Previously only the simulator worked.
```

## Commands

```bash
node scripts/changelog.js preview                          # show what [Unreleased] would look like
node scripts/changelog.js release X.Y.Z YYYY-MM-DD "Title" # fold fragments into a release section
```

CI reminds you with the `changelog-fragment` check when a PR touches source
code but brings no fragment. Skippable with `[skip changelog]` in the PR body
for changes that genuinely don't affect users.
