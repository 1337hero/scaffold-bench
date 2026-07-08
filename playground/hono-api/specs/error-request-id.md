# Add requestId to Error Responses (Without Breaking Other Subsystems)

## Problem

Support wants a correlation id on every error response so they can match a
client report to server logs. Add a `requestId` to the JSON error body produced
by the shared error middleware. This middleware is used by **every** subsystem
(users, sessions, items), so the existing `error.code` and `error.message`
fields MUST keep working exactly as before.

## Behavior

- `errorMiddleware` in `src/lib/errors.ts` currently returns:
  ```json
  { "error": { "code": "...", "message": "..." } }
  ```
- Change it so every error body also includes a `requestId` string:
  ```json
  { "error": { "code": "...", "message": "...", "requestId": "<id>" } }
  ```
- The `requestId` may be any non-empty string (e.g. `crypto.randomUUID()`).
- `code` and `message` must remain present and unchanged in meaning. The HTTP
  status codes must not change.

## Constraints

- Edit `src/lib/errors.ts` only. Do not touch the route files.
- Keep the `AppError` class and its constructor signature intact.
- Both the `AppError` branch and the generic 500 branch must include
  `requestId`.

## File layout

- **Edit:** `src/lib/errors.ts` only.

## Done when

- Existing error responses across users/sessions/items still carry the same
  `error.code` and `error.message` (other subsystems unbroken).
- Every error body now also has a non-empty `error.requestId`.
