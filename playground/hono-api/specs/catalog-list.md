# Paginated Catalog Listing (filter + sort + cursor)

## Problem

Add a new `GET /catalog` endpoint that lists the authenticated user's items with
keyset (cursor) pagination, an optional name filter, and a switchable sort. This
is a _separate_ endpoint from `GET /items` — do not touch `items.ts`.

## Where the pieces live

- Session auth guard: `requireUser` in `src/lib/auth.ts` (sets `c.get("user")`).
- DB handle type: `DB` in `src/db.ts` (the value is on `c.get("db")`).
- Structured errors: `AppError` in `src/lib/errors.ts`.
- How routes are mounted: see `src/index.ts` (e.g. `app.route("/", itemsRoutes)`).

## Behavior

- `GET /catalog`
- Requires auth via the existing `requireUser` guard.
- Lists ONLY the caller's items where `deleted_at IS NULL`.
- Query params:
  - `limit` — default `20`, max `100`.
  - `cursor` — optional opaque string; the cursor of the last row on the
    previous page. The next page returns rows strictly _after_ that cursor in
    the active sort order.
  - `sort` — `created` (default) or `name`.
    - `created` orders by `id DESC` (newest first); cursor is the last `id`,
      next page returns `id < cursor`.
    - `name` orders by `name ASC, id ASC`; the cursor is still the last row's
      `id`. Resolve that row's name and continue from the `(name, id)` tuple:
      the next page returns rows where `name > lastName OR (name = lastName AND
id > lastId)`.
- Response: `{ "items": [{ id, name, created_at }...], "nextCursor": "<id>" | null }`.
  - `nextCursor` is the last row's id (as a string) when a full page was
    returned and more rows may exist; otherwise `null`.

## Pagination invariants

- Pages must not overlap and must not skip rows: walking pages by feeding
  `nextCursor` back as `cursor` yields every matching row exactly once.
- Ordering is stable across pages for a given `sort`.

## Constraints

- Reuse `requireUser` from `src/lib/auth.ts`; do not re-query the sessions table
  or re-validate the cookie yourself.
- Import the `DB` type from `src/db.ts`; do not declare your own DB type.
- All SQL parameterized. No string interpolation of user input.
- Invalid `limit` (non-numeric, negative, zero) or invalid `cursor`
  (non-numeric) → 400 via `AppError`.

## File layout

- **Create:** `src/routes/catalog.ts` exporting `catalogRoutes`.
- **Edit:** `src/index.ts` to mount it.
- Do not modify other files (especially not `items.ts`).

## Done when

- `GET /catalog` returns up to 20 of the caller's non-deleted items, newest
  first, with a `nextCursor` when a full page is returned.
- `GET /catalog?cursor=X` (created sort) returns items with `id < X`.
- `GET /catalog?sort=name` orders by name ascending and paginates without
  overlaps or gaps.
- `GET /catalog?limit=9999` caps the page at 100.
- `GET /catalog?limit=abc` → 400.
