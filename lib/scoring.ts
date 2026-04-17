export type Category =
  | "surgical-edit"
  | "audit"
  | "scope-discipline"
  | "read-only-analysis"
  | "verify-and-repair";

export type ScenarioStatus = "pass" | "partial" | "fail";

export interface ToolCall {
  name: string;
  args: string;
  turn: number;
  result?: string;
}

export interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface ScenarioEvaluation {
  status: ScenarioStatus;
  points: number;
  checks: Check[];
  summary: string;
}

export interface RuntimeOutput {
  stdout: string;
  stderr?: string;
  toolCalls: ToolCall[];
  wallTimeMs: number;
  error?: "TIMEOUT" | "CRASH" | string;
}

export interface ScenarioResult {
  scenarioId: string;
  category: Category;
  runtime: string;
  mode: string;
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

export function toolFailed(call: ToolCall): boolean {
  return call.result?.startsWith("error:") ?? false;
}

export function bashExitCode(call: ToolCall): number | undefined {
  if (call.name !== "bash" || call.result === undefined) return undefined;
  const match = /^exit_code:\s*(\d+)/m.exec(call.result);
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
  partialThreshold = 0.5
): ScenarioEvaluation {
  const passed = checks.filter((c) => c.pass).length;
  const total = checks.length;
  const ratio = total === 0 ? 0 : passed / total;

  if (passed === total) {
    return { status: "pass", points: 2, checks, summary: labels.pass };
  }
  if (ratio >= partialThreshold) {
    return { status: "partial", points: 1, checks, summary: labels.partial };
  }
  return { status: "fail", points: 0, checks, summary: labels.fail };
}
