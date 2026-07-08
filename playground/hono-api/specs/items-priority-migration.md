# Additive Migration: items.priority (backward compatible)

## Problem

We need a `priority` column on `items` so the UI can sort by importance. The
catch: the column must be added by an **additive migration** that runs at
startup, WITHOUT editing `schema.sql` and WITHOUT breaking any existing read or
write that doesn't mention `priority`.

## Where the pieces live

- The DB is created in `src/db.ts` (`createDb`), which executes `schema.sql`.
- `schema.sql` is the baseline schema and is treated as frozen — do not edit it.

## What to build

- **Create** `src/migrations.ts` exporting `runMigrations(db: DB): void`.
  - It adds a `priority` column to `items`: `INTEGER NOT NULL DEFAULT 0`.
  - It MUST be idempotent: running it more than once (or against a DB that
    already has the column) must not throw. Detect whether the column already
    exists (e.g. via `PRAGMA table_info(items)`) before adding it.
- **Edit** `src/db.ts` so `createDb` calls `runMigrations(db)` after loading the
  baseline schema.

## Compatibility requirements

- Existing writes that omit `priority` (e.g.
  `INSERT INTO items (owner_id, name) VALUES (?, ?)`) must still succeed and get
  the default `priority = 0`.
- Existing reads that don't select `priority` must still succeed unchanged.
- New reads selecting `priority` must return the stored value.
- A new write that sets `priority` explicitly must persist it.

## File layout

- **Create:** `src/migrations.ts`.
- **Edit:** `src/db.ts`.
- Do not modify `schema.sql` or any route file.

## Done when

- `createDb()` produces an `items` table that has a `priority` column.
- Inserting without `priority` works and yields `priority = 0`.
- Inserting with an explicit `priority` persists it.
- Calling `runMigrations` twice does not throw.
