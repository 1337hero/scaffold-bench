# Fix N+1 in GET /items

## Problem

`GET /items` is slow under load. Profiling shows one SELECT per item to fetch `owner_email`. At 500 items that's 501 queries per request. Fix it with a single JOIN.

## Fix

Replace the owner-per-row loop in `src/routes/items.ts` with a single SQL query that JOINs `users` and returns `owner_email` inline.

## Constraints

- Response shape must not change: `{ "items": [{ id, owner_id, name, created_at, owner_email }] }`.
- Keep the `deleted_at IS NULL` filter.
- Keep `ORDER BY id DESC`.
- Keep parameterized queries (nothing to parameterize here — don't introduce user input).
- Do **not** modify `POST /items` or `DELETE /items/:id`.
- Do **not** add pagination — separate ticket.

## File layout

- **Edit:** `src/routes/items.ts` only.

## Done when

- `GET /items` issues exactly one SQL query for the list (no per-row subquery).
- Response shape is unchanged.
- The `.map(...)` loop that ran a per-row `SELECT email FROM users` is gone.
