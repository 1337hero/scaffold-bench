import { Hono } from "hono";
import { buildReportData } from "../../lib/report-data.ts";

export const reportRouter = new Hono();

reportRouter.get("/data", (c) => {
  return c.json(buildReportData());
});
