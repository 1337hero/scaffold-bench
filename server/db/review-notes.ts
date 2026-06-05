import { getDb } from "./migrations.ts";

export interface ReviewNoteRow {
  run_id: string;
  scenario_id: string;
  notes: string | null;
  model: string | null;
  created_at: number | null;
}

export function upsertReviewNotes(row: ReviewNoteRow): void {
  const db = getDb();
  db.run(
    `INSERT INTO review_notes (run_id, scenario_id, notes, model, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(run_id, scenario_id) DO UPDATE SET
       notes = COALESCE(excluded.notes, notes),
       model = COALESCE(excluded.model, model),
       created_at = COALESCE(excluded.created_at, created_at)`,
    [row.run_id, row.scenario_id, row.notes ?? null, row.model ?? null, row.created_at ?? null]
  );
}

export function getReviewNotes(runId: string, scenarioId?: string): ReviewNoteRow[] {
  const db = getDb();
  if (scenarioId === undefined) {
    return db
      .query<ReviewNoteRow, [string]>("SELECT * FROM review_notes WHERE run_id = ?")
      .all(runId);
  }
  return db
    .query<
      ReviewNoteRow,
      [string, string]
    >("SELECT * FROM review_notes WHERE run_id = ? AND scenario_id = ?")
    .all(runId, scenarioId);
}
