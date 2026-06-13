import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-31-woo-double-discount.ts";
import { assertGate, readThenEdit } from "./_harness.ts";
import { hasTool } from "../../lib/scenarios/_shared/toolchain.js";

const here = import.meta.dir;

describe("SB-31 woo-double-discount gate", () => {
  it.skipIf(!hasTool("php"))(
    "gold ≥ 9, broken ≤ 4",
    async () => {
      const result = await assertGate({
        scenario,
        goldDir: join(here, "SB-31", "gold"),
        brokenDir: join(here, "SB-31", "broken"),
        goldToolCalls: readThenEdit([
          "playground/php-wp/functions.php",
          "playground/php-wp/inc/pricing.php",
        ]),
        brokenToolCalls: readThenEdit(["playground/php-wp/functions.php"]),
      });

      expect(result.gold).toBeGreaterThanOrEqual(9);
      expect(result.broken).toBeLessThanOrEqual(4);
    },
    30_000
  );
});
