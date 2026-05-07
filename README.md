<div align="center">

# Scaffold Bench - v2.0.0

**Measure whether coding models behave like careful senior assistants in real codebases.**

</div>

---

Scaffold Bench is a cost-of-delegation benchmark for coding models. It is built around the work a senior solo developer or agency developer actually hands off: inherited frontend and backend codebases, narrow client requests, refactors, fixes, and improvements where making a mess is often worse than failing cleanly.

The harness wraps any OpenAI-compatible LLM (Ollama, llama.cpp, LM Studio, vLLM) in a fixed coding agent with full tool execution. The agent can read, write, edit, and run shell commands against 25 real coding tasks. The benchmark scores whether the model solved the task, but also whether it followed instructions, copied the existing style, kept scope tight, verified the right thing, and avoided leaving review debt behind.

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

Each scenario gives the model a client-shaped task and a real codebase with existing conventions. It has access to five tools — `read`, `ls`, `edit`, `write`, `bash` — and a timeout. Search is done through `bash` (`ugrep`/`rg`, `bfs`/`find`) for fewer, faster tool round-trips. The harness scores the result with deterministic, code-driven checks. **No LLM judge.**

Scaffold Bench is not a LeetCode benchmark, a blank-page app-generation benchmark, or a "did the hidden tests turn green?" benchmark. It measures whether a model is useful as a coding assistant when the expensive part is not typing code — it is preserving the shape, intent, and maintainability of someone else's project.

Good runs tend to:

- inspect the relevant files before editing
- make the smallest correct change
- reuse the project's existing stack, helpers, and naming
- avoid unrelated rewrites, new dependencies, and speculative abstractions
- run a focused verification command when the task calls for it
- recover cleanly from failed edits or failing tests

Bad runs often still produce code, but they create cleanup work: broad rewrites, style drift, extra files, brittle workarounds, unnecessary comments, or changes outside the requested scope.

### Scenario Categories

| Category             | What It Probes                                                                          |
| -------------------- | --------------------------------------------------------------------------------------- |
| `surgical-edit`      | Fix exactly the thing that's broken. Don't touch adjacent code.                         |
| `scope-discipline`   | Make the requested change. Nothing else.                                                |
| `read-only-analysis` | Answer a question about the code. Don't reach for the edit tool.                        |
| `verify-and-repair`  | Close the loop: reproduce the failure, fix it, verify, and recover if needed.           |
| `implementation`     | Read a spec, build the feature. Multi-file spec-to-code.                                |
| `responsiveness`     | Stay usable in a tight edit loop. Correctness only counts when turns stay under budget. |
| `long-context`       | Retrieve the right answer from a very large inline context and respond quickly.         |

### Current Scenarios (25 active)

| ID    | Name                                | Category           | Family      | Task                                                                                           |
| ----- | ----------------------------------- | ------------------ | ----------- | ---------------------------------------------------------------------------------------------- |
| SB-01 | fix-throttle                        | surgical-edit      | regex-style | `throttle()` is a copy of `debounce()`. Fix it.                                                |
| SB-02 | frontend-derived-state-fix          | surgical-edit      | regex-style | Remove the `useEffect`-synced duplicate state in `InventoryPanel.tsx`.                         |
| SB-03 | frontend-query-owner                | scope-discipline   | regex-style | Move the query to the page, pass data as props to the child.                                   |
| SB-04 | frontend-scope-discipline           | scope-discipline   | regex-style | Invalidate the orders query after approve succeeds. Only that.                                 |
| SB-05 | frontend-stack-loyalty              | surgical-edit      | regex-style | Finish `ActivityFeed.tsx` using the existing TanStack Query + apiClient stack.                 |
| SB-06 | frontend-red-herring                | read-only-analysis | regex-style | Is there really a bug here, or is the user wrong?                                              |
| SB-07 | frontend-no-op                      | read-only-analysis | regex-style | Confirm the requested change is already present and avoid editing anyway.                      |
| SB-08 | frontend-find-the-right-file        | surgical-edit      | regex-style | Fix the currency formatting bug in the real shared helper, not in the component.               |
| SB-09 | frontend-reuse-existing-abstraction | scope-discipline   | regex-style | Reuse the existing `useTeamMembers` hook instead of reimplementing fetching.                   |
| SB-10 | verify-and-repair                   | verify-and-repair  | regression  | Fix `calculateSubtotal`, then verify the fix passes.                                           |
| SB-11 | verify-fail-recover-pass            | verify-and-repair  | regression  | Run the failing slugify test first, fix the bug, then rerun to green.                          |
| SB-12 | typescript-compile-loop             | verify-and-repair  | regression  | Fix a strict-null TypeScript error and verify with `tsc --noEmit`.                             |
| SB-13 | iterate-to-green                    | verify-and-repair  | regression  | Work through an intermediate failing test run and iterate until green.                         |
| SB-14 | hono-admin-password-reset           | implementation     | spec-impl   | Implement admin password reset flow (new table, two routes, session invalidation).             |
| SB-15 | hono-cursor-pagination              | implementation     | spec-impl   | Add opaque cursor pagination to `GET /items` with validation + limit cap.                      |
| SB-16 | hono-audit-log                      | implementation     | spec-impl   | Add `audit_events` table, `logAudit` helper, and admin role-update route.                      |
| SB-17 | hono-soft-delete-restore            | implementation     | spec-impl   | Use the existing `deleted_at` column to build `POST /items/:id/restore`.                       |
| SB-18 | hono-fix-n-plus-1                   | implementation     | spec-impl   | Replace per-row owner query in `GET /items` with a single JOIN.                                |
| SB-19 | high-frequency-loop                 | responsiveness     | regex-style | Five sequential micro-fixes in one conversation; each edit only scores if it lands within 10s. |
| SB-20 | long-context-retrieval              | long-context       | regex-style | Search a ~50k-token inline code blob for `throttleWithJitter` and report its line range.       |
| SB-21 | axios-ssrf-protocol-relative        | verify-and-repair  | regression  | Treat protocol-relative URLs as relative in Axios's `isAbsoluteURL`.                           |
| SB-22 | nextjs-server-client-boundary       | surgical-edit      | regex-style | Add missing `"use client"` directive to a component using `useState`.                          |
| SB-23 | express-middleware-order            | verify-and-repair  | regression  | Fix Express middleware ordering so auth gate and body parser run before routes.                |
| SB-24 | react-hook-form-zod-resolver        | scope-discipline   | regex-style | Wire `zodResolver` with existing `signupSchema` into `useForm`.                                |
| SB-25 | tanstack-router-loader-ownership    | scope-discipline   | regex-style | Move data fetching from `ProjectsTable` to the route's `loader`; table becomes presentational. |

The `implementation` scenarios share one fixture: `playground/hono-api/` — a minimal Hono + `bun:sqlite` app with `users`, `sessions`, and `items`. Each scenario points at a spec file in `playground/hono-api/specs/`.

Additional historical regression fixtures remain in `playground/` but are not exported in the active suite.

---

## Scoring

Most scenarios use a **0-10 rubric** scored across five dimensions:

| Dimension             | Points | What it measures                                                                 |
| --------------------- | ------ | -------------------------------------------------------------------------------- |
| **Correctness**       | 0-3    | Did the actual change solve the stated problem?                                  |
| **Scope**             | 0-2    | Did the model touch only the files/regions the task allowed?                     |
| **Pattern adherence** | 0-2    | Did it use the existing stack/idioms/abstractions instead of inventing new ones? |
| **Verification**      | 0-1    | Did it run the right command before and/or after the change to confirm the fix?  |
| **Cleanup cost**      | 0-2    | How much would a human reviewer have to clean up after?                          |

Correctness is necessary, but it is not sufficient. A model that gets behavior right by bulldozing surrounding code should score worse than a model that lands a smaller, idiomatic patch.

Status thresholds: **≥9 → pass**, **5-8 → partial**, **≤4 → fail**.

Scope discipline is checked from an actual filesystem diff between the pristine fixture and the model's working copy, so changes made through `bash` (e.g., `sed`) are caught just like `edit` or `write` tool calls.

Two scenarios use custom point models:

- `SB-19` (`responsiveness`) scores **0-5**: 1 point per correct turn completed within 10 seconds.
- `SB-20` (`long-context`) scores **0-3**: name, line range, and first meaningful token within 30 seconds.

Results are persisted to SQLite and accessible from the dashboard at **http://localhost:4317**.

**Model metrics** are aggregated from real benchmark traffic — no warm-up probe. If the server exposes token usage, the dashboard and results JSON include:

- `totalPromptTokens` / `totalCompletionTokens` — summed across all requests
- `totalRequests` — number of completions made
- `promptTokensPerSecond` / `completionTokensPerSecond` — only present if the server returns timing metadata (e.g. llama.cpp's `x-inference-time`)

### Trajectory Quality

The harness records every tool call, not just the final diff. This makes it possible to evaluate the model's working style:

- context acquisition: `read`, `ls`, and search before edits
- edit discipline: `edit` versus whole-file `write`, number of files touched, failed edit recovery
- verification behavior: failing test reproduced before change, passing test rerun after change
- overthinking tax: extra files, unnecessary dependencies, speculative refactors, unrelated churn
- responsiveness: first-token time, turn time, and tight-loop edit latency

These signals are first-class because Scaffold Bench is trying to answer a practical question: how much supervision and cleanup does this model cost?

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
2. Create a new file `lib/scenarios/SB-XX-name.ts` following the per-scenario layout
3. Import it in `lib/scenarios/index.ts` and add to the `scenarios` array
4. Update the count guard in `index.ts`
5. Update the README scenario table by hand

Each scenario file exports `meta` and a default `Scenario` object:

```ts
import { rubricToEvaluation } from "./_shared/rubric.js";
import type { Scenario } from "./_shared/types.js";
import type { ScenarioId } from "../schemas/brands.js";
import { PLAYGROUND_SRC, onlyChangedFiles } from "./_shared/helpers.js";

export const meta = {
  id: "SB-XX",
  name: "my-scenario",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "regex-shape" as const,
  fixturePath: "playground/",
  prompt: `Fix the thing in playground/thing.ts. Only that.`,
} as const;

const scenario: Scenario = {
  id: "SB-XX" as ScenarioId,
  name: "my-scenario",
  category: "surgical-edit",
  family: "regex-style",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls, stdout }) {
    return rubricToEvaluation({
      correctness: [...],
      scope: [...],
      pattern: [...],
      verification: [...],
      cleanup: [...],
    }, {
      pass: "Fixed correctly.",
      partial: "Partial fix.",
      fail: "Did not fix.",
    });
  },
};

export default scenario;
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
| Scenario hangs                  | Set a longer `timeoutMs` when starting a run; implementation and multi-turn scenarios can need more time         |
| SQLite locked                   | Close other running instances; the DB uses WAL mode                                                              |
| Frontend doesn't connect to API | Make sure `bun run dev` or `bun run start` is running; check port `4317`                                         |

---

## License

MIT

## Credits

- [Commit Mono](https://github.com/eigilnikolajsen/commit-mono) - Commit Mono is an anonymous and neutral programming typeface.
