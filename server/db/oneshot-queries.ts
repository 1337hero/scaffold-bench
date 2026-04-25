import type { Database } from "bun:sqlite";
import { getDb } from "./migrations.ts";

function db(get: Database | undefined): Database {
  return get ?? getDb();
}

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
  run_id: string;
  prompt_id: string;
  started_at: number | null;
  finished_at: number | null;
  status: "pending" | "running" | "done" | "failed" | "stopped" | null;
  output: string | null;
  finish_reason: string | null;
  wall_time_ms: number | null;
  first_token_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  error: string | null;
}

export function clearPreviousOneshot(dbRef?: Database): void {
  const d = db(dbRef);
  d.run("DELETE FROM oneshot_results");
  d.run("DELETE FROM oneshot_runs");
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
  dbRef?: Database
): string {
  const d = db(dbRef);
  d.run(
    `INSERT INTO oneshot_runs (id, started_at, status, model, endpoint, prompt_ids)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [params.id, params.started_at, params.status, params.model, params.endpoint, params.prompt_ids]
  );
  return params.id;
}

export function updateOneshotRun(
  id: string,
  updates: Partial<Pick<OneshotRunRow, "finished_at" | "status" | "error">>,
  dbRef?: Database
): void {
  const d = db(dbRef);
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v as string | number | null);
  d.run(`UPDATE oneshot_runs SET ${setClauses} WHERE id = ?`, [...values, id]);
}

export function upsertOneshotResult(
  row: Partial<OneshotResultRow> & { run_id: string; prompt_id: string },
  dbRef?: Database
): void {
  const d = db(dbRef);
  d.run(
    `INSERT INTO oneshot_results (run_id, prompt_id, started_at, finished_at, status, output, finish_reason, wall_time_ms, first_token_ms, prompt_tokens, completion_tokens, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, prompt_id) DO UPDATE SET
       started_at = COALESCE(excluded.started_at, started_at),
       finished_at = COALESCE(excluded.finished_at, finished_at),
       status = COALESCE(excluded.status, status),
       output = COALESCE(excluded.output, output),
       finish_reason = COALESCE(excluded.finish_reason, finish_reason),
       wall_time_ms = COALESCE(excluded.wall_time_ms, wall_time_ms),
       first_token_ms = COALESCE(excluded.first_token_ms, first_token_ms),
       prompt_tokens = COALESCE(excluded.prompt_tokens, prompt_tokens),
       completion_tokens = COALESCE(excluded.completion_tokens, completion_tokens),
       error = COALESCE(excluded.error, error)`,
    [
      row.run_id,
      row.prompt_id,
      row.started_at ?? null,
      row.finished_at ?? null,
      row.status ?? null,
      row.output ?? null,
      row.finish_reason ?? null,
      row.wall_time_ms ?? null,
      row.first_token_ms ?? null,
      row.prompt_tokens ?? null,
      row.completion_tokens ?? null,
      row.error ?? null,
    ]
  );
}

export function getLatestOneshotRun(dbRef?: Database): OneshotRunRow | null {
  const d = db(dbRef);
  return d.query<OneshotRunRow, []>("SELECT * FROM oneshot_runs ORDER BY started_at DESC LIMIT 1").get();
}

export function getOneshotResults(runId: string, dbRef?: Database): OneshotResultRow[] {
  const d = db(dbRef);
  return d
    .query<OneshotResultRow, [string]>("SELECT * FROM oneshot_results WHERE run_id = ? ORDER BY prompt_id ASC")
    .all(runId);
}

export function getOneshotRun(id: string, dbRef?: Database): OneshotRunRow | null {
  const d = db(dbRef);
  return d.query<OneshotRunRow, [string]>("SELECT * FROM oneshot_runs WHERE id = ?").get(id);
}
