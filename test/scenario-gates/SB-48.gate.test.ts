import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import scenario, { ITEMS_TEST_CONTENT } from "../../lib/scenarios/SB-48-go-json-endpoint.ts";
import { assertGate, readThenEdit } from "./_harness.ts";
import { hasTool } from "../../lib/scenarios/_shared/toolchain.js";

const here = import.meta.dir;

describe("SB-48 go-json-endpoint gate", () => {
  it("buildPrompt seeds items_test.go into the run's playground", async () => {
    const workDir = await mkdtemp(join(tmpdir(), "sb-48-buildprompt-"));
    try {
      const prompt = await scenario.buildPrompt?.({ playgroundDir: workDir });
      expect(prompt).toBe(scenario.prompt);
      const seeded = await Bun.file(join(workDir, "playground/go-api/items_test.go")).text();
      expect(seeded).toBe(ITEMS_TEST_CONTENT);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!hasTool("go"))(
    "gold >= 9, broken <= 4",
    async () => {
      const ITEMS_TEST = "playground/go-api/items_test.go";
      const ITEMS = "playground/go-api/items.go";
      const HANDLERS = "playground/go-api/handlers.go";

      const result = await assertGate({
        scenario,
        goldDir: join(here, "SB-48", "gold"),
        brokenDir: join(here, "SB-48", "broken"),
        goldToolCalls: [
          { name: "read", args: JSON.stringify({ path: ITEMS_TEST }), turn: 0 },
          {
            name: "edit",
            args: JSON.stringify({ path: ITEMS, old_str: "", new_str: "" }),
            turn: 1,
          },
          {
            name: "edit",
            args: JSON.stringify({ path: HANDLERS, old_str: "", new_str: "" }),
            turn: 2,
          },
        ],
        brokenToolCalls: readThenEdit([ITEMS]),
      });

      expect(result.gold).toBeGreaterThanOrEqual(9);
      expect(result.broken).toBeLessThanOrEqual(4);
    },
    60_000
  );
});
