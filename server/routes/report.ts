import { Hono } from "hono";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildReportData } from "../../lib/report-data.ts";

export const reportRouter = new Hono();

const REPORT_PATH = join(import.meta.dir, "../../bench-report.html");

reportRouter.get("/data", (c) => {
  return c.json(buildReportData());
});

reportRouter.get("/", async (c) => {
  if (!existsSync(REPORT_PATH)) {
    return c.json({ error: "no report generated yet" }, 404);
  }
  const html = await Bun.file(REPORT_PATH).text();
  return c.html(html);
});
