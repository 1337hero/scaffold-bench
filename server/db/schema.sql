CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL CHECK(status IN ('running','done','failed','stopped')),
  runtime TEXT NOT NULL,
  model TEXT,
  endpoint TEXT,
  system_prompt_hash TEXT,
  scenario_ids TEXT NOT NULL,
  total_points INTEGER,
  max_points INTEGER,
  report_path TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS scenario_runs (
  run_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  category TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT CHECK(status IN ('pending','running','pass','partial','fail','stopped')),
  points INTEGER,
  max_points INTEGER,
  wall_time_ms INTEGER,
  first_token_ms INTEGER,
  tool_call_count INTEGER,
  model_metrics_json TEXT,
  evaluation_json TEXT,
  error TEXT,
  PRIMARY KEY(run_id, scenario_id),
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS run_events (
  run_id TEXT NOT NULL,
  scenario_id TEXT,
  seq INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(run_id, seq),
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE INDEX IF NOT EXISTS idx_events_scenario ON run_events(run_id, scenario_id, seq);
