import { Schema } from "effect";

export const RootConfigSchema = Schema.Struct({
  endpoint: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
});

export const EnvSchema = Schema.Struct({
  SCAFFOLD_ENDPOINT: Schema.optional(Schema.String),
  SCAFFOLD_MODEL: Schema.optional(Schema.String),
  SCAFFOLD_API_KEY: Schema.optional(Schema.String),
});

export type RootConfig = Schema.Schema.Type<typeof RootConfigSchema>;
export type Env = Schema.Schema.Type<typeof EnvSchema>;
