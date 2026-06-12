import { describe, expect, it } from "bun:test";
import { stripThink } from "../lib/runtimes/think-strip.ts";

describe("stripThink", () => {
  it("removes a think block and returns it as reasoning", () => {
    const result = stripThink("<think>let me reason</think>The answer is 42.");
    expect(result.content).toBe("The answer is 42.");
    expect(result.reasoning).toBe("let me reason");
  });

  it("removes multiple blocks and concatenates reasoning", () => {
    const result = stripThink("<think>a</think>one <think>b</think>two");
    expect(result.content).toBe("one two");
    expect(result.reasoning).toBe("a\nb");
  });

  it("treats an unclosed think tag as reasoning to the end", () => {
    const result = stripThink("Done.<think>trailing thoughts");
    expect(result.content).toBe("Done.");
    expect(result.reasoning).toBe("trailing thoughts");
  });

  it("passes through content without tags", () => {
    const result = stripThink("plain answer");
    expect(result.content).toBe("plain answer");
    expect(result.reasoning).toBe("");
  });

  it("handles the thinking tag variant case-insensitively", () => {
    const result = stripThink("<Thinking>hm</Thinking>ok");
    expect(result.content).toBe("ok");
    expect(result.reasoning).toBe("hm");
  });

  it("keeps tool-call tags out of content when nested in think blocks", () => {
    const result = stripThink('<think><tool_call>{"name":"bash"}</tool_call></think>done');
    expect(result.content).toBe("done");
    expect(result.reasoning).toContain("tool_call");
  });
});
