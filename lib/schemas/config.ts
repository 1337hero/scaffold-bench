import { Schema } from "effect";

export const PropsSchema = Schema.Struct({
  n_ctx: Schema.optional(Schema.Number),
  default_generation_settings: Schema.optional(
    Schema.Struct({ n_ctx: Schema.optional(Schema.Number) })
  ),
});
export type Props = Schema.Schema.Type<typeof PropsSchema>;

export const RootConfigSchema = Schema.Struct({
  endpoint: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  remoteModels: Schema.optional(Schema.Array(Schema.Struct({
    id: Schema.String,
    endpoint: Schema.String,
    requiresApiKey: Schema.optional(Schema.Boolean),
  }))),
});

export const EnvSchema = Schema.Struct({
  SCAFFOLD_ENDPOINT: Schema.optional(Schema.String),
  SCAFFOLD_MODEL: Schema.optional(Schema.String),
  SCAFFOLD_API_KEY: Schema.optional(Schema.String),
});

export type RootConfig = Schema.Schema.Type<typeof RootConfigSchema>;
export type Env = Schema.Schema.Type<typeof EnvSchema>;
