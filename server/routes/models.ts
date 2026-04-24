import { Hono } from "hono";
import { listModels } from "../models/discovery.ts";

export const modelsRouter = new Hono();

modelsRouter.get("/", async (c) => {
  const models = await listModels();
  return c.json(models);
});
