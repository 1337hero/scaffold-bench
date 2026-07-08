# Cursor Pagination for GET /items

## Problem

`GET /items` currently returns every item the user owns. Once a user has thousands of items the response is huge and slow. Paginate it with an opaque cursor.

## Behavior

- Query params: `limit` (default `20`, max `100`), `cursor` (optional string).
- Response: `{ "items": [...], "nextCursor": "..." | null }`.
- Items ordered by `id DESC` (newest first). The cursor is the id of the last item on the previous page — next page returns items with `id < cursor`.
- `nextCursor` is the id of the last item on the current page (as a string) when more items exist, otherwise `null`.
- The `deleted_at IS NULL` filter still applies.

## Constraints

- Keep the `owner_email` field on each item. The existing code loads it per-row; leave that alone — the N+1 is a separate ticket. Do not fix it here.
- All SQL must be parameterized. No interpolation of user input into query strings.
- Invalid `limit` (non-numeric, negative, zero) or invalid `cursor` (non-numeric) returns 400 via `AppError`.
- Auth unchanged — route still goes through `requireUser`.

## File layout

- **Edit:** `src/routes/items.ts` only.
- No schema changes.

## Done when

- `GET /items` with no params returns up to 20 items, newest first, with a `nextCursor` when more exist.
- `GET /items?cursor=X` returns items with `id < X`.
- `GET /items?limit=5` returns at most 5.
- `GET /items?limit=9999` caps at 100.
- End of list returns `nextCursor: null`.
- `GET /items?limit=abc` → 400.
