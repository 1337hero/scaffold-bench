-- Behavioral self-testing metrics (Verify %). NULL = not yet backfilled.
ALTER TABLE scenario_runs ADD COLUMN bash_calls INTEGER;
ALTER TABLE scenario_runs ADD COLUMN post_change_bash_calls INTEGER;
ALTER TABLE scenario_runs ADD COLUMN verify_passes INTEGER;
ALTER TABLE scenario_runs ADD COLUMN mutated INTEGER;
