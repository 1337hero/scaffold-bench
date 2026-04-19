# scaffold-bench — cheat sheet

## Quick run

```bash
SCAFFOLD_MODEL="Qwopus 3.5 27B Q6_K" bun bench.ts -s sb22-loop
```

## Invocation format

```bash
[SCAFFOLD_MODEL="<model-id>"] bun bench.ts [flags]
```

### Flags

| Long         | Short | Default  | Purpose                                      |
| ------------ | ----- | -------- | -------------------------------------------- |
| `--runtime`  | `-r`  | `local`  | Runtime adapter (only `local` currently)     |
| `--scenario` | `-s`  | —        | Scenario **name** or **id**; omit for all    |
| `--timeout`  | `-t`  | `600000` | Per-scenario timeout in ms                   |

### Model resolution

Order: `SCAFFOLD_MODEL` env → `scaffold.config.json` `model` field. If neither is set, bench aborts.

Model id must match the `name:` field in your llama-swap `config.yaml` exactly.

## Scenarios

| ID    | Name (use with `-s`)                  |
| ----- | ------------------------------------- |
| SB-01 | `fix-throttle`                        |
| SB-02 | `audit-server`                        |
| SB-03 | `surgical-edit`                       |
| SB-04 | `read-only-analysis`                  |
| SB-05 | `frontend-derived-state-fix`          |
| SB-06 | `frontend-query-owner`                |
| SB-07 | `frontend-scope-discipline`           |
| SB-08 | `frontend-stack-loyalty`              |
| SB-09 | `frontend-red-herring`                |
| SB-10 | `frontend-no-op`                      |
| SB-11 | `frontend-find-the-right-file`        |
| SB-12 | `frontend-reuse-existing-abstraction` |
| SB-13 | `verify-and-repair`                   |
| SB-14 | `verify-fail-recover-pass`            |
| SB-15 | `typescript-compile-loop`             |
| SB-16 | `iterate-to-green`                    |
| SB-17 | `hono-admin-password-reset`           |
| SB-18 | `hono-cursor-pagination`              |
| SB-19 | `hono-audit-log`                      |
| SB-20 | `hono-soft-delete-restore`            |
| SB-21 | `hono-fix-n-plus-1`                   |
| SB-22 | `high-frequency-loop`                 |
| SB-23 | `long-context-retrieval`              |

`-s` accepts either the ID (`SB-22`) or the name (`high-frequency-loop`).

## Recipes

**Single scenario, specific model**

```bash
SCAFFOLD_MODEL="Qwen3.5 35B-A3B UD-Q4_K_XL" bun bench.ts -s surgical-edit
```

**Full sweep with longer timeout**

```bash
SCAFFOLD_MODEL="Qwopus 3.5 27B Q6_K" bun bench.ts -t 1200000
```

**By ID**

```bash
SCAFFOLD_MODEL="GLM-4.7-Flash NEO-CODE-MAX 64x2.6B" bun bench.ts -s SB-23
```

## Gotchas

- Model id is case/space-sensitive — must exactly match llama-swap's `name:`
- llama-swap unloads the previous model on each request; first call of a run pays the load cost
- For long-context scenarios (SB-23), ensure the model's `-c` in `config.yaml` ≥ what the scenario needs

---

Source: `bench.ts`, `lib/scenarios.ts`, `lib/runtimes/local-agent.ts`
