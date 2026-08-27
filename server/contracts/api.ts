import { Schema } from "effect";

export const CreateRunRequestSchema = Schema.Struct({
  scenarioIds: Schema.Array(Schema.String),
  modelId: Schema.optional(Schema.String),
  systemPrompt: Schema.optional(Schema.String),
  harness: Schema.optional(Schema.Literal("native", "hermes", "qwen")),
  toolExecution: Schema.optional(Schema.Literal("sequential", "parallel")),
  timeoutMs: Schema.optional(Schema.Number),
  // Reasoning/thinking switch for models that support it (sent as
  // chat_template_kwargs.enable_thinking). Default: off.
  thinking: Schema.optional(Schema.Boolean),
  // Name recorded for this run (runs.model). Defaults to modelId — set a
  // distinct label when benchmarking variants of the same model.
  label: Schema.optional(Schema.String),
});

export type CreateRunRequest = Schema.Schema.Type<typeof CreateRunRequestSchema>;

export const OneshotStartRequestSchema = Schema.Struct({
  modelId: Schema.String,
  promptIds: Schema.Array(Schema.String),
});

export type OneshotStartRequest = Schema.Schema.Type<typeof OneshotStartRequestSchema>;
