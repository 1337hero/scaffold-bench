import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-33-plugin-conflict-red-herring.ts";
import { evaluateReference } from "./_harness.ts";
import { hasTool } from "../../lib/scenarios/_shared/toolchain.js";

const here = import.meta.dir;

const GOLD_STDOUT = `
After reviewing the codebase in playground/php-wp/, I found the root cause of the broken navigation menu.

The issue is in \`inc/nav-config.php\`. The theme registers a \`wp_nav_menu_args\` filter at priority 5 that strips required keys from the arguments array — it only returns \`menu\` and \`theme_location\`, discarding other keys the menu rendering system depends on. This causes menu items to disappear.

The Plugin Boilerplate plugin is not the cause. I recommend fixing or removing the nav filter in inc/nav-config.php.
`.trim();

const BROKEN_STDOUT = `
After reviewing the issue, I believe the Plugin Boilerplate plugin is causing the navigation menu problem. The plugin likely has a conflicting hook or action.

I recommend deactivating the Plugin Boilerplate plugin and testing the navigation again. If the menu works after deactivation, you can confirm the plugin is the culprit and look for an updated version.
`.trim();

describe("SB-33 plugin-conflict-red-herring gate", () => {
  it.skipIf(!hasTool("php"))(
    "gold ≥ 9, broken ≤ 4",
    async () => {
      const goldEval = await evaluateReference({
        scenario,
        referenceDir: join(here, "SB-33", "gold"),
        stdout: GOLD_STDOUT,
        toolCalls: [
          {
            name: "read",
            args: JSON.stringify({ path: "playground/php-wp/inc/nav-config.php" }),
            turn: 0,
          },
          {
            name: "read",
            args: JSON.stringify({ path: "playground/php-wp/functions.php" }),
            turn: 1,
          },
        ],
      });

      const brokenEval = await evaluateReference({
        scenario,
        referenceDir: join(here, "SB-33", "broken"),
        stdout: BROKEN_STDOUT,
        toolCalls: [],
      });

      expect(goldEval.points).toBeGreaterThanOrEqual(9);
      expect(brokenEval.points).toBeLessThanOrEqual(4);
    },
    30_000
  );
});
