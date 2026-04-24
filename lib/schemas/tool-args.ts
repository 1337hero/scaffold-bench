import { JSONSchema, Schema } from "effect";

export const ReadArgsSchema = Schema.Struct({
  path: Schema.String,
  limit: Schema.optional(Schema.Number),
  offset: Schema.optional(Schema.Number),
});

export const LsArgsSchema = Schema.Struct({
  path: Schema.optional(Schema.String),
});

export const GrepArgsSchema = Schema.Struct({
  pattern: Schema.String,
  path: Schema.optional(Schema.String),
  glob: Schema.optional(Schema.String),
  ignore_case: Schema.optional(Schema.Boolean),
});

export const GlobArgsSchema = Schema.Struct({
  pattern: Schema.String,
  path: Schema.optional(Schema.String),
});

export const EditArgsSchema = Schema.Struct({
  path: Schema.String,
  old_str: Schema.String,
  new_str: Schema.String,
});

export const WriteArgsSchema = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
});

export const BashArgsSchema = Schema.Struct({
  command: Schema.String,
  timeout_ms: Schema.optional(Schema.Number),
});

export type ReadArgs = Schema.Schema.Type<typeof ReadArgsSchema>;
export type LsArgs = Schema.Schema.Type<typeof LsArgsSchema>;
export type GrepArgs = Schema.Schema.Type<typeof GrepArgsSchema>;
export type GlobArgs = Schema.Schema.Type<typeof GlobArgsSchema>;
export type EditArgs = Schema.Schema.Type<typeof EditArgsSchema>;
export type WriteArgs = Schema.Schema.Type<typeof WriteArgsSchema>;
export type BashArgs = Schema.Schema.Type<typeof BashArgsSchema>;

export function toJsonSchema<A, I, R>(schema: Schema.Schema<A, I, R>): object {
  return JSONSchema.make(schema);
}
