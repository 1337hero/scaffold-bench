# 2026-07-01 — overnight runner script

**Task:** Automate overnight runs to bring all local models to 5 runs each.

**Shape:** Feature — new script `scripts/run-to-target.ts`.

**Changed:**
- `scripts/run-to-target.ts` (new) — overnight batch runner that queries DB run counts,
  computes deficits to a target (default 5), runs only the needed additional runs via
  the same API the piped runner uses, then shuts down. Supports `--target`, `--warmup`,
  `--include-remote`, `--exclude` (repeatable), and a hard-coded `EXCLUDE` set.
- `.scaffold/memory/STATE.md` — focus → overnight runs, next up updated, key files added.

**Verification ledger:**
- Ran the script live — server started, 18 models discovered needing 67 runs, plan printed
  correctly. Aborted before actual inference runs (test pass only).
- Script parses and executes without TypeScript/runtime errors.

**Proof:** No automated test (infra script). Manual verification: `bun scripts/run-to-target.ts`
shows the plan; run it for real to prove execution.

**Derived decisions:**
- `AntAngelMed` excluded per human instruction (model not worth benchmarking).
- Wrote a dedicated script rather than reusing `run-piped-models.ts` in a loop because
  deficits vary per model — a single script that computes and tracks progress is simpler
  than orchestrating multiple piped invocations.

**Open / next:**
- Kick off the overnight run: `bun scripts/run-to-target.ts --warmup=30`
- When done, review results and add any that look suspicious to the exclude list.