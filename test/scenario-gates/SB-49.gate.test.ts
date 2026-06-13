import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-49-rust-borrow.ts";
import { assertGate, bashCall, readThenEdit } from "./_harness.ts";
import { hasTool } from "../../lib/scenarios/_shared/toolchain.js";

const here = import.meta.dir;

describe("SB-49 rust-borrow gate", () => {
  it.skipIf(!hasTool("cargo"))(
    "gold >= 9, broken <= 4",
    async () => {
      const LIB = "playground/rust-lib/src/lib.rs";

      const goldToolCalls = [
        { name: "read", args: JSON.stringify({ path: LIB }), turn: 0 },
        bashCall("cargo check", 1, 1),
        {
          name: "edit",
          args: JSON.stringify({ path: LIB, old_str: "", new_str: "" }),
          turn: 2,
        },
      ];

      const result = await assertGate({
        scenario,
        goldDir: join(here, "SB-49", "gold"),
        brokenDir: join(here, "SB-49", "broken"),
        goldToolCalls,
        brokenToolCalls: readThenEdit([LIB]),
      });

      expect(result.gold).toBeGreaterThanOrEqual(9);
      expect(result.broken).toBeLessThanOrEqual(4);
    },
    60_000
  );
});
