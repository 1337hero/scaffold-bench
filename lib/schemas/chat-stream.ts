import { Schema } from "effect";
import { Ms, TokenCount } from "./brands.js";

const ToolCallDeltaSchema = Schema.Struct({
  index: Schema.Number,
  id: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  function: Schema.optional(
    Schema.Struct({
      name: Schema.optional(Schema.String),
      arguments: Schema.optional(Schema.String),
    })
  ),
});

const DeltaSchema = Schema.Struct({
  role: Schema.optional(Schema.String),
  content: Schema.optional(Schema.NullOr(Schema.String)),
  tool_calls: Schema.optional(Schema.Array(ToolCallDeltaSchema)),
});

const ChoiceSchema = Schema.Struct({
  index: Schema.Number,
  delta: DeltaSchema,
  finish_reason: Schema.optional(Schema.NullOr(Schema.String)),
});

export const UsageSchema = Schema.Struct({
  prompt_tokens: Schema.optional(TokenCount),
  completion_tokens: Schema.optional(TokenCount),
  total_tokens: Schema.optional(TokenCount),
});

export const TimingsSchema = Schema.Struct({
  prompt_n: Schema.optional(Schema.Number),
  prompt_ms: Schema.optional(Ms),
  prompt_per_token_ms: Schema.optional(Ms),
  prompt_per_second: Schema.optional(Schema.Number),
  predicted_n: Schema.optional(Schema.Number),
  predicted_ms: Schema.optional(Ms),
  predicted_per_token_ms: Schema.optional(Ms),
  predicted_per_second: Schema.optional(Schema.Number),
});

export const ChatStreamChunkSchema = Schema.Struct({
  id: Schema.optional(Schema.String),
  object: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  choices: Schema.optional(Schema.Array(ChoiceSchema)),
  usage: Schema.optional(Schema.NullOr(UsageSchema)),
  timings: Schema.optional(TimingsSchema),
  error: Schema.optional(
    Schema.Struct({
      message: Schema.String,
      type: Schema.optional(Schema.String),
      code: Schema.optional(Schema.NullOr(Schema.Union(Schema.String, Schema.Number))),
    })
  ),
});

export type ChatStreamChunk = Schema.Schema.Type<typeof ChatStreamChunkSchema>;
