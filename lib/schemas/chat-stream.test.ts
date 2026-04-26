import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { ChatStreamChunkSchema } from "./chat-stream";

describe("ChatStreamChunkSchema", () => {
  test("decodes a normal chunk with numeric error code", () => {
    const input = {
      id: "test-1",
      choices: [],
      error: { message: "Something failed", code: 500 },
    };
    const result = Schema.decodeUnknownEither(ChatStreamChunkSchema)(input);
    expect(result._tag).toBe("Right");
  });

  test("decodes a normal chunk with string error code", () => {
    const input = {
      id: "test-2",
      choices: [],
      error: { message: "Something failed", code: "server_error" },
    };
    const result = Schema.decodeUnknownEither(ChatStreamChunkSchema)(input);
    expect(result._tag).toBe("Right");
  });

  test("decodes a normal chunk with null error code", () => {
    const input = {
      id: "test-3",
      choices: [],
      error: { message: "Something failed", code: null },
    };
    const result = Schema.decodeUnknownEither(ChatStreamChunkSchema)(input);
    expect(result._tag).toBe("Right");
  });

  test("decodes a normal chunk without error code", () => {
    const input = {
      id: "test-4",
      choices: [],
      error: { message: "Something failed" },
    };
    const result = Schema.decodeUnknownEither(ChatStreamChunkSchema)(input);
    expect(result._tag).toBe("Right");
  });

  test("rejects a chunk with invalid finish_reason type", () => {
    const input = {
      choices: [{ index: 0, delta: {}, finish_reason: 42 }],
    };
    const result = Schema.decodeUnknownEither(ChatStreamChunkSchema)(input);
    expect(result._tag).toBe("Left");
  });
});
