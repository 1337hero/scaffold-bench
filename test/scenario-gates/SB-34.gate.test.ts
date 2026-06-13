import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-34-build-a-plugin.ts";
import { assertGate } from "./_harness.ts";
import { hasTool } from "../../lib/scenarios/_shared/toolchain.js";

const here = import.meta.dir;

describe("SB-34 build-a-plugin gate", () => {
  it.skipIf(!hasTool("php"))(
    "gold ≥ 9, broken ≤ 4",
    async () => {
      const result = await assertGate({
        scenario,
        goldDir: join(here, "SB-34", "gold"),
        brokenDir: join(here, "SB-34", "broken"),
        goldToolCalls: [
          {
            name: "read",
            args: JSON.stringify({ path: "playground/php-wp/wp-stubs.php" }),
            turn: 0,
          },
          {
            name: "write",
            args: JSON.stringify({
              path: "playground/php-wp/plugins/recent-posts-widget.php",
              content: "",
            }),
            turn: 1,
          },
        ],
        brokenToolCalls: [
          {
            name: "write",
            args: JSON.stringify({
              path: "playground/php-wp/plugins/recent-posts-widget.php",
              content: "",
            }),
            turn: 0,
          },
        ],
      });

      expect(result.gold).toBeGreaterThanOrEqual(9);
      expect(result.broken).toBeLessThanOrEqual(4);
    },
    30_000
  );
});
