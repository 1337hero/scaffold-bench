<div align="center">

# Scaffold Bench - v3.0.0

**A benchmark for coding models. Tests whether they behave like a careful senior dev — not just whether they can write code.**

</div>

---

## What it does

Hands a model 50 real coding tasks in real codebases — backend APIs, frontend apps, bug fixes, refactors, small features. The model gets 5 tools (`read`, `ls`, `edit`, `write`, `bash`) and up to 20 turns to land the change.

Then it scores not just _did the code work_, but _how did the model behave_:

- Did it touch only what it should?
- Did it follow the existing stack and patterns?
- Did it run the right command to verify?
- How much cleanup would a reviewer have to do?

Correctness counts — but a model that gets the right answer by bulldozing surrounding code scores worse than one that lands a smaller, idiomatic patch.

**No LLM judge.** Scoring is deterministic. Behavior is graded against a real filesystem diff, and correctness is verified by **actually running the code** — real unit tests executed in a throwaway temp dir, real `tsc --noEmit`, or TypeScript-AST checks — so a correct-but-differently-spelled fix still passes and a regex-matching-but-broken one doesn't.

---

## Quick start

```bash
bun install
cp .env.sample .env       # set your model endpoints
bun run dev               # frontend + backend with HMR
```

Web UI at **http://localhost:4317** — pick a model, pick scenarios, watch it run live.

Run every discovered model through the full suite, unattended:

```bash
bun run bench:all
bun run bench:all -- --runs=3 --warmup=20
```

With `--runs > 1`, each model runs the suite N times and the summary prints the **median score and spread** across its runs, so you can see variance rather than a single noisy number. Before each run a **preflight** 1-token completion checks the endpoint (classifying `endpoint_unreachable` / `model_not_found` / `auth` / `bad_response`) and warms the model, so a misconfigured endpoint fails in seconds instead of burning the whole suite on infra errors.

`.env` config:

```bash
SCAFFOLD_LOCAL_ENDPOINT=http://127.0.0.1:8082
SCAFFOLD_REMOTE_ENDPOINT=https://openrouter.ai/api
SCAFFOLD_REMOTE_API_KEY=sk-or-...
SCAFFOLD_REMOTE_MODELS=x-ai/grok-4.1-fast,anthropic/claude-3.5-sonnet
SCAFFOLD_WEB_PORT=4317
```

Works with anything OpenAI-compatible: Ollama (`11434`), llama.cpp / llama-swap (`8082`), LM Studio (`1234`), vLLM, OpenRouter. The API key stays server-side.

---

## Tool-call harness

Tool calling isn't standardized across models, so the harness is a first-class axis. Each run picks one of three contracts:

| Harness  | Contract                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `native` | OpenAI `tools` parameter — structured `tool_calls` in the response. **Default.**                                           |
| `hermes` | Tool schemas embedded in the system prompt; model emits `<tool_call>{...}</tool_call>` tags parsed from assistant content. |
| `qwen`   | Same idea with `<function_call>{...}</function_call>` tags.                                                                |

Set it per run via `POST /api/runs` with `"harness": "native" | "hermes" | "qwen"`. `native` is behavior-identical to earlier versions. `<think>` / `<thinking>` blocks (closed or not) are stripped from assistant content before transcripts, evaluation, and harness parsing, so reasoning verbosity can't pollute evaluators or trip tag parsing.

---

## Scoring

Each scenario is graded 0–10:

| Dimension             | Pts | Question                                 |
| --------------------- | --- | ---------------------------------------- |
| **Correctness**       | 3   | Did the change solve the problem?        |
| **Scope**             | 2   | Did it touch only what it should?        |
| **Pattern adherence** | 2   | Did it use existing stack and idioms?    |
| **Verification**      | 1   | Did it run the right command to confirm? |
| **Cleanup cost**      | 2   | How much cleanup would a reviewer need?  |

**≥9 → pass · 5–8 → partial · ≤4 → fail**

Two scenarios use custom scoring: SB-19 (responsiveness, 0–5) and SB-20 (long context, 0–3).

Scope is checked from a real filesystem diff, so changes made through `bash` (e.g. `sed`) get caught the same as `edit` / `write` calls.

**Penalty:** calling a tool that doesn't exist deducts 1 point (floored at 0) and shows as a failed `no hallucinated tools` check.

**Timeouts** are scored fairly: a run that hits its timeout is evaluated against the playground state as-is (not auto-failed), with `timedOut` recorded. Speed is reported separately as `efficiencyPointsPerMinute` so it never inflates or deflates capability.

Many scenarios verify correctness **behaviorally** rather than by regex: hidden unit tests live under `lib/scenarios/_shared/behaviors/` and are copied into a throwaway temp dir at scoring time (so models can't read the assertions), while others use TypeScript-AST checks in `lib/scenarios/_shared/evaluators/ast.ts`.

---

## What it rewards

- Reading before editing
- Smallest correct change
- Reusing existing helpers and patterns
- Running focused verification commands
- Knowing when _not_ to edit
- Recovering cleanly from failed edits or red tests

## What it punishes

- Editing when nothing needs editing
- Touching files outside the requested scope
- Reinventing abstractions that already exist
- Bulldozing surrounding code to land a fix
- Adding files, deps, or comments not asked for

---

## Scenario categories

| Category             | What it probes                                      |
| -------------------- | --------------------------------------------------- |
| `surgical-edit`      | Fix exactly the broken thing. Don't touch the rest. |
| `scope-discipline`   | Make the requested change. Nothing else.            |
| `read-only-analysis` | Answer a question. Don't reach for the edit tool.   |
| `verify-and-repair`  | Reproduce, fix, verify, recover.                    |
| `implementation`     | Read a spec, build the feature. Multi-file.         |
| `responsiveness`     | Stay fast in a tight edit loop.                     |
| `long-context`       | Find the right answer in a huge inline blob.        |

## Current scenarios (50 active)

| ID    | Name                                | Category           | Requires   | Description                                                                                    |
| ----- | ----------------------------------- | ------------------ | ---------- | ---------------------------------------------------------------------------------------------- |
| SB-01 | fix-throttle                        | surgical-edit      |            | `throttle()` is a copy of `debounce()`. Fix it.                                                |
| SB-02 | frontend-derived-state-fix          | surgical-edit      |            | Remove the `useEffect`-synced duplicate state in `InventoryPanel.tsx`.                         |
| SB-03 | frontend-query-owner                | scope-discipline   |            | Move the query to the page, pass data as props to the child.                                   |
| SB-04 | frontend-scope-discipline           | scope-discipline   |            | Invalidate the orders query after approve succeeds. Only that.                                 |
| SB-05 | frontend-stack-loyalty              | surgical-edit      |            | Finish `ActivityFeed.tsx` using the existing TanStack Query + apiClient stack.                 |
| SB-06 | frontend-red-herring                | read-only-analysis |            | Is there really a bug here, or is the user wrong?                                              |
| SB-07 | frontend-no-op                      | read-only-analysis |            | Confirm the requested change is already present and avoid editing anyway.                      |
| SB-08 | frontend-find-the-right-file        | surgical-edit      |            | Fix the currency formatting bug in the real shared helper, not in the component.               |
| SB-09 | frontend-reuse-existing-abstraction | scope-discipline   |            | Reuse the existing `useTeamMembers` hook instead of reimplementing fetching.                   |
| SB-10 | verify-and-repair                   | verify-and-repair  |            | Fix `calculateSubtotal`, then verify the fix passes.                                           |
| SB-11 | verify-fail-recover-pass            | verify-and-repair  |            | Run the failing slugify test first, fix the bug, then rerun to green.                          |
| SB-12 | typescript-compile-loop             | verify-and-repair  |            | Fix a strict-null TypeScript error and verify with `tsc --noEmit`.                             |
| SB-13 | iterate-to-green                    | verify-and-repair  |            | Work through an intermediate failing test run and iterate until green.                         |
| SB-14 | hono-admin-password-reset           | implementation     |            | Implement admin password reset flow (new table, two routes, session invalidation).             |
| SB-15 | hono-cursor-pagination              | implementation     |            | Add opaque cursor pagination to `GET /items` with validation + limit cap.                      |
| SB-16 | hono-audit-log                      | implementation     |            | Add `audit_events` table, `logAudit` helper, and admin role-update route.                      |
| SB-17 | hono-soft-delete-restore            | implementation     |            | Use the existing `deleted_at` column to build `POST /items/:id/restore`.                       |
| SB-18 | hono-fix-n-plus-1                   | implementation     |            | Replace per-row owner query in `GET /items` with a single JOIN.                                |
| SB-19 | high-frequency-loop                 | responsiveness     |            | Five sequential micro-fixes in one conversation; each edit only scores if it lands within 10s. |
| SB-20 | long-context-retrieval              | long-context       |            | Search a ~50k-token inline code blob for `throttleWithJitter` and report its line range.       |
| SB-21 | axios-ssrf-protocol-relative        | verify-and-repair  |            | Treat protocol-relative URLs as relative in Axios's `isAbsoluteURL`.                           |
| SB-22 | nextjs-server-client-boundary       | surgical-edit      |            | Add missing `"use client"` directive to a component using `useState`.                          |
| SB-23 | express-middleware-order            | verify-and-repair  |            | Fix Express middleware ordering so auth gate and body parser run before routes.                |
| SB-24 | react-hook-form-zod-resolver        | scope-discipline   |            | Wire `zodResolver` with existing `signupSchema` into `useForm`.                                |
| SB-25 | tanstack-router-loader-ownership    | scope-discipline   |            | Move data fetching from `ProjectsTable` to the route's `loader`; table becomes presentational. |
| SB-26 | zustand-store-mutation              | surgical-edit      |            | Diagnose and fix a store subscriber notification bug                                           |
| SB-27 | sse-final-line                      | surgical-edit      |            | Fix SSE parser dropping the final event                                                        |
| SB-28 | generated-types-discipline          | scope-discipline   |            | Extend types without touching generated files                                                  |
| SB-29 | test-isolation                      | verify-and-repair  |            | Fix shared-state test pollution                                                                |
| SB-30 | webhook-hmac                        | implementation     |            | Implement HMAC-verified webhook with dedup                                                     |
| SB-31 | woo-double-discount                 | surgical-edit      | php        | Fix double-hooked WooCommerce discount filter                                                  |
| SB-32 | template-escaping                   | scope-discipline   | php        | Add escaped phone field to template part                                                       |
| SB-33 | plugin-conflict-red-herring         | read-only-analysis | php        | Identify the real cause of menu breakage                                                       |
| SB-34 | build-a-plugin                      | implementation     | php        | Create a WordPress shortcode plugin                                                            |
| SB-35 | join-fanout                         | surgical-edit      |            | Fix SQL join fanout double-counting                                                            |
| SB-36 | migration-backfill                  | verify-and-repair  |            | Fix NOT NULL migration missing backfill                                                        |
| SB-37 | reporting-query                     | implementation     |            | Write monthly net revenue SQL query                                                            |
| SB-38 | actions-trigger                     | surgical-edit      |            | Fix GitHub Actions deploy-on-PR trigger                                                        |
| SB-39 | dockerfile-layers                   | verify-and-repair  |            | Fix Dockerfile cache-busting and lockfile bug                                                  |
| SB-40 | deploy-script-exclude               | scope-discipline   | shellcheck | Add .env exclude to rsync deploy script                                                        |
| SB-41 | liquid-soldout                      | surgical-edit      |            | Fix Liquid template ignoring sold-out toggle                                                   |
| SB-42 | astro-frontmatter-field             | scope-discipline   |            | Add optional heroImage to Astro blog schema                                                    |
| SB-43 | build-a-section                     | implementation     |            | Build a Shopify Liquid product spotlight section                                               |
| SB-44 | nav-stacking                        | surgical-edit      |            | Fix CSS stacking context for nav overlay                                                       |
| SB-45 | theme-variable-scope                | surgical-edit      |            | Fix CSS custom property dark theme scope                                                       |
| SB-46 | responsive-grid                     | implementation     |            | Implement CSS Grid responsive card layout                                                      |
| SB-47 | go-nil-map                          | verify-and-repair  | go         | Fix nil map panic in Go HTTP handler                                                           |
| SB-48 | go-json-endpoint                    | implementation     | go         | Implement JSON POST endpoint in Go stdlib                                                      |
| SB-49 | rust-borrow                         | surgical-edit      | cargo      | Fix borrow-after-move in Rust function signature                                               |
| SB-50 | rust-off-by-one                     | verify-and-repair  | cargo      | Fix iterator off-by-one in Rust                                                                |

> **Toolchain requirements:** Scenarios marked with a `Requires` value depend on the named binary being available on PATH. Missing tools cause the scenario to be **skipped** (scored 0/0, excluded from totals) without invoking the model. Install on Arch Linux with: `sudo pacman -S php shellcheck go rust`. Liquid rendering uses the `liquidjs` npm package (no host binary needed).

The five `implementation` scenarios (SB-14..18) share one fixture: `playground/hono-api/` — a minimal Hono + `bun:sqlite` app. Each points at a spec file in `playground/hono-api/specs/`.

---

## Adding a scenario

1. Drop fixture files in `playground/`
2. Create `lib/scenarios/SB-XX-name.ts` (copy an existing one as a template)
3. Import it in `lib/scenarios/index.ts` and add it to the `scenarios` array
4. Update the count guard in `index.ts`
5. Add a row to the table above

Each scenario exports `meta` and a default `Scenario` with an `evaluate()` function. Look at any existing `SB-XX-*.ts` for the shape.

## Adding a runtime

Implement the `Runtime` interface in `lib/runtimes/types.ts`, register it in the `RUNTIMES` map, emit `RuntimeEvent`s for live UI updates.

---

## Troubleshooting

| Issue                           | Fix                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Model server connection refused | Check `SCAFFOLD_LOCAL_ENDPOINT`; test with `curl $SCAFFOLD_LOCAL_ENDPOINT/v1/models` |
| Scenario hangs                  | Pass a longer `timeoutMs` — `implementation` and multi-turn cases need more time     |
| SQLite locked                   | Close other running instances; the DB uses WAL mode                                  |
| Frontend can't reach API        | Make sure `bun run dev` or `bun run start` is running on port `4317`                 |

---

## License

MIT

## Credits

[Commit Mono](https://github.com/eigilnikolajsen/commit-mono) — anonymous, neutral programming typeface.
