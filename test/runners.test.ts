import { describe, it, expect } from "bun:test";
import { hasTool } from "../lib/scenarios/_shared/toolchain.js";
import { phpLint } from "../lib/scenarios/_shared/runners/php.js";
import { bashNoExec, shellcheckFile } from "../lib/scenarios/_shared/runners/shell.js";
import { renderLiquid } from "../lib/scenarios/_shared/runners/liquid.js";
import {
  declarationsFor,
  hasImportant,
  mediaQueryBlocks,
  customPropertyScope,
} from "../lib/scenarios/_shared/runners/css.js";

describe("runners", () => {
  describe("php", () => {
    it.skipIf(!hasTool("php"))("phpLint validates valid PHP", async () => {
      const result = await phpLint("<?php echo 'hello';");
      expect(result.ok).toBe(true);
    });

    it.skipIf(!hasTool("php"))("phpLint rejects invalid PHP", async () => {
      const result = await phpLint("<?php echo 'hello");
      expect(result.ok).toBe(false);
    });
  });

  describe("shell", () => {
    it.skipIf(!hasTool("bash"))("bashNoExec validates valid bash", async () => {
      const result = await bashNoExec("#!/bin/bash\necho hello");
      expect(result.ok).toBe(true);
    });

    it.skipIf(!hasTool("bash"))("bashNoExec rejects invalid bash", async () => {
      const result = await bashNoExec("#!/bin/bash\nif then");
      expect(result.ok).toBe(false);
    });

    it.skipIf(!hasTool("shellcheck"))("shellcheckFile checks script", async () => {
      const result = await shellcheckFile("#!/bin/bash\necho $var");
      expect(result.ok).toBe(false);
    });
  });

  describe("liquid", () => {
    it("renderLiquid renders template with money filter", async () => {
      const result = await renderLiquid("{{ price | money }}", { price: 1999 });
      expect(result.ok).toBe(true);
      expect(result.stdout).toBe("$19.99");
    });

    it("renderLiquid handles errors", async () => {
      const result = await renderLiquid("{% invalid %}", {});
      expect(result.ok).toBe(false);
    });
  });

  describe("css", () => {
    it("declarationsFor extracts properties", () => {
      const css = ".card { background: red; padding: 1rem; }";
      const decls = declarationsFor(css, ".card");
      expect(decls.background).toBe("red");
      expect(decls.padding).toBe("1rem");
    });

    it("hasImportant detects !important", () => {
      expect(hasImportant(".foo { color: red !important; }")).toBe(true);
      expect(hasImportant(".foo { color: red; }")).toBe(false);
    });

    it("mediaQueryBlocks extracts media queries", () => {
      const css = "@media (max-width: 768px) { .nav { display: none; } }";
      const blocks = mediaQueryBlocks(css);
      expect(blocks.length).toBe(1);
      expect(blocks[0].query).toBe("(max-width: 768px)");
    });

    it("customPropertyScope finds where custom props are defined", () => {
      const css = ":root { --color: red; } .dark { --color: blue; }";
      const scopes = customPropertyScope(css, "--color");
      expect(scopes).toContain(":root");
      expect(scopes).toContain(".dark");
    });
  });
});
