import { Hono } from "hono";
import { buildReportData, type ScenarioRunFilters } from "../../lib/report-data.ts";

export const reportRouter = new Hono();

reportRouter.get("/data", (c) => {
  const stacks = c.req.query("stacks");
  const filters: ScenarioRunFilters = {
    stacks: stacks ? stacks.split(",").filter(Boolean) : undefined,
    taskType: c.req.query("taskType"),
    difficulty: c.req.query("difficulty"),
    surface: c.req.query("surface"),
    signalType: c.req.query("signalType"),
    evaluatorKind: c.req.query("evaluatorKind"),
  };
  return c.json(buildReportData(filters));
});
