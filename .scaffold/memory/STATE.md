# Project State

_Last updated: 2026-07-02 (sortable table)_

## What this project is

scaffold-bench (v3.0.0) — a deterministic benchmark for coding models. 50 scenarios in real
fixture codebases, scored on behavior (scope, patterns, verification, cleanup) plus
correctness verified by actually running code. Bun + Hono server, Vite web UI on :4317,
SQLite (WAL) storage, JSON reports in `results/`.

## Current focus

Leaderboard table now fully sortable (all numeric columns, desc/asc toggle), default sort by Score desc.

## Next up

- Kick off overnight `run-to-target.ts` for local models (AntAngelMed excluded).
- README has no Docker section — add "Run with Docker" (`docker compose up --build`) via a
  small PR.
- `/api/health` reports hardcoded `version: "1.0.0"` while package.json is 3.0.0.

## Last shipped

2026-07-02 — RecentRunsTable: added client-side column sorting (desc/asc toggle) for Scenarios, Score, Time, Started columns.

2026-07-02 — LeaderboardTable: added client-side column sorting (desc/asc toggle) for all 12 numeric columns (Score, Pts/run, Gen TPS, Prompt TPS, Scen Avg, Total Wall, TTFT, Tools, Requests, T/O, Exempt, Runs). Default sort by Score desc.

2026-07-02 — PR #11 merged (squash, `99f4de5`): overnight runner (`scripts/run-to-target.ts`) — batch-fills
models to N runs, skips excluded models, manages server lifecycle, prints summary.

2026-07-01 — PR #3 merged (squash, `7d17006`): Docker support. Rebased stale branch onto
main, fixed build breaks (`system-prompt.md` excluded by `.dockerignore`, missing
`web-ui/bun.lock` copy, typescript needed at runtime by evaluators), added full scenario
toolchain (php/shellcheck/go/cargo) so no scenarios skip, results volume. Also formatted
`scripts/run-piped-models.ts` which had main's CI red.

## Last verified

2026-07-02 — `npx tsc --noEmit` clean in web-ui/. Leaderboard + Recent Runs tables both fully sortable.

2026-07-01 — Docker image builds (~1.1 GB), container serves UI + `/api/health`, all 50
scenarios discovered, php/shellcheck/go/cargo on PATH in-container. `bun test test/`: 184
pass / 1 skip / 0 fail.

## Known issues / watch list

- Health endpoint version string stale (1.0.0 vs 3.0.0).
- PHP scenarios in Docker run PHP 8.3 (alpine php83) — fine today, pin awareness.

## Key files / commands

| File / command            | Why it matters                                |
| ------------------------- | --------------------------------------------- |
| `scripts/run-to-target.ts` | overnight runner — fills models to N runs, skips excluded |
| `scripts/web.ts`          | production entry (server + built UI)          |
| `bun run dev`             | dev server, frontend + backend HMR            |
| `bun test test/`          | full suite incl. scenario gates               |
| `bun run bench:all`       | run every discovered model through the suite  |
| `lib/scenarios/index.ts`  | scenario registry + count guard               |
| `server/run-engine.ts`    | run orchestration, writes `results/*.json`    |
| `server/db/migrations.ts` | SQLite path (`SCAFFOLD_DB_PATH`) + migrations |
