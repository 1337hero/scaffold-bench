CREATE TABLE IF NOT EXISTS review_notes (
  run_id TEXT,
  scenario_id TEXT,
  notes TEXT,
  model TEXT,
  created_at INTEGER,
  PRIMARY KEY(run_id, scenario_id)
);
