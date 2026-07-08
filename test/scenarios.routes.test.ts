import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { scenariosRouter } from "../server/routes/scenarios.ts";

describe("scenarios routes", () => {
  test("GET / defaults track to execution when a scenario doesn't set one", async () => {
    const app = new Hono();
    app.route("/", scenariosRouter);

    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; track: string }[];
    expect(body.length).toBeGreaterThan(0);
    for (const s of body) {
      expect(["execution", "problem-solving"]).toContain(s.track);
    }
  });
});
