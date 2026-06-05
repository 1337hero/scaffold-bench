import { type ActionResult, type CreateProjectInput, type PostFn } from "./createProject";

export async function projectAction(post: PostFn, input: CreateProjectInput): Promise<ActionResult> {
  // call the server and return the id
  console.log("creating", input);
  const { id } = await post("/projects", input);
  return { ok: true, id };
}
