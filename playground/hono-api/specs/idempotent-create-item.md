# Idempotent POST /items

## Problem

Clients retry `POST /items` on flaky networks and end up creating duplicate
items. Make the create endpoint idempotent via an `Idempotency-Key` request
header so a retry returns the original result instead of inserting again.

## Behavior

- `POST /items` accepts an optional `Idempotency-Key` request header.
- When the header is **absent**, behave exactly as today: create the item,
  return `{ id, name }` with `201`.
- When the header is **present**:
  - First request with that key for this user: create the item, persist the
    mapping `(user, key) -> created item id`, return `{ id, name }` with `201`.
  - Any later request with the **same key from the same user**: do NOT insert a
    second row. Return the originally created item as `{ id, name }` with `200`.
  - The same key used by a **different user** is independent (keys are scoped
    per user).

## Constraints

- Add an `idempotency_keys` table in `schema.sql`. It must be created with
  `CREATE TABLE IF NOT EXISTS` so existing databases stay compatible, and must
  not alter the existing `users`, `sessions`, or `items` tables.
- The key/user pair must be unique (a UNIQUE constraint or PRIMARY KEY).
- All SQL parameterized. Route still goes through `requireUser`.
- Do not change `GET /items` or `DELETE /items/:id`.

## File layout

- **Edit:** `schema.sql` and `src/routes/items.ts`.

## Done when

- Two identical `POST /items` with the same `Idempotency-Key` create exactly one
  row; the second response reuses the first item's id and returns `200`.
- The same key from a different user creates its own item.
- A `POST /items` with no header still creates a row and returns `201`.
