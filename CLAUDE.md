# scaffold-bench

## Removing a single model's runs

Run data lives in **two places**: the SQLite DB (`scaffold-bench.db`) and JSON reports in `results/`.

### 1. Find the run(s) in the DB

```sh
sqlite3 scaffold-bench.db "SELECT id, model, status, datetime(started_at/1000,'unixepoch') FROM runs WHERE model='<ModelName>';"
```

### 2. Delete the run + children (cascade is NOT enforced — delete manually, in order)

A `runs` row is referenced by `scenario_runs` and `run_events` (both keyed on `run_id`).
`oneshot_runs`/`oneshot_results` are a separate subsystem — not tied to the `runs` table.

```sh
RID=<run-id>
sqlite3 scaffold-bench.db "
BEGIN;
DELETE FROM run_events   WHERE run_id='$RID';
DELETE FROM scenario_runs WHERE run_id='$RID';
DELETE FROM runs          WHERE id='$RID';
COMMIT;"
```

### 3. Remove the matching JSON report(s)

Reports are `results/<epoch-ms>-local.json` and contain the model name (not the run id).
Confirm a file is exclusively the target model before trashing:

```sh
grep -rl '"<ModelName>"' results/
grep -o '"model": "[^"]*"' results/<file>.json | sort -u   # verify single model
gio trash results/<file>.json
```

### 4. Verify

```sh
sqlite3 scaffold-bench.db "SELECT count(*) FROM runs WHERE model='<ModelName>';"
grep -rl '<ModelName>' results/ || echo "no results remain"
```
