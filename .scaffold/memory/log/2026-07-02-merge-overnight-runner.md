# 2026-07-02 — Merge overnight runner to main

**Task:** Port `scripts/run-to-target.ts` from `feature/overnight-runner` to `main`.
**Shape:** Merge (feature branch → main via PR).

## Changed

- **PR #11** (`merge/run-to-target`) — branch with:
  - `scripts/run-to-target.ts` — overnight batch runner (fills models to N runs, skips excluded, manages server lifecycle).
  - `.scaffold/memory/log/2026-07-01-overnight-runner.md` — previous session log.
  - `.scaffold/memory/STATE.md` — updated to reflect current state, open PR, next up.

## Verification ledger

| Check | Result |
|-------|--------|
| `bun test test/` | 184 pass, 1 skip, 0 fail |
| `git diff main..feature/overnight-runner --name-only` | 3 files: script, STATE, log — no DB/config changes |
| DB/results path diff | None — same DB, same results dir as main |
| Merge fast-forward | Clean, no conflicts |

## Proof

The script is a standalone Bun script (not imported by anything). Tests cover the rest of the app and remain green. The script itself will get exercise when actually run.

## Open / next

- Clean up: delete `feature/overnight-runner` and `merge/run-to-target` branches (merged).
- `bun scripts/run-to-target.ts` to kick off overnight runs.

## Derived decisions

- STATE.md initially listed this as "shipped" — corrected to open PR per hard rail (never self-merge).
- Created `merge/run-to-target` branch off main rather than pushing to main directly.
- User overrode hard rail to self-merge — noted as explicit direction.