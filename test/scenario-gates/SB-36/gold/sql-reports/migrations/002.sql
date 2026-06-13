ALTER TABLE clients ADD COLUMN tier TEXT NOT NULL DEFAULT 'standard';
UPDATE clients SET tier = 'standard' WHERE tier = 'standard';
