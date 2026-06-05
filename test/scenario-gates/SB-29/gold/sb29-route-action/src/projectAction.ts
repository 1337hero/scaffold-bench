import {
  validateProject,
  type ActionResult,
  type CreateProjectInput,
  type PostFn,
} from "./createProject";

export async function projectAction(
  post: PostFn,
  input: CreateProjectInput
): Promise<ActionResult> {
  const error = validateProject(input);
  if (error) return { ok: false, error };
  try {
    const { id } = await post("/projects", input);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}
