import type { Ms, ScenarioId, TokenCount } from "./schemas/brands.js";
import type { ToolResult } from "./schemas/tool-result.js";
import { Evaluation } from "./schemas/evaluation.js";
import type { ScenarioEvaluation } from "./schemas/evaluation.js";
export { Evaluation };
export type {
  ScenarioEvaluation,
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

export interface ScenarioResult {
  scenarioId: ScenarioId;
  category: Category;
  runtime: string;
  evaluation: ScenarioEvaluation;
  output: RuntimeOutput;
}

// ── Helpers ──────────────────────────────────────────────────

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

function normalizeResult(
  result: ToolCall["result"]
): { ok: boolean; text: string } | undefined {
  if (result === undefined) return undefined;
  return result.ok
    ? { ok: true, text: result.value }
    : { ok: false, text: result.message };
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

export function mergeModelMetrics(metrics: Array<ModelMetrics | undefined>): ModelMetrics | undefined {
  const defined = metrics.filter((metric): metric is ModelMetrics => metric !== undefined);
  if (defined.length === 0) return undefined;

  const models = [...new Set(defined.map((metric) => metric.model).filter(Boolean))];
  let promptEvalTokens = 0;
  let promptEvalTimeMs = 0;
  let completionEvalTokens = 0;
  let completionEvalTimeMs = 0;
  let hasPromptTiming = false;
  let hasCompletionTiming = false;

  for (const metric of defined) {
    if (metric.promptEvalTokens !== undefined && metric.promptEvalTimeMs !== undefined) {
      promptEvalTokens += metric.promptEvalTokens;
      promptEvalTimeMs += metric.promptEvalTimeMs;
      hasPromptTiming = true;
    }
    if (metric.completionEvalTokens !== undefined && metric.completionEvalTimeMs !== undefined) {
      completionEvalTokens += metric.completionEvalTokens;
      completionEvalTimeMs += metric.completionEvalTimeMs;
      hasCompletionTiming = true;
    }
  }

  return {
    model: models.length === 1 ? models[0] : undefined,
    requestCount: defined.reduce((sum, metric) => sum + metric.requestCount, 0),
    promptTokens: defined.reduce((sum, metric) => sum + metric.promptTokens, 0) as TokenCount,
    completionTokens: defined.reduce((sum, metric) => sum + metric.completionTokens, 0) as TokenCount,
    totalTokens: defined.reduce((sum, metric) => sum + metric.totalTokens, 0) as TokenCount,
    totalRequestTimeMs: defined.reduce(
      (sum, metric) => sum + metric.totalRequestTimeMs,
      0
    ) as Ms,
    ...(hasPromptTiming
      ? { promptEvalTokens: promptEvalTokens as TokenCount, promptEvalTimeMs: promptEvalTimeMs as Ms }
      : {}),
    ...(hasCompletionTiming
      ? {
          completionEvalTokens: completionEvalTokens as TokenCount,
          completionEvalTimeMs: completionEvalTimeMs as Ms,
        }
      : {}),
  };
}

export function promptTokensPerSecond(metrics: ModelMetrics): number | undefined {
  if (
    metrics.promptEvalTokens === undefined ||
    metrics.promptEvalTimeMs === undefined ||
    metrics.promptEvalTimeMs <= 0
  ) {
    return undefined;
  }
  return metrics.promptEvalTokens / (metrics.promptEvalTimeMs / 1000);
}

export function completionTokensPerSecond(metrics: ModelMetrics): number | undefined {
  if (
    metrics.completionEvalTokens === undefined ||
    metrics.completionEvalTimeMs === undefined ||
    metrics.completionEvalTimeMs <= 0
  ) {
    return undefined;
  }
  return metrics.completionEvalTokens / (metrics.completionEvalTimeMs / 1000);
}
