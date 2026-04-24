import { Schema } from "effect";

export const CheckSchema = Schema.Struct({
  name: Schema.String,
  pass: Schema.Boolean,
  detail: Schema.optional(Schema.String),
});

export const ToolCallSchema = Schema.Struct({
  name: Schema.String,
  args: Schema.String,
  turn: Schema.Number,
  result: Schema.optional(Schema.String),
});

export const ModelMetricsSchema = Schema.Struct({
  model: Schema.optional(Schema.String),
  requestCount: Schema.Number,
  promptTokens: Schema.Number,
  completionTokens: Schema.Number,
  totalTokens: Schema.Number,
  totalRequestTimeMs: Schema.Number,
  promptEvalTokens: Schema.optional(Schema.Number),
  promptEvalTimeMs: Schema.optional(Schema.Number),
  completionEvalTokens: Schema.optional(Schema.Number),
  completionEvalTimeMs: Schema.optional(Schema.Number),
});

export const ScenarioResultSchema = Schema.Struct({
  scenarioId: Schema.String,
  category: Schema.String,
  status: Schema.Literal("pass", "partial", "fail"),
  points: Schema.Number,
  maxPoints: Schema.Number,
  toolCallCount: Schema.Number,
  wallTimeMs: Schema.Number,
  firstTokenMs: Schema.optional(Schema.Number),
  turnWallTimes: Schema.optional(Schema.Array(Schema.Number)),
  turnFirstTokenMs: Schema.optional(Schema.Array(Schema.NullishOr(Schema.Number))),
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
