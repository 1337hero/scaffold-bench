import { Schema } from "effect";

export const CreateRunRequestSchema = Schema.Struct({
  scenarioIds: Schema.Array(Schema.String),
  modelId: Schema.optional(Schema.String),
  systemPrompt: Schema.optional(Schema.String),
  toolExecution: Schema.optional(Schema.Literal("sequential", "parallel")),
  timeoutMs: Schema.optional(Schema.Number),
});

export type CreateRunRequest = Schema.Schema.Type<typeof CreateRunRequestSchema>;

export const OneshotStartRequestSchema = Schema.Struct({
  modelId: Schema.String,
  promptIds: Schema.Array(Schema.String),
});

export type OneshotStartRequest = Schema.Schema.Type<typeof OneshotStartRequestSchema>;

export const ScenarioRunSummarySchema = Schema.Struct({
  scenarioId: Schema.String,
  category: Schema.NullOr(Schema.String),
  status: Schema.NullOr(Schema.String),
  points: Schema.NullOr(Schema.Number),
  maxPoints: Schema.NullOr(Schema.Number),
  wallTimeMs: Schema.NullOr(Schema.Number),
  toolCallCount: Schema.NullOr(Schema.Number),
});
export type ScenarioRunSummary = Schema.Schema.Type<typeof ScenarioRunSummarySchema>;

export const RunSummarySchema = Schema.Struct({
  id: Schema.String,
  startedAt: Schema.Number,
  finishedAt: Schema.NullOr(Schema.Number),
  status: Schema.String,
  model: Schema.NullOr(Schema.String),
  scenarioIds: Schema.Array(Schema.String),
  totalPoints: Schema.NullOr(Schema.Number),
  maxPoints: Schema.NullOr(Schema.Number),
});
export type RunSummary = Schema.Schema.Type<typeof RunSummarySchema>;

export const ModelSchema = Schema.Struct({
  id: Schema.String,
  source: Schema.Literal("local", "remote"),
  endpoint: Schema.String,
  requiresApiKey: Schema.optional(Schema.Boolean),
});
export type Model = Schema.Schema.Type<typeof ModelSchema>;
