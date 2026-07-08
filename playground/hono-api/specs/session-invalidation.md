# Invalidate Sessions on Password Change

## Problem

When a user changes their password we must revoke every existing session except
the one making the change. Today there is no password-change endpoint, so a
leaked session token lives until it expires even after the user "changes their
password" — there is nothing to change it.

## Behavior

- `POST /users/:id/password`
- Requires auth (existing `requireUser`).
- Body: `{ "currentPassword": string, "newPassword": string }`.
- A user may only change **their own** password. If `:id` is not the
  authenticated user's id → `403` with `AppError` code `"forbidden"`.
- If `currentPassword` does not match the stored hash → `401` with `AppError`
  code `"invalid_credentials"`.
- If `newPassword` is missing or shorter than 8 characters → `400` with
  `AppError` code `"bad_request"`.
- On success:
  - Update `users.password_hash` to a hash of `newPassword`
    (use `Bun.password.hash`).
  - Delete every session row for this user **except** the current request's
    session (identified by the `session` cookie token).
  - Return `{ ok: true }`.

## Constraints

- Use `AppError` from `src/lib/errors.ts` for every error response.
- All SQL must be parameterized.
- The current session must remain valid after the change.
- No schema changes — the `sessions` and `users` tables already have what you
  need.
- Do not modify the existing `POST /users` or `GET /users/:id` handlers.

## File layout

- **Edit:** `src/routes/users.ts` only.

## Done when

- A user with two active sessions who changes their password keeps the
  request's session working and finds the other session rejected (401).
- Wrong `currentPassword` → 401, sessions untouched.
- Changing another user's password → 403.
- `newPassword` under 8 chars → 400.
