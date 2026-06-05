import { test, expect } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

test("title is hello", async ({ page }) => {
  await page.goto(pathToFileURL(join(import.meta.dirname, "page.html")).href);
  await expect(page.locator("#title")).toHaveText("Hello");
});
