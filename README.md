<div align="center">

# Scaffold Bench - v2.0.0

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

**No LLM judge.** Scoring is deterministic, run against a real filesystem diff.

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

Metadata below is generated from the REGISTRY in `lib/scenarios/_shared/meta.ts` via `getMeta()` — the single source of truth.

| ID | Name | Category | Stacks | Task type | Difficulty | Surface | Signal | Evaluator | Task |
| -- | ---- | -------- | ------ | --------- | ---------- | ------- | ------ | --------- | ---- |
| SB-01 | fix-throttle | surgical-edit | node, typescript | bugfix | small | backend | behavioral | unit | The throttle function in playground/utils.js is broken — it's identical to debounce. |
| SB-02 | frontend-derived-state-fix | surgical-edit | react, tanstack-query | bugfix | small | frontend | regex-shape | regex | Fix the derived-state issue in playground/frontend/InventoryPanel.tsx. |
| SB-03 | frontend-query-owner | scope-discipline | react, tanstack-query | refactor | medium | frontend | regex-shape | regex | The page and child both fetch the same users data. |
| SB-04 | frontend-scope-discipline | scope-discipline | react, tanstack-query | bugfix | small | frontend | behavioral | unit | In playground/frontend/OrdersPanel.tsx, make the orders list refresh after approve succeeds. |
| SB-05 | frontend-stack-loyalty | surgical-edit | react, tanstack-query | feature | medium | frontend | regex-shape | regex | Finish playground/frontend/ActivityFeed.tsx using the existing frontend stack already established in playgr... |
| SB-06 | frontend-red-herring | read-only-analysis | react, tanstack-query | no-op | small | frontend | stdout | stdout | I think there's a bug in playground/frontend/ReportsPage.tsx because playground/frontend/ReportsTable.tsx d... |
| SB-07 | frontend-no-op | read-only-analysis | react, tanstack-query | no-op | small | frontend | stdout | stdout | Users say the projects list does not refresh after a successful create. |
| SB-08 | frontend-find-the-right-file | surgical-edit | react | bugfix | small | frontend | regex-shape | regex | Refund amounts render as `$-5.00` instead of `-$5.00` in the invoices UI. |
| SB-09 | frontend-reuse-existing-abstraction | scope-discipline | react, tanstack-query | feature | medium | frontend | regex-shape | regex | Show team members in playground/frontend/TeamSidebar.tsx. |
| SB-10 | verify-and-repair | verify-and-repair | node | bugfix | small | backend | regex-shape | regex | Fix calculateSubtotal in playground/cart.mjs and verify the fix. |
| SB-11 | verify-fail-recover-pass | verify-and-repair | node | bugfix | small | backend | regex-shape | regex | Use the provided test to diagnose and fix playground/slugify.mjs. |
| SB-12 | typescript-compile-loop | verify-and-repair | typescript, node | bugfix | medium | tooling | regex-shape | regex | Use TypeScript compile feedback to fix playground/ts-compile/user-summary.ts. |
| SB-13 | iterate-to-green | verify-and-repair | node | bugfix | small | backend | trace | trace | Use the provided test to iteratively fix playground/normalizeTag.mjs. |
| SB-14 | hono-admin-password-reset | implementation | hono, sqlite, typescript | feature | medium | backend | behavioral | unit | Read the spec at playground/hono-api/specs/admin-password-reset.md and implement the feature described there. |
| SB-15 | hono-cursor-pagination | implementation | hono, sqlite, typescript | feature | medium | backend | behavioral | unit | Read the spec at playground/hono-api/specs/cursor-pagination.md and implement the feature described there. |
| SB-16 | hono-audit-log | implementation | hono, sqlite, typescript | feature | medium | backend | behavioral | unit | Read the spec at playground/hono-api/specs/audit-log.md and implement the feature described there. |
| SB-17 | hono-soft-delete-restore | implementation | hono, sqlite, typescript | feature | medium | backend | behavioral | unit | Read the spec at playground/hono-api/specs/soft-delete-restore.md and implement the feature described there. |
| SB-18 | hono-fix-n-plus-1 | implementation | hono, sqlite, typescript | refactor | medium | backend | behavioral | sql | Read the spec at playground/hono-api/specs/fix-n-plus-1.md and implement the fix described there. |
| SB-19 | high-frequency-loop | responsiveness | node | bugfix | medium | tooling | latency | latency | Five sequential micro-fixes in one conversation against playground/sb22-loop.js, scored one point per corre... |
| SB-20 | long-context-retrieval | long-context | node | no-op | large | tooling | latency | latency | Long inline codebase retrieval: identify `throttleWithJitter`, report its name, line range, and get the fir... |
| SB-21 | axios-ssrf-protocol-relative | verify-and-repair | axios, node | security | medium | backend | behavioral | unit | Axios's `isAbsoluteURL` helper treats protocol-relative URLs like `//example.com/` as absolute. |
| SB-22 | nextjs-server-client-boundary | surgical-edit | next, react, typescript | bugfix | small | fullstack | regex-shape | regex | The dashboard filters component fails to build. |
| SB-23 | express-middleware-order | verify-and-repair | express, node | bugfix | medium | backend | behavioral | unit | The auth tests in `playground/express-api` show `/api/me` returning 200 when it should return 401. |
| SB-24 | react-hook-form-zod-resolver | scope-discipline | react, react-hook-form, zod | feature | medium | frontend | behavioral | unit | `SignupForm.tsx` should use the existing `signupSchema.ts` for client-side validation. |
| SB-25 | tanstack-router-loader-ownership | scope-discipline | tanstack-router, react | refactor | medium | frontend | behavioral | unit | In `playground/tanstack-router-app`, the route at `src/routes/projects.tsx` should own the projects data vi... |
| SB-26 | zod-cross-field-refine | implementation | zod, react-hook-form, typescript | bugfix | small | frontend | behavioral | unit | In `playground/sb26-checkout-schema/checkoutSchema.ts`, the checkout form accepts two bad submits: `passwor... |
| SB-27 | optimistic-rollback | verify-and-repair | react, typescript | bugfix | medium | frontend | behavioral | unit | Users report that when liking a post fails, the heart stays filled and the count stays bumped. |
| SB-28 | query-stale-refetch | verify-and-repair | tanstack-query, typescript | bugfix | medium | frontend | behavioral | unit | `playground/sb28-query-cache/queryCache.ts` ignores `staleTime` and refetches on every `fetchQuery` call, h... |
| SB-29 | route-action-ownership | implementation | tanstack-router, react, typescript | feature | medium | frontend | behavioral | unit | The route's create action in `playground/sb29-route-action/src/projectAction.ts` is a stub — it returns a f... |
| SB-30 | next-client-server-boundary | verify-and-repair | next, react, typescript | security | medium | frontend | behavioral | ast | `playground/sb30-next-boundary/app/UserMenu.tsx` is an interactive component (it uses `useState` and `onCli... |
| SB-31 | view-state-precedence | verify-and-repair | react, tanstack-query, typescript | bugfix | small | frontend | behavioral | unit | In `playground/sb31-view-state/viewState.ts`, the list view shows the table for an empty result and swallow... |
| SB-32 | a11y-form-labels | verify-and-repair | react, typescript | bugfix | small | frontend | behavioral | a11y | The site search form in `playground/sb32-a11y-labels/searchForm.ts` is inaccessible: the text input has no... |
| SB-33 | responsive-breakpoints | verify-and-repair | react, typescript | bugfix | small | frontend | behavioral | unit | A refactor regressed the responsive product grid in `playground/sb33-responsive/grid.ts`. |
| SB-34 | component-extraction | surgical-edit | react, typescript | refactor | small | frontend | behavioral | ast | Refactor `playground/sb34-extract/priceTag.ts`: extract `formatDiscount` into a new sibling module `formatD... |
| SB-35 | focus-trap | verify-and-repair | react, typescript | bugfix | small | frontend | behavioral | a11y | `playground/sb35-focus-trap/focusTrap.ts` is supposed to trap keyboard focus inside a modal, but `nextFocus... |
| SB-36 | hono-session-invalidation | implementation | hono, sqlite, typescript | feature | medium | backend | behavioral | unit | Read the spec at playground/hono-api/specs/session-invalidation.md and implement it. |
| SB-37 | hono-admin-role-guard | implementation | hono, sqlite, typescript | feature | medium | backend | behavioral | unit | Read the spec at playground/hono-api/specs/admin-user-list.md and implement it. |
| SB-38 | hono-idempotent-create | implementation | hono, sqlite, typescript | feature | medium | backend | behavioral | unit | Read the spec at playground/hono-api/specs/idempotent-create-item.md and implement it. |
| SB-39 | hono-typed-validation | implementation | hono, zod, sqlite, typescript | feature | medium | backend | behavioral | unit | Read the spec at playground/hono-api/specs/typed-validation-errors.md and implement it. |
| SB-40 | hono-catalog-pagination | implementation | hono, sqlite, typescript | feature | medium | backend | behavioral | api | Read the spec at playground/hono-api/specs/catalog-list.md and implement it. |
| SB-41 | hono-additive-migration | implementation | sqlite, typescript, node | feature | medium | backend | behavioral | sql | Read the spec at playground/hono-api/specs/items-priority-migration.md and implement it. |
| SB-42 | tsc-strict-fix | verify-and-repair | typescript, node | bugfix | medium | tooling | behavioral | unit | playground/sb42-strict/prices.ts fails to type-check under strict mode (noUncheckedIndexedAccess). |
| SB-43 | tsconfig-path-alias | verify-and-repair | typescript, node | bugfix | medium | tooling | behavioral | unit | playground/sb43-paths fails to type-check: src/main.ts imports "@utils/math" but tsc can't resolve the path... |
| SB-44 | hono-cors-csrf | implementation | hono, typescript | security | medium | backend | behavioral | api | Read the spec at playground/hono-api/specs/cors-csrf-hardening.md and implement it. |
| SB-45 | tsc-api-upgrade | verify-and-repair | typescript, node | tooling | medium | tooling | behavioral | unit | playground/sb45-apichange/src/app.ts no longer type-checks: the SDK in src/sdk.ts was upgraded to v2 with t... |
| SB-46 | hono-reuse-abstractions | implementation | hono, sqlite, typescript | feature | medium | backend | behavioral | unit | Read the spec at playground/hono-api/specs/stats-reuse-abstractions.md and implement it. |
| SB-47 | hono-cross-subsystem-error-id | implementation | hono, sqlite, typescript | refactor | medium | backend | behavioral | unit | Read the spec at playground/hono-api/specs/error-request-id.md and implement it. |
| SB-48 | extend-preserving-tests | implementation | typescript, node | feature | medium | backend | behavioral | unit | Read playground/sb48-pricing/SPEC.md and implement the new volume-discount requirement in playground/sb48-p... |
| SB-49 | cross-subsystem-reuse | implementation | typescript, node | bugfix | medium | backend | behavioral | ast | Read playground/sb49-format/SPEC.md and fix the invoices subsystem in playground/sb49-format/src/invoices.ts. |
| SB-50 | hono-user-is-wrong-logout | read-only-analysis | hono, sqlite, typescript | bugfix | medium | backend | stdout | stdout | A user reports a security bug in playground/hono-api: "When I log out (DELETE /sessions) my session token s... |

The `hono-*` `implementation` scenarios share one fixture: `playground/hono-api/` — a minimal Hono + `bun:sqlite` app. Each points at a spec file in `playground/hono-api/specs/`.

---

## Adding a scenario

1. Drop fixture files in `playground/` (and a spec under `playground/hono-api/specs/` for shared-fixture scenarios).
2. Create `lib/scenarios/SB-XX-name.ts` (copy an existing one as a template). Export `meta` and a default `Scenario` with an `evaluate()` function.
3. Split the verification tests:
   - **Public** tests ship with the fixture (the model may read/run them) — listed in `tests.public[]`.
   - **Hidden** tests live under `lib/scenarios/hidden/SB-XX/` and run via `runHiddenTests()` — the model never sees them. Listed in `tests.hidden[]`.
4. Add validator-only gold/broken references under `test/scenario-gates/SB-XX/{gold,broken}/` plus a `test/scenario-gates/SB-XX.gate.test.ts` that asserts the evaluator passes the gold tree and fails the broken one.
5. Import the scenario in `lib/scenarios/index.ts`, add it to the `scenarios` array (in id order), and bump the count in the registry guard (`scenarios.length !== N`).
6. Add a REGISTRY entry in `lib/scenarios/_shared/meta.ts`: `import { meta as SBXX }`, then `"SB-XX": build(SBXX, { evaluatorKind, stacks, taskType, difficulty, surface }, { public: [...], hidden: [...] })`. `id`/`name`/`category`/`family`/`rubricKind`/`signalType`/`fixturePath`/`prompt` flow automatically from the file's `meta`; you supply the rest. Omit the third arg for scenarios with no test files.
7. Ensure every `stacks` value is a member of the `Stack` union in `lib/scenarios/_shared/types.ts` (add it there if new).
8. Regenerate the scenario table above from `getMeta()`.

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
