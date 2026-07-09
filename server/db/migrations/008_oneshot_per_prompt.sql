-- Oneshot results become latest-per-prompt: rerunning one prompt no longer
-- clobbers the others. Results outlive their run, so the FK to oneshot_runs goes.
CREATE TABLE oneshot_results_v2 (
  prompt_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  model TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT CHECK(status IN ('pending','running','done','failed','stopped')),
  output TEXT,
  finish_reason TEXT,
  wall_time_ms INTEGER,
  first_token_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  artifact_path TEXT,
  error TEXT
);

INSERT OR REPLACE INTO oneshot_results_v2 (
  prompt_id, run_id, model, started_at, finished_at, status, output,
  finish_reason, wall_time_ms, first_token_ms, prompt_tokens, completion_tokens, error
)
SELECT
  r.prompt_id, r.run_id, run.model, r.started_at, r.finished_at, r.status, r.output,
  r.finish_reason, r.wall_time_ms, r.first_token_ms, r.prompt_tokens, r.completion_tokens, r.error
FROM oneshot_results r
LEFT JOIN oneshot_runs run ON run.id = r.run_id
ORDER BY COALESCE(r.started_at, 0) ASC;

DROP TABLE oneshot_results;
ALTER TABLE oneshot_results_v2 RENAME TO oneshot_results;
