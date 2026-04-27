ALTER TABLE scenario_runs
ADD COLUMN error_kind TEXT CHECK(error_kind IN ('infra','timeout','aborted','runtime'));
