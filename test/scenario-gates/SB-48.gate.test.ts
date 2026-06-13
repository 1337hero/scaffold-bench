import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-48-go-json-endpoint.ts";
import { assertGate, readThenEdit } from "./_harness.ts";
import { hasTool } from "../../lib/scenarios/_shared/toolchain.js";

const here = import.meta.dir;

describe("SB-48 go-json-endpoint gate", () => {
  it.skipIf(!hasTool("go"))("gold >= 9, broken <= 4", async () => {
    const ITEMS_TEST = "playground/go-api/items_test.go";
    const ITEMS = "playground/go-api/items.go";

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
      ],
      brokenToolCalls: readThenEdit([ITEMS]),
    });

    expect(result.gold).toBeGreaterThanOrEqual(9);
    expect(result.broken).toBeLessThanOrEqual(4);
  }, 60_000);
});
