import { Schema } from "effect";

export const PropsSchema = Schema.Struct({
  n_ctx: Schema.optional(Schema.Number),
  default_generation_settings: Schema.optional(
    Schema.Struct({ n_ctx: Schema.optional(Schema.Number) })
  ),
});
export type Props = Schema.Schema.Type<typeof PropsSchema>;

export const EnvSchema = Schema.Struct({
  SCAFFOLD_LOCAL_ENDPOINT: Schema.optional(Schema.String),
  SCAFFOLD_REMOTE_ENDPOINT: Schema.optional(Schema.String),
  SCAFFOLD_REMOTE_API_KEY: Schema.optional(Schema.String),
  SCAFFOLD_REMOTE_MODELS: Schema.optional(Schema.String),
});

export type Env = Schema.Schema.Type<typeof EnvSchema>;
