import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-24-react-hook-form-zod-resolver.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-24 react-hook-form-zod-resolver gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-24", "gold"),
    brokenDir: join(here, "SB-24", "broken"),
    goldToolCalls: readThenEdit(["playground/frontend/SignupForm.tsx"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
