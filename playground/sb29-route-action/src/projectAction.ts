import { validateProject, type ActionResult, type CreateProjectInput, type PostFn } from "./createProject";

// BROKEN: the route's create action is not implemented — it just echoes a
// success without validating or calling the server. The component currently
// works around this by calling `post` itself in an onClick handler, which means
// the route action doesn't own the mutation. Implement this action so it:
//   1. validates the input (reuse validateProject)
//   2. calls post("/projects", input) exactly once on valid input
//   3. returns { ok: true, id } on success and { ok: false, error } otherwise
export async function projectAction(
  _post: PostFn,
  input: CreateProjectInput
): Promise<ActionResult> {
  return { ok: true, id: "stub" };
}
