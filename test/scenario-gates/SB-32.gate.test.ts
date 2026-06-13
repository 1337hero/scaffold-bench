import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-32-template-escaping.ts";
import { assertGate, readThenEdit } from "./_harness.ts";
import { hasTool } from "../../lib/scenarios/_shared/toolchain.js";

const here = import.meta.dir;

describe("SB-32 template-escaping gate", () => {
  it.skipIf(!hasTool("php"))(
    "gold ≥ 9, broken ≤ 4",
    async () => {
      const result = await assertGate({
        scenario,
        goldDir: join(here, "SB-32", "gold"),
        brokenDir: join(here, "SB-32", "broken"),
        goldToolCalls: readThenEdit(["playground/php-wp/template-parts/contact-card.php"]),
        brokenToolCalls: [
          {
            name: "write",
            args: JSON.stringify({
              path: "playground/php-wp/template-parts/contact-card.php",
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
