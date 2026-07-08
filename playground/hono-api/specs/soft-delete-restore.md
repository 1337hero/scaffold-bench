# Restore Soft-Deleted Items

## Problem

The `items` table already has a `deleted_at` column, and `DELETE /items/:id` does a soft delete. Users ask to undo. Build the restore endpoint using the column that already exists — no schema changes.

## Behavior

- `POST /items/:id/restore`
- Requires auth (existing `requireUser`).
- Only the item's owner can restore it.
- If the item exists and is soft-deleted: set `deleted_at = NULL`, return `{ ok: true, id }`.
- If the item doesn't exist, or belongs to a different user: `404` with `AppError` code `"not_found"`.
- If the item exists and is not deleted: `409` with `AppError` code `"not_deleted"`.

## Constraints

- Use `AppError` from `src/lib/errors.ts` for every error response.
- No schema changes. The column exists; use it.
- Do not modify the existing `GET /items`, `POST /items`, or `DELETE /items/:id` handlers.

## File layout

- **Edit:** `src/routes/items.ts` only.

## Done when

- Owner can restore a previously-deleted item.
- A restored item appears in subsequent `GET /items` responses.
- Non-owner (or unknown id) → 404.
- Restoring an active item → 409 with code `"not_deleted"`.
