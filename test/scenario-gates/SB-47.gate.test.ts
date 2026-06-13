import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-47-go-nil-map.ts";
import { assertGate, bashCall, readThenEdit } from "./_harness.ts";
import { hasTool } from "../../lib/scenarios/_shared/toolchain.js";

const here = import.meta.dir;

describe("SB-47 go-nil-map gate", () => {
  it.skipIf(!hasTool("go"))("gold >= 9, broken <= 4", async () => {
    const HANDLERS = "playground/go-api/handlers.go";

    const goldToolCalls = [
      { name: "read", args: JSON.stringify({ path: HANDLERS }), turn: 0 },
      bashCall("go test ./...", 1, 1),
      {
        name: "edit",
        args: JSON.stringify({ path: HANDLERS, old_str: "", new_str: "" }),
        turn: 2,
      },
      bashCall("go test ./...", 3, 0),
    ];

    const brokenToolCalls = [
      { name: "read", args: JSON.stringify({ path: HANDLERS }), turn: 0 },
      bashCall("go test ./...", 1, 1),
      {
        name: "edit",
        args: JSON.stringify({ path: HANDLERS, old_str: "", new_str: "" }),
        turn: 2,
      },
      bashCall("go test ./...", 3, 0),
    ];

    const result = await assertGate({
      scenario,
      goldDir: join(here, "SB-47", "gold"),
      brokenDir: join(here, "SB-47", "broken"),
      goldToolCalls,
      brokenToolCalls,
    });

    expect(result.gold).toBeGreaterThanOrEqual(9);
    expect(result.broken).toBeLessThanOrEqual(4);
  }, 60_000);
});
