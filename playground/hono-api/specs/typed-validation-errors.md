# Typed Validation Errors for POST /users

## Problem

`POST /users` (registration) currently does a loose `if (!email || !password)`
check and returns a generic `400`. We want structured, field-level validation
so clients can show errors next to the right input. Use **zod** (already a
dependency) to validate and emit a typed error response.

## Behavior

- `POST /users` body: `{ email: string, password: string }`.
- Validate with zod:
  - `email` must be a valid email address.
  - `password` must be at least 8 characters.
- On validation failure, return **422** with this exact shape:
  ```json
  { "error": { "code": "validation", "fields": { "<field>": "<message>" } } }
  ```
  `fields` contains an entry for **each** invalid field (so a request missing
  both gives two entries). Do not create the user when validation fails.
- On success: unchanged — hash the password, insert, return `{ id, email }`
  with `201`. Duplicate email still returns `409` with code `"conflict"`.

## Constraints

- Import `z` from `zod`. Derive the field messages from zod's parse result;
  do not hand-roll the validation conditions.
- Use the existing `AppError` for the duplicate-email `409` only. The `422`
  validation response is the structured shape above (it does not have to go
  through `AppError`).
- All SQL parameterized.

## File layout

- **Edit:** `src/routes/users.ts` only.

## Done when

- Invalid email → 422 with `error.fields.email` set.
- Short password → 422 with `error.fields.password` set.
- Missing both → 422 with both fields present, and no user row created.
- Valid input → 201 and the user exists.
- Duplicate email → 409 `conflict`.
