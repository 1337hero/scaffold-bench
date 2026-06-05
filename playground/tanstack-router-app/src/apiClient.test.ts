import { test, expect } from "bun:test";
import { fetchProjects } from "./apiClient";

test("fetchProjects performs exactly one fetch", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify([{ id: "1", name: "Apollo", status: "active" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const projects = await fetchProjects();
    expect(calls).toBe(1);
    expect(projects).toHaveLength(1);
  } finally {
    globalThis.fetch = original;
  }
});
