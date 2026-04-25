import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadOneshotPrompts, type OneshotPrompt } from "../../lib/oneshot/loader.ts";

describe("loadOneshotPrompts", () => {
  test("returns exactly 5 prompts sorted by filename", () => {
    const prompts = loadOneshotPrompts();
    expect(prompts).toHaveLength(5);
    // Verify sorted by id (filename stem)
    for (let i = 1; i < prompts.length; i++) {
      expect(prompts[i].id > prompts[i - 1].id).toBe(true);
    }
  });

  test("each prompt has required fields", () => {
    const prompts = loadOneshotPrompts();
    for (const p of prompts) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.title).toBe("string");
      expect(p.title.length).toBeGreaterThan(0);
      expect(typeof p.category).toBe("string");
      expect(p.category.length).toBeGreaterThan(0);
      expect(typeof p.prompt).toBe("string");
      expect(p.prompt.length).toBeGreaterThan(0);
    }
  });

  test("first prompt is meadow canvas", () => {
    const prompts = loadOneshotPrompts();
    expect(prompts[0].id).toBe("01-meadow-canvas");
    expect(prompts[0].category).toBe("creative-canvas");
    expect(prompts[0].prompt).toContain("meadow");
  });

  test("last prompt is haiku trio", () => {
    const prompts = loadOneshotPrompts();
    expect(prompts[4].id).toBe("05-haiku-trio");
    expect(prompts[4].category).toBe("creative-writing");
  });

  test("frontmatter body excludes frontmatter markers", () => {
    const prompts = loadOneshotPrompts();
    for (const p of prompts) {
      expect(p.prompt).not.toMatch(/^---/);
      expect(p.prompt).not.toContain("---");
    }
  });

  test("title matches frontmatter title field", () => {
    const prompts = loadOneshotPrompts();
    const titles = prompts.map((p) => p.title);
    expect(titles).toContain("Swaying Meadow Canvas");
    expect(titles).toContain("Snake Game");
    expect(titles).toContain("SVG Self-Portrait");
    expect(titles).toContain("Bouncy Balls Physics");
    expect(titles).toContain("Haiku Trio");
  });
});
