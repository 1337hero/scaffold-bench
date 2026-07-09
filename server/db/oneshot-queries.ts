import type { Database } from "bun:sqlite";
import { getDb } from "./migrations.ts";
import { updateRow } from "./queries.ts";

export interface OneshotRunRow {
  id: string;
  started_at: number;
  finished_at: number | null;
  status: "running" | "done" | "failed" | "stopped";
  model: string | null;
  endpoint: string | null;
  prompt_ids: string;
  error: string | null;
}

export interface OneshotResultRow {
  prompt_id: string;
  run_id: string;
  model: string | null;
  started_at: number | null;
  finished_at: number | null;
  status: "pending" | "running" | "done" | "failed" | "stopped" | null;
  output: string | null;
  finish_reason: string | null;
  wall_time_ms: number | null;
  first_token_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  artifact_path: string | null;
  error: string | null;
}

export function clearPreviousOneshot(db: Database = getDb()): void {
  db.run("DELETE FROM oneshot_results");
  db.run("DELETE FROM oneshot_runs");
}

/** Drop old run rows and reset only the prompts about to run; other results survive. */
export function resetOneshotPrompts(
  params: { run_id: string; model: string | null; promptIds: string[] },
  db: Database = getDb()
): void {
  db.run("DELETE FROM oneshot_runs");
  for (const promptId of params.promptIds) {
    db.run(
      `INSERT OR REPLACE INTO oneshot_results (prompt_id, run_id, model, status)
       VALUES (?, ?, ?, 'pending')`,
      [promptId, params.run_id, params.model]
    );
  }
}

export function insertOneshotRun(
  params: {
    id: string;
    started_at: number;
    status: "running" | "done" | "failed" | "stopped";
    model: string | null;
    endpoint: string | null;
    prompt_ids: string;
  },
  db: Database = getDb()
): string {
  db.run(
    `INSERT INTO oneshot_runs (id, started_at, status, model, endpoint, prompt_ids)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [params.id, params.started_at, params.status, params.model, params.endpoint, params.prompt_ids]
  );
  return params.id;
}

export function updateOneshotRun(
  id: string,
  updates: Partial<Pick<OneshotRunRow, "finished_at" | "status" | "error">>,
  db: Database = getDb()
): void {
  updateRow("oneshot_runs", id, updates, db);
}

export function upsertOneshotResult(
  row: Partial<OneshotResultRow> & { run_id: string; prompt_id: string },
  db: Database = getDb()
): void {
  db.run(
    `INSERT INTO oneshot_results (prompt_id, run_id, model, started_at, finished_at, status, output, finish_reason, wall_time_ms, first_token_ms, prompt_tokens, completion_tokens, artifact_path, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(prompt_id) DO UPDATE SET
       run_id = excluded.run_id,
       model = COALESCE(excluded.model, model),
       started_at = COALESCE(excluded.started_at, started_at),
       finished_at = COALESCE(excluded.finished_at, finished_at),
       status = COALESCE(excluded.status, status),
       output = COALESCE(excluded.output, output),
       finish_reason = COALESCE(excluded.finish_reason, finish_reason),
       wall_time_ms = COALESCE(excluded.wall_time_ms, wall_time_ms),
       first_token_ms = COALESCE(excluded.first_token_ms, first_token_ms),
       prompt_tokens = COALESCE(excluded.prompt_tokens, prompt_tokens),
       completion_tokens = COALESCE(excluded.completion_tokens, completion_tokens),
       artifact_path = COALESCE(excluded.artifact_path, artifact_path),
       error = COALESCE(excluded.error, error)`,
    [
      row.prompt_id,
      row.run_id,
      row.model ?? null,
      row.started_at ?? null,
      row.finished_at ?? null,
      row.status ?? null,
      row.output ?? null,
      row.finish_reason ?? null,
      row.wall_time_ms ?? null,
      row.first_token_ms ?? null,
      row.prompt_tokens ?? null,
      row.completion_tokens ?? null,
      row.artifact_path ?? null,
      row.error ?? null,
    ]
  );
}

export function getLatestOneshotRun(db: Database = getDb()): OneshotRunRow | null {
  return db
    .query<OneshotRunRow, []>("SELECT * FROM oneshot_runs ORDER BY started_at DESC LIMIT 1")
    .get();
}

/** Latest result per prompt, across runs. */
export function getOneshotResults(db: Database = getDb()): OneshotResultRow[] {
  return db
    .query<OneshotResultRow, []>("SELECT * FROM oneshot_results ORDER BY prompt_id ASC")
    .all();
}

export function getOneshotRun(id: string, db: Database = getDb()): OneshotRunRow | null {
  return db.query<OneshotRunRow, [string]>("SELECT * FROM oneshot_runs WHERE id = ?").get(id);
}
