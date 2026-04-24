import { Hono } from "hono";
import { scenarios } from "../../lib/scenarios.ts";

export const scenariosRouter = new Hono();

scenariosRouter.get("/", (c) => {
  return c.json(
    scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      maxPoints: s.maxPoints ?? 2,
      prompt: s.prompt,
    }))
  );
});
