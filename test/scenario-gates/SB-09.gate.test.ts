import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-09-frontend-reuse-existing-abstraction.ts";
import { assertGate } from "./_harness.ts";

const here = import.meta.dir;

test("SB-09 frontend-reuse-existing-abstraction gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-09", "gold"),
    brokenDir: join(here, "SB-09", "broken"),
    goldToolCalls: [
      { name: "grep", args: "{}", turn: 0 },
      {
        name: "read",
        args: JSON.stringify({ path: "playground/frontend/TeamSidebar.tsx" }),
        turn: 1,
      },
      {
        name: "edit",
        args: JSON.stringify({
          path: "playground/frontend/TeamSidebar.tsx",
          old_str: "",
          new_str: "",
        }),
        turn: 2,
      },
    ],
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
