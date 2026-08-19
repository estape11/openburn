<!--
Quick reminders (see DEVELOPMENT_GUIDE.md):
- One PR = one issue. Link with `Closes #N` below (or `Refs #N` for partial work).
  The `pr-issue-link` CI job fails the PR if this is missing.
- No tests, no approval. Paste exact commands + outputs.
- main is untouchable. The approver is not the author.
- CI must be green.
-->

## Summary

<!-- 1-3 lines: what changes and why -->

Closes #<issue-number>

## Main changes

<!-- Bullets of what the PR touches -->
-

## Tests performed and results

<!--
Exact commands + outputs (no paraphrasing).

Example:

### Unit / integration
```bash
source ~/.nvm/nvm.sh && nvm use 22 && npm run test -w packages/core
```
Output: 34 passed.

### Mutation verification (mandatory for rule/fix tests — GUIDE §7.1)
| What was reverted | What broke |
|---|---|
| Y-flip removed in importer | `golden/square.gcode` mismatch (Y coords negated) |

### UI
- Smoke: opened the layer panel, set red layer to 80%/500, generated G-code, S=800 emitted.
-->

## How to verify locally

```bash
gh pr checkout <number>
source ~/.nvm/nvm.sh && nvm use 22 && npm ci && npm test
# Manual steps...
```

## Findings during development

<!--
Anything useful for the FUTURE that you discovered but did NOT fix in this PR.
If it deserves its own issue, create it and link it. If there is genuinely
nothing, write "none" (empty doesn't count).

Tags:
- [latent bug]   Inconsistency or bug seen in passing (out of scope)
- [decision]     What was considered and discarded (with reason)
- [workaround]   Why X was chosen over Y
- [dependency]   Side effects discovered in other modules
-->

## Checklist

- [ ] Linked to an issue with the English keyword (`Closes #N`, or `Refs #N` if partial)
- [ ] Branch named per convention (`<action>/<summary>`)
- [ ] Commit signed (`-S`), title ≤70 chars
- [ ] CI is green (lint, typecheck, tests)
- [ ] Changelog fragment added in `changelog.d/` (or `[skip changelog]` justified)
- [ ] Rule/fix tests validated by mutation, table included above
- [ ] If it adds an endpoint: documented here with example request + error cases
- [ ] If it adds UI: smoke description here (screenshot recommended)
- [ ] Docs updated (README / DEVELOPMENT_GUIDE / ROADMAP / FEATURE_CATALOG if applicable)
- [ ] "Findings" section completed (may be "none" if genuinely none)

## Notes for the reviewer

<!-- Decisions made, explicit doubts, trade-offs, planned follow-ups. -->
