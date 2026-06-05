// The mutation the route action should own. Network is disabled in the bench, so
// callers inject `post`. The route action must validate, call post exactly once,
// and return a normalized { ok, id } | { ok: false, error } result the form can
// render — instead of the component calling post directly in an onClick.
export type PostFn = (path: string, body: unknown) => Promise<{ id: string }>;

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

export type CreateProjectInput = { name: string };

// Validation rule (already correct — do not change).
export function validateProject(input: CreateProjectInput): string | null {
  if (input.name.trim() === "") return "Name is required";
  return null;
}
