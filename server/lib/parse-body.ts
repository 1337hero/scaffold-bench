import { Schema } from "effect";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";

export async function parseBody<A, I>(schema: Schema.Schema<A, I>, c: Context): Promise<A> {
  const contentType = c.req.header("content-type")?.toLowerCase() ?? "";

  const raw = contentType.includes("application/json")
    ? await c.req.json().catch(() => {
        throw new HTTPException(400, { message: "Invalid JSON body" });
      })
    : contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")
      ? await c.req.formData().then(formDataToObject)
      : (() => {
          throw new HTTPException(415, {
            message: "Unsupported content-type. Use application/json or application/x-www-form-urlencoded",
          });
        })();

  const result = Schema.decodeUnknownEither(schema)(raw);
  if (result._tag === "Left") {
    const message = String(result.left);
    throw new HTTPException(400, { message });
  }
  return result.right;
}

function formDataToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") {
      throw new HTTPException(400, { message: `Unsupported form field: ${key}` });
    }

    const parsed = parseFormScalar(value);
    const prev = out[key];
    if (prev === undefined) {
      out[key] = parsed;
    } else if (Array.isArray(prev)) {
      prev.push(parsed);
    } else {
      out[key] = [prev, parsed];
    }
  }
  return out;
}

function parseFormScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) return Number(value);
  return value;
}
