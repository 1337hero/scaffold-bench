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
