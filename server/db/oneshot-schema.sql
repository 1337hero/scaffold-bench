CREATE TABLE IF NOT EXISTS oneshot_runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL CHECK(status IN ('running','done','failed','stopped')),
  model TEXT,
  endpoint TEXT,
  prompt_ids TEXT NOT NULL,
  error TEXT
);
CREATE TABLE IF NOT EXISTS oneshot_results (
  run_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT CHECK(status IN ('pending','running','done','failed','stopped')),
  output TEXT,
  finish_reason TEXT,
  wall_time_ms INTEGER,
  first_token_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  error TEXT,
  PRIMARY KEY(run_id, prompt_id),
  FOREIGN KEY(run_id) REFERENCES oneshot_runs(id) ON DELETE CASCADE
);
