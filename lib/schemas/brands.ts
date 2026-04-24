import { Schema } from "effect";

// Time brands
export const Ms = Schema.Number.pipe(Schema.brand("Ms"));
export const Ns = Schema.Number.pipe(Schema.brand("Ns"));
export const Seconds = Schema.Number.pipe(Schema.brand("Seconds"));
export type Ms = Schema.Schema.Type<typeof Ms>;
export type Ns = Schema.Schema.Type<typeof Ns>;
export type Seconds = Schema.Schema.Type<typeof Seconds>;

// Token/count brands
export const TokenCount = Schema.Number.pipe(Schema.brand("TokenCount"));
export type TokenCount = Schema.Schema.Type<typeof TokenCount>;

// Domain brands
export const ExitCode = Schema.Number.pipe(Schema.brand("ExitCode"));
export type ExitCode = Schema.Schema.Type<typeof ExitCode>;
export const ScenarioId = Schema.String.pipe(Schema.brand("ScenarioId"));
export type ScenarioId = Schema.Schema.Type<typeof ScenarioId>;
export const SafeRelativePath = Schema.String.pipe(Schema.brand("SafeRelativePath"));
export type SafeRelativePath = Schema.Schema.Type<typeof SafeRelativePath>;

// Conversion helpers — internal casts justified by definition
// of the unit conversions (1 ms = 1e6 ns, 1 s = 1000 ms).
export const nsToMs = (ns: Ns): Ms => (ns / 1e6) as Ms;
export const msToSeconds = (ms: Ms): Seconds => (ms / 1000) as Seconds;
