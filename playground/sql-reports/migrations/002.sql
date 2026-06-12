-- Bug: NOT NULL with no default, no backfill
ALTER TABLE clients ADD COLUMN tier TEXT NOT NULL;
