import type { Ms, ScenarioId, TokenCount } from "./schemas/brands.js";
import type { ToolResult } from "./schemas/tool-result.js";
import { Evaluation } from "./schemas/evaluation.js";
import { PARTIAL_THRESHOLD, PASS_THRESHOLD } from "./scenarios/_shared/rubric.ts";
import type { ScenarioEvaluation, RubricBreakdown } from "./schemas/evaluation.js";
import type { WorkspaceArchive } from "./artifacts.ts";
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
  // Per-request series in request order (one entry per model call). Optional so
  // legacy metrics (and run-level merges) omit it.
  requests?: Array<{
    promptTokens: TokenCount;
    completionTokens: TokenCount;
    requestTimeMs: Ms;
  }>;
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
  archive?: WorkspaceArchive;
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

const UNKNOWN_TOOL_RESULT = /^unknown tool "/;

export function hallucinatedToolCalls(calls: ToolCall[]): ToolCall[] {
  return calls.filter(
    (c) => c.result !== undefined && !c.result.ok && UNKNOWN_TOOL_RESULT.test(c.result.message)
  );
}

export function applyHallucinationPenalty(
  evaluation: ScenarioEvaluation,
  calls: ToolCall[]
): ScenarioEvaluation {
  const hallucinated = hallucinatedToolCalls(calls);
  if (hallucinated.length === 0) {
    return {
      ...evaluation,
      checks: [...evaluation.checks, { name: "no hallucinated tools", pass: true }],
    };
  }

  const names = [...new Set(hallucinated.map((c) => c.name))].join(", ");
  const points = Math.max(0, evaluation.points - 1);
  const checks: Check[] = [
    ...evaluation.checks,
    { name: "no hallucinated tools", pass: false, detail: names },
  ];
  const status =
    evaluation.rubricKind === "10pt"
      ? points >= PASS_THRESHOLD
        ? "pass"
        : points >= PARTIAL_THRESHOLD
          ? "partial"
          : "fail"
      : evaluation.status;

  return { ...evaluation, status, points, checks } as ScenarioEvaluation;
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

/**
 * Explicit test runners and static checks — count as verification wherever they
 * appear in a command, so chains like `cd app && bun test` still match.
 * Single definition site — unit-tested. Case-insensitive.
 *
 * Covers: bun test, npm test, node --test, vitest, jest, pytest, cargo test/check,
 * go test/vet/build, php -l, shellcheck, tsc, make test/check, deno test, and
 * runner-script forms like `node foo.test.mjs` / `python x_test.py`.
 */
export const VERIFY_RUNNER_PATTERN =
  /\b(?:bun\s+test|npm\s+(?:run\s+)?test|npx\s+(?:vitest|jest|tsc)\b|node\s+--test|node\s+-c\b|vitest\b|jest\b|pytest\b|cargo\s+(?:test|check)\b|go\s+(?:test|vet|build)\b|php\s+-l\b|shellcheck\b|tsc\b|make\s+(?:test|check)\b|deno\s+test\b|(?:node|bun|deno|tsx|python3?)\s+\S*(?:test|spec)\S*\.\w+)/i;

/**
 * Bare "test"/"spec" token — a legitimate signal for informal runners
 * (`make test`, `./run-tests.sh`) but NOT when the command merely inspects or
 * mutates a test/spec path (`cat test/foo.ts`, `ls tests/`, `rm -rf tests`).
 * Guarded by VERIFY_INSPECTION_LEAD so those don't inflate verify_passes.
 */
export const VERIFY_GENERIC_PATTERN = /\b(?:test|spec)s?\b/i;

/** Leading verbs that read/navigate/mutate rather than verify. */
export const VERIFY_INSPECTION_LEAD =
  /^\s*(?:sudo\s+)?(?:cat|bat|less|more|head|tail|ls|ll|tree|grep|rg|ag|find|fd|sed|awk|gawk|rm|cp|mv|touch|mkdir|echo|printf|stat|file|wc|du|nano|vim|nvim|git|diff|chmod|chown|cd|export|open|xdg-open)\b/i;

/**
 * Whether a bash command counts as post-change self-verification. An explicit
 * runner always counts; a bare test/spec mention counts only when the command
 * doesn't lead with an inspection/destructive verb.
 */
export function isVerifyCommand(command: string): boolean {
  if (VERIFY_RUNNER_PATTERN.test(command)) return true;
  return VERIFY_GENERIC_PATTERN.test(command) && !VERIFY_INSPECTION_LEAD.test(command);
}

export type VerifyMetrics = {
  bash_calls: number;
  post_change_bash_calls: number;
  verify_passes: number;
  mutated: 0 | 1;
};

function bashCommandText(call: ToolCall): string {
  try {
    const parsed: unknown = JSON.parse(call.args);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "command" in parsed &&
      typeof (parsed as { command: unknown }).command === "string"
    ) {
      return (parsed as { command: string }).command;
    }
  } catch {
    /* not JSON */
  }
  return call.args;
}

function isSuccessfulMutation(call: ToolCall): boolean {
  return (call.name === "edit" || call.name === "write") && !toolFailed(call);
}

function isPassingVerification(call: ToolCall): boolean {
  if (call.name !== "bash") return false;
  if (!isVerifyCommand(bashCommandText(call))) return false;
  return bashExitCode(call) === 0;
}

/**
 * Pure derivation of behavioral self-testing metrics from a scenario-run's
 * tool-call trace and workspace archive. Safe for scoring-time capture,
 * rescore, and backfill.
 */
export function deriveVerifyMetrics(
  toolCalls: ToolCall[],
  archive?: Pick<WorkspaceArchive, "changed" | "deleted"> | null
): VerifyMetrics {
  const hasArchiveMutation =
    (archive?.changed?.length ?? 0) > 0 || (archive?.deleted?.length ?? 0) > 0;
  const firstSuccessfulEdit = toolCalls.findIndex(isSuccessfulMutation);
  const hasEditMutation = firstSuccessfulEdit !== -1;
  const mutated: 0 | 1 = hasArchiveMutation || hasEditMutation ? 1 : 0;

  // Mutation point: first successful edit/write index; if mutated without those
  // (e.g. sed via bash), all bash calls count as post-change (index 0).
  const mutationPoint =
    firstSuccessfulEdit !== -1 ? firstSuccessfulEdit : mutated === 1 ? 0 : -1;

  let bash_calls = 0;
  let post_change_bash_calls = 0;
  let verify_passes = 0;

  for (let i = 0; i < toolCalls.length; i++) {
    const call = toolCalls[i];
    if (call.name !== "bash") continue;
    bash_calls++;
    if (mutationPoint !== -1 && i >= mutationPoint) {
      post_change_bash_calls++;
      if (isPassingVerification(call)) verify_passes++;
    }
  }

  return { bash_calls, post_change_bash_calls, verify_passes, mutated };
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
    const present = defined.filter((m) => m[tokenKey] !== undefined && m[timeKey] !== undefined);
    return present.length === 0
      ? []
      : [
          [tokenKey, sum(tokenKey)],
          [timeKey, sum(timeKey)],
        ];
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
