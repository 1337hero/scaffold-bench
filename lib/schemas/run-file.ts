import { Schema } from "effect";
import { Ms, ScenarioId, TokenCount } from "./brands.js";

export const CheckSchema = Schema.Struct({
  name: Schema.String,
  pass: Schema.Boolean,
  detail: Schema.optional(Schema.String),
});

// Decodes both new ToolResult objects and legacy plain strings (existing
// fixtures used "error: ..." prefix for failures). Always decodes to ToolResult.
const ToolResultStructSchema = Schema.Union(
  Schema.Struct({ ok: Schema.Literal(true), value: Schema.String }),
  Schema.Struct({ ok: Schema.Literal(false), message: Schema.String })
);
const ToolResultOrLegacySchema = Schema.transform(
  Schema.Union(ToolResultStructSchema, Schema.String),
  ToolResultStructSchema,
  {
    strict: false,
    decode: (v) => {
      if (typeof v === "string") {
        return v.startsWith("error:")
          ? { ok: false as const, message: v.slice(6).trim() }
          : { ok: true as const, value: v };
      }
      return v;
    },
    encode: (v) => v,
  }
);

export const ToolCallSchema = Schema.Struct({
  name: Schema.String,
  args: Schema.String,
  turn: Schema.Number,
  result: Schema.optional(ToolResultOrLegacySchema),
});

export const ModelMetricsSchema = Schema.Struct({
  model: Schema.optional(Schema.String),
  requestCount: Schema.Number,
  promptTokens: TokenCount,
  completionTokens: TokenCount,
  totalTokens: TokenCount,
  totalRequestTimeMs: Ms,
  promptEvalTokens: Schema.optional(TokenCount),
  promptEvalTimeMs: Schema.optional(Ms),
  completionEvalTokens: Schema.optional(TokenCount),
  completionEvalTimeMs: Schema.optional(Ms),
});

export const ScenarioResultSchema = Schema.Struct({
  scenarioId: ScenarioId,
  category: Schema.String,
  status: Schema.Literal("pass", "partial", "fail"),
  points: Schema.Number,
  maxPoints: Schema.Number,
  toolCallCount: Schema.Number,
  wallTimeMs: Ms,
  firstTokenMs: Schema.optional(Ms),
  turnWallTimes: Schema.optional(Schema.Array(Ms)),
  turnFirstTokenMs: Schema.optional(Schema.Array(Schema.NullishOr(Ms))),
  error: Schema.optional(Schema.String),
  modelMetrics: Schema.optional(ModelMetricsSchema),
  scenarioMetrics: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  checks: Schema.Array(CheckSchema),
  transcript: Schema.optional(Schema.String),
  toolCalls: Schema.optional(Schema.Array(ToolCallSchema)),
});

export const RunFileSchema = Schema.Struct({
  timestamp: Schema.String,
  runtime: Schema.String,
  totalPoints: Schema.Number,
  maxPoints: Schema.Number,
  modelMetrics: Schema.optional(ModelMetricsSchema),
  results: Schema.Array(ScenarioResultSchema),
});

export type RunFile = Schema.Schema.Type<typeof RunFileSchema>;
export type ScenarioResult = Schema.Schema.Type<typeof ScenarioResultSchema>;
export type ModelMetrics = Schema.Schema.Type<typeof ModelMetricsSchema>;
export type ToolCall = Schema.Schema.Type<typeof ToolCallSchema>;
export type Check = Schema.Schema.Type<typeof CheckSchema>;
