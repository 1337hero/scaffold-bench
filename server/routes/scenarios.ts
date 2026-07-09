import { Hono } from "hono";
import { scenarios } from "../../lib/scenarios/index.js";

export const scenariosRouter = new Hono();

scenariosRouter.get("/", (c) => {
  return c.json(
    scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      difficulty: s.difficulty,
      maxPoints: s.maxPoints ?? 10,
      prompt: s.prompt,
      track: s.track ?? "execution",
    }))
  );
});
