<div align="center">

# Scaffold Bench - v1.0.2

**Stress-test local LLMs on real agentic coding work — not trivia, not math puzzles.**

</div>

---

Scaffold Bench wraps any OpenAI-compatible LLM (Ollama, llama.cpp, LM Studio, vLLM) in a fixed coding agent with full tool execution. The agent can read, write, edit, bash and runs against 23 real coding tasks.

---

## Quick Start

Get up and running in under 5 minutes:

```bash
# 1. Install dependencies
bun install

# 2. Configure models — copy the sample and edit
cp .env.sample .env

# 3. Start (dev mode — frontend + backend with HMR)
bun run dev

# Or for production (builds frontend if needed, then serves everything)
bun run start
```

The Web UI starts at **http://localhost:4317** — pick a model, pick scenarios, watch live SSE streams, browse report dashboards.

To run every discovered model through the full suite unattended:

```bash
bun run bench:all                        # 2 runs per model, 15s warmup (defaults)
bun run bench:all -- --runs=3 --warmup=20
```

The harness appends `/v1/chat/completions` to your endpoint. Common defaults: Ollama `11434`, llama.cpp/llama-swap `8082`, LM Studio `1234`.

**`.env` configuration:**

```bash
# Local model server — probed for /v1/models. Whatever it lists is selectable.
SCAFFOLD_LOCAL_ENDPOINT=http://127.0.0.1:8082

# Remote provider (any OpenAI-compatible endpoint: OpenRouter, Together, ...)
# All three must be set for remote models to appear in the picker.
SCAFFOLD_REMOTE_ENDPOINT=https://openrouter.ai/api
SCAFFOLD_REMOTE_API_KEY=sk-or-...
SCAFFOLD_REMOTE_MODELS=x-ai/grok-4.1-fast,anthropic/claude-3.5-sonnet

SCAFFOLD_WEB_PORT=4317          # Web UI server port
```

The API key stays server-side — it's never sent across the wire from the browser.

---

## What It Tests

Each scenario gives the model a real task and a real codebase. It has access to five tools — `read`, `ls`, `edit`, `write`, `bash` — and a timeout. Search is done through `bash` (`ugrep`/`rg`, `bfs`/`find`) for fewer, faster tool round-trips. The harness scores the result with deterministic, code-driven checks. **No LLM judge.**

### Eight Scenario Categories

| Category             | What It Probes                                                                          |
| -------------------- | --------------------------------------------------------------------------------------- |
| `surgical-edit`      | Fix exactly the thing that's broken. Don't touch adjacent code.                         |
| `audit`              | Read the code, find the bugs. Do NOT edit anything.                                     |
| `scope-discipline`   | Make the requested change. Nothing else.                                                |
| `read-only-analysis` | Answer a question about the code. Don't reach for the edit tool.                        |
| `verify-and-repair`  | Close the loop: reproduce the failure, fix it, verify, and recover if needed.           |
| `implementation`     | Read a spec, build the feature. Multi-file spec-to-code.                                |
| `responsiveness`     | Stay usable in a tight edit loop. Correctness only counts when turns stay under budget. |
| `long-context`       | Retrieve the right answer from a very large inline context and respond quickly.         |

### Current Scenarios (23 total)

| ID    | Name                                | Category           | Task                                                                                           |
| ----- | ----------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| SB-01 | fix-throttle                        | surgical-edit      | `throttle()` is a copy of `debounce()`. Fix it.                                                |
| SB-02 | audit-server                        | audit              | Find all bugs in `server.go`. List them. Don't fix them.                                       |
| SB-03 | surgical-edit                       | scope-discipline   | Add email uniqueness check to `createUser`. That's it.                                         |
| SB-04 | read-only-analysis                  | read-only-analysis | What indexes are missing from `schema.sql` and why does it matter?                             |
| SB-05 | frontend-derived-state-fix          | surgical-edit      | Remove the `useEffect`-synced duplicate state in `InventoryPanel.tsx`.                         |
| SB-06 | frontend-query-owner                | scope-discipline   | Move the query to the page, pass data as props to the child.                                   |
| SB-07 | frontend-scope-discipline           | scope-discipline   | Invalidate the orders query after approve succeeds. Only that.                                 |
| SB-08 | frontend-stack-loyalty              | surgical-edit      | Finish `ActivityFeed.tsx` using the existing TanStack Query + apiClient stack.                 |
| SB-09 | frontend-red-herring                | read-only-analysis | Is there really a bug here, or is the user wrong?                                              |
| SB-10 | frontend-no-op                      | read-only-analysis | Confirm the requested change is already present and avoid editing anyway.                      |
| SB-11 | frontend-find-the-right-file        | surgical-edit      | Fix the currency formatting bug in the real shared helper, not in the component.               |
| SB-12 | frontend-reuse-existing-abstraction | scope-discipline   | Reuse the existing `useTeamMembers` hook instead of reimplementing fetching.                   |
| SB-13 | verify-and-repair                   | verify-and-repair  | Fix `calculateSubtotal`, then verify the fix passes.                                           |
| SB-14 | verify-fail-recover-pass            | verify-and-repair  | Run the failing slugify test first, fix the bug, then rerun to green.                          |
| SB-15 | typescript-compile-loop             | verify-and-repair  | Fix a strict-null TypeScript error and verify with `tsc --noEmit`.                             |
| SB-16 | iterate-to-green                    | verify-and-repair  | Work through an intermediate failing test run and iterate until green.                         |
| SB-17 | hono-admin-password-reset           | implementation     | Implement admin password reset flow (new table, two routes, session invalidation).             |
| SB-18 | hono-cursor-pagination              | implementation     | Add opaque cursor pagination to `GET /items` with validation + limit cap.                      |
| SB-19 | hono-audit-log                      | implementation     | Add `audit_events` table, `logAudit` helper, and admin role-update route.                      |
| SB-20 | hono-soft-delete-restore            | implementation     | Use the existing `deleted_at` column to build `POST /items/:id/restore`.                       |
| SB-21 | hono-fix-n-plus-1                   | implementation     | Replace per-row owner query in `GET /items` with a single JOIN.                                |
| SB-22 | high-frequency-loop                 | responsiveness     | Five sequential micro-fixes in one conversation; each edit only scores if it lands within 10s. |
| SB-23 | long-context-retrieval              | long-context       | Search a ~50k-token inline code blob for `throttleWithJitter` and report its line range.       |

The `implementation` scenarios share one fixture: `playground/hono-api/` — a minimal Hono + `bun:sqlite` app with `users`, `sessions`, and `items`. Each scenario points at a spec file in `playground/hono-api/specs/`.

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

Results are persisted to SQLite and accessible from the dashboard at **http://localhost:4317**.

**Model metrics** are aggregated from real benchmark traffic — no warm-up probe. If the server exposes token usage, the dashboard and results JSON include:

- `totalPromptTokens` / `totalCompletionTokens` — summed across all requests
- `totalRequests` — number of completions made
- `promptTokensPerSecond` / `completionTokensPerSecond` — only present if the server returns timing metadata (e.g. llama.cpp's `x-inference-time`)

---

## Core Concepts

### How a Scenario Runs

```
[1] orchestrator.ts
     copies playground/ → /tmp/scenario-XXX/
     ↓
[2] local-agent.ts
     starts session with model, sends prompt
     ↓
[3] Tool loop (up to 20 iterations)
     model output → tool dispatch → result → next turn
     ↓
[4] evaluate()
     reads pristine source + modified files → Check[] → pass/partial/fail
     ↓
[5] Result written to results/ and streamed via SSE
```

---

## Adding a Scenario

1. Drop fixture files in `playground/`
2. Append to the `scenarios` array in `lib/scenarios.ts`
3. The `evaluate()` function receives `playgroundDir` (modified copy) and `PLAYGROUND_SRC` (pristine) and returns a `ScenarioEvaluation`

```ts
{
  id: "SB-XX",
  name: "my-scenario",
  category: "surgical-edit",
  prompt: "Fix the thing in playground/thing.ts. Only that.",
  async evaluate({ playgroundDir, toolCalls, stdout }) {
    const current = await readFile(join(playgroundDir, "thing.ts"), "utf-8");
    const original = await readFile(join(PLAYGROUND_SRC, "thing.ts"), "utf-8");
    const checks: Check[] = [
      { name: "file was changed", pass: current !== original },
      { name: "did not edit unrelated files", pass: !hasCall(toolCalls, "edit") && !hasCall(toolCalls, "write") },
    ];
    return checksToEvaluation(checks, {
      pass: "Fixed correctly without collateral changes.",
      partial: "Some progress made.",
      fail: "No change or wrong file edited.",
    });
  },
}
```

For large inline prompts, use `buildPrompt()` to assemble from the copied playground. For multi-turn cases, use `execute()` plus `runtime.startSession()`.

---

## Adding a Runtime

Implement the `Runtime` interface from `lib/runtimes/types.ts` and register it in the `RUNTIMES` map. Emit `RuntimeEvent`s for live dashboard updates.

---

## Troubleshooting

| Issue                           | Solution                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Model server connection refused | Verify `SCAFFOLD_LOCAL_ENDPOINT` points to a running server; test with `curl $SCAFFOLD_LOCAL_ENDPOINT/v1/models` |
| SSE stream drops                | Web server sets `idleTimeout: 0` for SSE; check firewall if using remote host                                    |
| Scenario hangs                  | Set a longer `timeoutMs` when starting a run; SB-22 and SB-16 need many turns                                    |
| SQLite locked                   | Close other running instances; the DB uses WAL mode                                                              |
| Frontend doesn't connect to API | Make sure `bun run dev` or `bun run start` is running; check port `4317`                                         |

---

## License

MIT

## Credits

- [Commit Mono](https://github.com/eigilnikolajsen/commit-mono) - Commit Mono is an anonymous and neutral programming typeface.
