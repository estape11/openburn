# CLAUDE.md

Operational guide for agents (Claude Code) working on this repo. **The authority
on conventions is [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md)** — this file
does not replace it: it collects the non-obvious things that cost time to
rediscover. If they conflict, the GUIDE wins.

OpenBurn: open-source laser software (LightBurn alternative), MIT. Monorepo npm
workspaces: `packages/core` (pure TS, SVG→IR→G-code), `packages/server`
(Node: TCP transport + GRBL protocol + HTTP/WS API + GRBL simulator),
`packages/web` (Vue 3 + TS + Vite). English everywhere.

## Environment

- **The `node` on PATH is often v15 and breaks everything.** Use nvm in the
  SAME bash line: `source ~/.nvm/nvm.sh && nvm use 22 && <command>`
  (`.nvmrc` pins 22; `engine-strict` makes `npm ci` fail loudly otherwise).
- Lint is `eslint .` from the root — it lints everything including tests.
  Run the full lint before pushing, not just the touched file.
- Tests: `npm test` (all workspaces) or `npm run test -w packages/<pkg>`.
- GRBL simulator for hardware-less dev: `npm run sim`.

## Hard rules (from the GUIDE, the ones agents trip on)

- **Read the template before opening an issue or PR.** `gh issue create --body`
  skips the template — reproduce its fields and add labels
  (`type:`/`area:`/`priority:`, exactly one each) and milestone by hand.
  PR/issue bodies with code blocks: Write the body to a file, `--body-file`.
- PR title = commit format, ≤70 chars. `Closes #N` in English (CI enforces).
- **Mutation verification is mandatory** for tests of rules/fixes; record the
  `reverted → broke` table in the PR (GUIDE §7.1).
- The agent opens PRs; **never merges, approves or tags its own PRs**. Tags are
  signed by the owner.
- Changelog fragment in `changelog.d/<ref>.<type>.md` is part of the DoD.
- `packages/core` must stay pure (no Node APIs, no I/O) — it runs in the
  browser. Import direction: `web → server → core`, never the reverse.
- **Never copy or paraphrase code from AGPL/GPL projects** (LaserWeb4,
  LaserGRBL, UGS). Porting from MIT projects (meerk40t, CNCjs) is fine with
  attribution in the file header.
- Anything that fires a real laser is operated by a human at the machine.
  Tests and demos use the simulator.

## Domain crib notes

- GRBL-over-network = raw TCP port 23, ASCII lines. NOT a telnet library —
  no IAC negotiation, just a socket.
- Streaming = character-counting against a 128-byte RX buffer (FIFO of sent
  line lengths, subtract on each `ok`/`error:N`). Realtime bytes (`?` status,
  `!` hold, `~` resume, `0x18` reset, `0x85` jog cancel) bypass the buffer and
  the line queue.
- G-code dialect: `G21 G90`, `M4` (dynamic power) with `S` scaled by `$30`,
  `G0` travel / `G1 F<mm/min>` cut, `M5` at end. `$32=1` (laser mode) expected.
- SVG Y axis grows downward; machine Y grows upward. The flip happens once, in
  core's import, and there is a mutation-verified golden test on it.
