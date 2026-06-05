import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

test("no a11y violations", async ({ page }) => {
  await page.goto(pathToFileURL(join(import.meta.dirname, "page.html")).href);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
