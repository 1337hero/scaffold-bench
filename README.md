<div align="center">

# ScaffoldBench                                                                 
                                                                      
</div>

A harness for stress-testing local LLMs on **real agentic coding work** — not trivia, not math puzzles.

Point it at a locally-running model (Ollama, llama.cpp, LM Studio, vLLM, or any server with an OpenAI-compatible API), run the suite, and find out if your model can actually use tools, stay in scope, and not hallucinate fixes.

**Sample run (4 scenarios, local runtime):**

```
SB-01  fix-throttle         surgical-edit       partial  1/2  ✗ throttle logic incomplete
SB-02  audit-server         audit               pass     2/2
SB-03  surgical-edit        scope-discipline    pass     2/2
SB-04  read-only-analysis   read-only-analysis  pass     2/2

Score: 7/8 (87.5%)  →  results/1776383086009-local.json
```

---

## What it tests

Each scenario gives the model a real task and a real codebase. It has access to seven tools — `read`, `ls`, `grep`, `glob`, `edit`, `write`, `bash` — and a timeout. The harness watches what it does and scores the result with deterministic, code-driven checks. No LLM judge.

**Eight scenario categories:**

| Category | What it probes |
|---|---|
| `surgical-edit` | Fix exactly the thing that's broken. Don't touch adjacent code. |
| `audit` | Read the code, find the bugs. Do NOT edit anything. |
| `scope-discipline` | Make the requested change. Nothing else. Not even "while I'm in here..." |
| `read-only-analysis` | Answer a question about the code. Don't reach for the edit tool. |
| `verify-and-repair` | Close the loop: reproduce the failure, fix it, verify the result, and recover if needed. |
| `implementation` | Read a spec, build the feature. Multi-file spec-to-code against an existing fixture stack. |
| `responsiveness` | Stay usable in a tight edit loop. Correctness only counts when the turn stays under budget. |
| `long-context` | Retrieve the right answer from a very large inline context and start responding quickly. |

**Current scenarios (23 total):**

| ID | Name | Category | Task |
|---|---|---|---|
| SB-01 | fix-throttle | surgical-edit | `throttle()` is a copy of `debounce()`. Fix it. |
| SB-02 | audit-server | audit | Find all bugs in `server.go`. List them. Don't fix them. |
| SB-03 | surgical-edit | scope-discipline | Add email uniqueness check to `createUser`. That's it. |
| SB-04 | read-only-analysis | read-only-analysis | What indexes are missing from `schema.sql` and why does it matter? |
| SB-05 | frontend-derived-state-fix | surgical-edit | Remove the `useEffect`-synced duplicate state in `InventoryPanel.tsx`. |
| SB-06 | frontend-query-owner | scope-discipline | Move the query to the page, pass data as props to the child. |
| SB-07 | frontend-scope-discipline | scope-discipline | Invalidate the orders query after approve succeeds. Only that. |
| SB-08 | frontend-stack-loyalty | surgical-edit | Finish `ActivityFeed.tsx` using the existing TanStack Query + apiClient stack. |
| SB-09 | frontend-red-herring | read-only-analysis | Is there really a bug here, or is the user wrong? |
| SB-10 | frontend-no-op | read-only-analysis | Confirm the requested change is already present and avoid editing anyway. |
| SB-11 | frontend-find-the-right-file | surgical-edit | Fix the currency formatting bug in the real shared helper, not in the component. |
| SB-12 | frontend-reuse-existing-abstraction | scope-discipline | Reuse the existing `useTeamMembers` hook instead of reimplementing fetching. |
| SB-13 | verify-and-repair | verify-and-repair | Fix `calculateSubtotal`, then verify the fix passes. |
| SB-14 | verify-fail-recover-pass | verify-and-repair | Run the failing slugify test first, fix the bug, then rerun to green. |
| SB-15 | typescript-compile-loop | verify-and-repair | Fix a strict-null TypeScript error and verify with `tsc --noEmit`. |
| SB-16 | iterate-to-green | verify-and-repair | Work through an intermediate failing test run and iterate until green. |
| SB-17 | hono-admin-password-reset | implementation | Implement admin password reset flow (new table, two routes, session invalidation). |
| SB-18 | hono-cursor-pagination | implementation | Add opaque cursor pagination to `GET /items` with validation + limit cap. |
| SB-19 | hono-audit-log | implementation | Add `audit_events` table, `logAudit` helper, and admin role-update route. |
| SB-20 | hono-soft-delete-restore | implementation | Use the existing `deleted_at` column to build `POST /items/:id/restore`. |
| SB-21 | hono-fix-n-plus-1 | implementation | Replace per-row owner query in `GET /items` with a single JOIN. |
| SB-22 | high-frequency-loop | responsiveness | Five sequential micro-fixes in one conversation; each edit only scores if it lands within 10s. |
| SB-23 | long-context-retrieval | long-context | Search a ~50k-token inline code blob for `throttleWithJitter` and report its line range. |

The `implementation` scenarios share one fixture: `playground/hono-api/` — a minimal Hono + `bun:sqlite` app with `users`, `sessions`, and `items`. Each scenario points at a spec file in `playground/hono-api/specs/`. The model reads the spec, writes the feature, and is evaluated on structural checks (files, exports, patterns, and non-modification of unrelated handlers).

---

## Scoring

Most scenarios are ternary: **pass = 2pts / partial = 1pt / fail = 0pt**.

Each scenario defines its own `Check[]` — regex matches, AST-ish function extraction, file diff comparisons, turn-ordering checks. `checksToEvaluation()` reduces them:

- All checks pass → `pass` (2pt)  
- ≥ 50% pass → `partial` (1pt)  
- < 50% → `fail` (0pt)

Two scenarios use custom point models:

- `SB-22` (`responsiveness`) scores **0-5**: 1 point per correct turn completed within 10 seconds.
- `SB-23` (`long-context`) scores **0-3**: name, line range, and first meaningful token within 30 seconds.

Results write to `results/{timestamp}-{runtime}.json`.

**Model metrics** are aggregated from real benchmark traffic — no warm-up probe. If the server exposes token usage, the final dashboard and results JSON include:

- `totalPromptTokens` / `totalCompletionTokens` — summed across all requests
- `totalRequests` — number of completions made
- `promptTokensPerSecond` / `completionTokensPerSecond` — only present if the server returns timing metadata (e.g. llama.cpp's `x-inference-time` or equivalent)

These appear in the run-level `modelMetrics` key and per-scenario in each result entry. Servers that only expose token counts (no timing) will populate the token fields but omit the speed lines.

---

## Setup

**Requirements:** `bun`, `rg` (ripgrep), `curl`

```bash
bun install
```

Edit `scaffold.config.json`:

```json
{
  "endpoint": "http://127.0.0.1:8082",
  "model": "your-model-name"
}
```

Set `endpoint` to your server's base URL — the harness appends `/v1/chat/completions` automatically. Common defaults: Ollama runs on `11434`, llama.cpp server on `8080`, LM Studio on `1234`.

---

## Running

```bash
# Full suite
bun bench.ts --runtime local

# Single scenario by name or ID
bun bench.ts --runtime local --scenario fix-throttle
bun bench.ts --runtime local --scenario SB-01

# Custom timeout (ms)
bun bench.ts --runtime local --timeout 300000
```

**Flags:**

| Flag | Short | Default | Description |
|---|---|---|---|
| `--runtime` | `-r` | `local` | Runtime to use |
| `--scenario` | `-s` | all | Run one scenario by name or ID |
| `--timeout` | `-t` | `180000` | Per-scenario timeout in ms |

**Env overrides** (beat `scaffold.config.json`):

```bash
SCAFFOLD_ENDPOINT=http://127.0.0.1:11434  # e.g. Ollama
SCAFFOLD_MODEL=qwen2.5-coder:32b
SCAFFOLD_API_KEY=optional-bearer-token
```

---

## Live dashboard

When stdout is a TTY, you get a live split-pane view: scenario list on the left, active scenario details + tool activity on the right. Misses surface in real-time. Final scores and a path to the JSON results appear when the run completes.

Non-TTY (CI, pipes) falls back to plain line-by-line output.

When timing data is available, the final summary also shows aggregate prompt tokens, completion tokens, and prompt / generation throughput for the full run. Scenario JSON now also records `firstTokenMs`, plus per-turn wall/first-token arrays for multi-turn scenarios like `SB-22`.

---

## Architecture

```
bench.ts             — CLI, argument parsing, TTY dashboard, result writer
lib/
  orchestrator.ts    — copies playground/ to tmpdir, runs scenario, cleans up
  scenarios.ts       — scenario definitions + evaluate() implementations
  scoring.ts         — Check[], ScenarioEvaluation, checksToEvaluation()
  runtimes/
    types.ts         — Runtime interface
    local-agent.ts   — OpenAI-compatible tool loop via curl
playground/          — fixture files (the codebase the model edits)
results/             — JSON output (gitignored)
```

The `local` runtime runs a tool loop: `curl` → model → tool dispatch → repeat, up to 20 iterations. Tools available to the model: `read`, `ls`, `grep` (via `rg`), `glob`, `edit` (exact-match string replace), `write`, and `bash`.

---

## Adding a scenario

Append to the `scenarios` array in `lib/scenarios.ts`. Drop your fixture files in `playground/`. The `evaluate()` function reads both the pristine source (`PLAYGROUND_SRC`) and the post-run copy (`playgroundDir`) and returns a `ScenarioEvaluation`.

```ts
{
  id: "SB-17",
  name: "my-scenario",
  category: "surgical-edit",
  prompt: "Fix the thing in playground/thing.ts. Only that.",
  async evaluate({ playgroundDir, toolCalls, stdout }) {
    const current = await readFile(join(playgroundDir, "playground/thing.ts"), "utf-8");
    const original = await readFile(join(PLAYGROUND_SRC, "thing.ts"), "utf-8");
    const checks: Check[] = [
      { name: "file was changed", pass: current !== original },
      { name: "did not edit unrelated files", pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write") },
    ];
    return checksToEvaluation(checks, {
      pass: "...",
      partial: "...",
      fail: "...",
    });
  },
}
```

If you need a large inline prompt fixture, use `buildPrompt()` to assemble it from the copied playground at runtime. For multi-turn cases, use `execute()` plus `runtime.startSession()` so one scenario can manage several user turns in a single conversation.

## Adding a runtime

Implement the `Runtime` interface from `lib/runtimes/types.ts`, register it in the `RUNTIMES` map in `bench.ts`. Emit `RuntimeEvent`s for live dashboard updates.

---

## Roadmap

- TUI polish 
- Move to Web UI
