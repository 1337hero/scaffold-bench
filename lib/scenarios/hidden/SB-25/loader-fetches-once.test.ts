// Hidden correctness test for SB-25. Runs from the fixture's __hidden__/ subdir,
// so it imports the submitted apiClient via a ../ relative path. Proves the data
// source the route loader owns fetches exactly once (not N times like a per-row
// or per-render fetch would).
import { test, expect } from "bun:test";
import { fetchProjects } from "../src/apiClient";

test("fetchProjects issues a single network request", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify([
        { id: "a", name: "Atlas", status: "active" },
        { id: "b", name: "Borealis", status: "paused" },
      ]),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
  try {
    const projects = await fetchProjects();
    expect(calls).toBe(1);
    expect(projects).toHaveLength(2);
  } finally {
    globalThis.fetch = original;
  }
});
