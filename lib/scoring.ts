import type { Ms, ScenarioId, TokenCount } from "./schemas/brands.js";
import type { ToolResult } from "./schemas/tool-result.js";
import { Evaluation } from "./schemas/evaluation.js";
import type { ScenarioEvaluation, RubricBreakdown } from "./schemas/evaluation.js";
export { Evaluation };
export type {
  ScenarioEvaluation,
  RubricBreakdown,
  PassEvaluation,
  PartialEvaluation,
  FailEvaluation,
} from "./schemas/evaluation.js";

export type Category =
  | "surgical-edit"
  | "audit"
  | "scope-discipline"
  | "read-only-analysis"
  | "verify-and-repair"
  | "implementation"
  | "responsiveness"
  | "long-context";

export type ScenarioStatus = "pass" | "partial" | "fail";

export interface ToolCall {
  name: string;
  args: string;
  turn: number;
  result?: ToolResult;
}

export interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface ModelMetrics {
  model?: string;
  requestCount: number;
  promptTokens: TokenCount;
  completionTokens: TokenCount;
  totalTokens: TokenCount;
  totalRequestTimeMs: Ms;
  promptEvalTokens?: TokenCount;
  promptEvalTimeMs?: Ms;
  completionEvalTokens?: TokenCount;
  completionEvalTimeMs?: Ms;
}

export interface RuntimeOutput {
  stdout: string;
  stderr?: string;
  toolCalls: ToolCall[];
  wallTimeMs: Ms;
  firstTokenMs?: Ms;
  turnWallTimes?: Ms[];
  turnFirstTokenMs?: Array<Ms | undefined>;
  scenarioMetrics?: Record<string, unknown>;
  error?: "TIMEOUT" | "CRASH" | string;
  modelMetrics?: ModelMetrics;
}

export type RuntimeErrorClassification = {
  kind: "infra" | "timeout" | "aborted" | "runtime";
  scoreExempt: boolean;
};
export type RuntimeErrorKind = RuntimeErrorClassification["kind"];

export interface ScenarioResult {
  scenarioId: ScenarioId;
  category: Category;
  runtime: string;
  evaluation: ScenarioEvaluation;
  output: RuntimeOutput;
}

// ── Helpers ──────────────────────────────────────────────────

export function classifyRuntimeError(error: string): RuntimeErrorClassification {
  const message = error.trim();
  if (/^TIMEOUT$/i.test(message)) return { kind: "timeout", scoreExempt: false };
  if (/^ABORTED$/i.test(message)) return { kind: "aborted", scoreExempt: true };

  if (
    /empty response body from .*\/v1\/chat\/completions/i.test(message) ||
    /non-SSE response from .*\/v1\/chat\/completions/i.test(message) ||
    /\b(fetch failed|econnreset|econnrefused|socket hang up|connection reset|connection refused)\b/i.test(
      message
    )
  ) {
    return { kind: "infra", scoreExempt: true };
  }

  return { kind: "runtime", scoreExempt: false };
}

export function runtimeErrorEvaluation(error: string, maxPoints: number): ScenarioEvaluation {
  const classification = classifyRuntimeError(error);
  const checks: Check[] = [
    {
      name: "completed without runtime error",
      pass: false,
      detail: error,
    },
  ];

  if (classification.scoreExempt) {
    return Evaluation.fail(0, checks, `Infrastructure error (excluded from scoring): ${error}`);
  }

  return Evaluation.fail(maxPoints, checks, `Runtime error: ${error}`);
}

export function toolCallsByName(calls: ToolCall[], name: string): ToolCall[] {
  return calls.filter((c) => c.name === name);
}

export function firstCall(calls: ToolCall[], name: string): ToolCall | undefined {
  return calls.find((c) => c.name === name);
}

export function hasCall(
  calls: ToolCall[],
  name: string,
  predicate?: (c: ToolCall) => boolean
): boolean {
  return calls.some((c) => c.name === name && (predicate ? predicate(c) : true));
}

function normalizeResult(result: ToolCall["result"]): { ok: boolean; text: string } | undefined {
  if (result === undefined) return undefined;
  return result.ok ? { ok: true, text: result.value } : { ok: false, text: result.message };
}

export function toolFailed(call: ToolCall): boolean {
  const r = normalizeResult(call.result);
  return r ? !r.ok : false;
}

export function bashExitCode(call: ToolCall): number | undefined {
  if (call.name !== "bash") return undefined;
  const r = normalizeResult(call.result);
  if (!r) return undefined;
  const match = /^exit_code:\s*(\d+)/m.exec(r.text);
  return match ? parseInt(match[1], 10) : undefined;
}

export function bashPassed(call: ToolCall): boolean {
  return bashExitCode(call) === 0;
}

export function anyBashPassed(calls: ToolCall[]): boolean {
  return calls.some((c) => c.name === "bash" && bashPassed(c));
}

export function firstChangeFailed(calls: ToolCall[]): boolean {
  const first = calls.find((c) => c.name === "edit" || c.name === "write");
  return first !== undefined && toolFailed(first);
}

export function modelRecovered(calls: ToolCall[]): boolean {
  const firstChange = calls.findIndex((c) => c.name === "edit" || c.name === "write");
  if (firstChange === -1 || !toolFailed(calls[firstChange])) return false;
  return calls
    .slice(firstChange + 1)
    .some((c) => (c.name === "edit" || c.name === "write") && !toolFailed(c));
}

function extractBracedBlock(source: string, header: RegExp): string {
  const match = header.exec(source);
  if (!match) return "";
  let depth = 0;
  let started = false;
  for (let i = match.index; i < source.length; i++) {
    if (source[i] === "{") {
      depth++;
      started = true;
    }
    if (source[i] === "}") depth--;
    if (started && depth === 0) return source.slice(match.index, i + 1);
  }
  return "";
}

export function extractFunction(source: string, name: string): string {
  return extractBracedBlock(source, new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`));
}

export function extractGoFunc(source: string, name: string): string {
  return extractBracedBlock(source, new RegExp(`func\\s+${name}\\s*\\(`));
}

export function checksToEvaluation(
  checks: Check[],
  labels: { pass: string; partial: string; fail: string },
  partialThreshold = 0.5,
  maxPoints = 2
): ScenarioEvaluation {
  const passed = checks.filter((c) => c.pass).length;
  const total = checks.length;
  const ratio = total === 0 ? 0 : passed / total;

  if (passed === total) {
    return Evaluation.pass(maxPoints, checks, labels.pass);
  }
  if (ratio >= partialThreshold) {
    return Evaluation.partial(
      Math.max(1, Math.floor(maxPoints / 2)),
      maxPoints,
      checks,
      labels.partial
    );
  }
  return Evaluation.fail(maxPoints, checks, labels.fail);
}

export function sumScenarioMaxPoints(
  evaluations: Array<Pick<ScenarioEvaluation, "maxPoints"> | undefined>
): number {
  return evaluations.reduce((sum, evaluation) => sum + (evaluation?.maxPoints ?? 0), 0);
}

const SUM_KEYS = [
  "promptTokens",
  "completionTokens",
  "totalTokens",
  "totalRequestTimeMs",
  "requestCount",
] as const;

const PAIRED_KEYS = [
  ["promptEvalTokens", "promptEvalTimeMs"] as const,
  ["completionEvalTokens", "completionEvalTimeMs"] as const,
];

export function mergeModelMetrics(
  metrics: Array<ModelMetrics | undefined>
): ModelMetrics | undefined {
  const defined = metrics.filter((m): m is ModelMetrics => m !== undefined);
  if (defined.length === 0) return undefined;

  const sum = (key: keyof ModelMetrics) =>
    defined.reduce((acc, m) => acc + ((m[key] as number | undefined) ?? 0), 0);

  const models = new Set(defined.map((m) => m.model).filter(Boolean));
  const base = Object.fromEntries(SUM_KEYS.map((k) => [k, sum(k)]));

  const paired = PAIRED_KEYS.flatMap(([tokenKey, timeKey]) => {
    const present = defined.filter(
      (m) => m[tokenKey] !== undefined && m[timeKey] !== undefined
    );
    return present.length === 0 ? [] : [[tokenKey, sum(tokenKey)], [timeKey, sum(timeKey)]];
  });

  return {
    model: models.size === 1 ? [...models][0] : undefined,
    ...base,
    ...Object.fromEntries(paired),
  } as ModelMetrics;
}

const tokensPerSecond = (tokens?: number, ms?: number): number | undefined =>
  tokens !== undefined && ms !== undefined && ms > 0 ? tokens / (ms / 1000) : undefined;

export const promptTokensPerSecond = (m: ModelMetrics): number | undefined =>
  tokensPerSecond(m.promptEvalTokens, m.promptEvalTimeMs);

export const completionTokensPerSecond = (m: ModelMetrics): number | undefined =>
  tokensPerSecond(m.completionEvalTokens, m.completionEvalTimeMs);
