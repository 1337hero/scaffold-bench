# 2026-07-01 — OSS-readiness review + Docker PR #3 merged

## Done

- Small review: tests 184 pass / 0 fail; README matches the 50-scenario suite; MIT license;
  `.gitignore` keeps DBs/results/.env out; `.env.sample` present; CI (`ci.yml`) runs
  format/typecheck/lint/test. Verdict: ready to share.
- PR #3 (Docker) was stale/CONFLICTING. Rebased onto main (dropped its `migrations.ts`
  change — main already had `SCAFFOLD_DB_PATH`, better version), kept the dev-only CORS gate.
- Fixed real build breaks found by building the image:
  1. `.dockerignore` `*.md` excluded `system-prompt.md` that the Dockerfile COPYs → added
     `!system-prompt.md`.
  2. Builder ran `bun install --frozen-lockfile` in web-ui without copying `web-ui/bun.lock`.
  3. Runtime used `--production` deps but evaluators import `typescript` / shell out to
     `tsc` at scoring time → dropped the deps stage, reuse builder node_modules.
- Added php83 (+`php` alias), shellcheck, cargo to the image so no scenarios skip; volume
  for `results/`. Verified live: health, UI, 50 scenarios, toolchain on PATH. Image ~1.1 GB.
- CI on the PR was red from main itself (unformatted `scripts/run-piped-models.ts` from
  commit `abe0e79`) — formatted it on the PR branch.
- Squash-merged PR #3 (`7d17006`) per explicit user instruction; branch deleted; local main
  synced.

## Judgment calls

- Installed the full toolchain (go/php/shellcheck/cargo) instead of a slim image: the point
  of the Docker target is comparable runs of the full 50-scenario suite.
- Fixed main's formatting failure inside the Docker PR rather than a separate PR — can't
  push to main, and it blocked this PR's CI.

## Next

- README "Run with Docker" section (not yet documented anywhere user-facing).
- `/api/health` version string is hardcoded `1.0.0` (package.json says 3.0.0).
