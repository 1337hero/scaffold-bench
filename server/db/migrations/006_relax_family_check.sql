-- Family is descriptive metadata, not a closed enum: scenarios added new values
-- (bug-fix, feature-add, red-herring) that the original CHECK rejected, crashing
-- run starts. Rebuild scenario_runs without the family CHECK so the column matches
-- how the app and web-ui already treat it — a free string.

CREATE TABLE scenario_runs_new (
  run_id TEXT NOT NULL REFERENCES runs(id),
  scenario_id TEXT NOT NULL,
  category TEXT,
  family TEXT NOT NULL DEFAULT 'regex-style',
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT CHECK(status IN ('pending','running','pass','partial','fail','stopped')),

  points INTEGER,
  max_points INTEGER,
  rubric_kind TEXT NOT NULL DEFAULT '10pt' CHECK(rubric_kind IN ('10pt','custom-5pt','custom-3pt')),

  correctness INTEGER,
  scope INTEGER,
  pattern INTEGER,
  verification INTEGER,
  cleanup INTEGER,

  wall_time_ms INTEGER,
  first_token_ms INTEGER,
  tool_call_count INTEGER,
  model_metrics_json TEXT,
  evaluation_json TEXT,
  error_kind TEXT CHECK(error_kind IN ('infra','timeout','aborted','runtime')),
  error TEXT,
  PRIMARY KEY(run_id, scenario_id)
);

INSERT INTO scenario_runs_new SELECT * FROM scenario_runs;
DROP TABLE scenario_runs;
ALTER TABLE scenario_runs_new RENAME TO scenario_runs;
CREATE INDEX idx_scenario_runs_by_scenario ON scenario_runs(scenario_id);
