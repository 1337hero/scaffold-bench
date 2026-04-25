import { Schema } from "effect";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";

export async function parseBody<A, I>(schema: Schema.Schema<A, I>, c: Context): Promise<A> {
  const raw = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  });
  const result = Schema.decodeUnknownEither(schema)(raw);
  if (result._tag === "Left") {
    const message = String(result.left);
    throw new HTTPException(400, { message });
  }
  return result.right;
}
