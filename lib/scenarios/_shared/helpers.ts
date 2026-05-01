import { Either, Schema } from "effect";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  BashArgsSchema,
  EditArgsSchema,
  ReadArgsSchema,
  WriteArgsSchema,
} from "../../schemas/index.js";
import type { Check, ScenarioEvaluation, ToolCall } from "../../scoring.ts";
import { Evaluation, bashPassed } from "../../scoring.ts";

export const PLAYGROUND_SRC = join(import.meta.dir, "..", "..", "..", "playground");
export const TS_COMPILE_COMMAND = "bunx tsc --noEmit -p playground/ts-compile/tsconfig.json";
export const SB22_LOOP_PATH = "playground/sb22-loop.js";
export const SB23_LONGCONTEXT_PATH = "playground/sb23-longcontext.js";

export async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

export function stripComments(source: string): string {
  return source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function noConsoleLog(source: string): boolean {
  return !/console\.log\s*\(/.test(stripComments(source));
}

export function noAddedComments(current: string, original: string): boolean {
  const commentPattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
  const normalize = (source: string): string[] =>
    (source.match(commentPattern) ?? []).map((comment) => comment.trim()).sort();
  return normalize(current).join("\n") === normalize(original).join("\n");
}

export function functionCount(source: string): number {
  const code = stripComments(source);
  return (
    countMatches(code, /\bfunction\s+[A-Za-z_$][\w$]*\s*\(/g) +
    countMatches(code, /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g) +
    countMatches(code, /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/g)
  );
}

export function noExtraFunctions(current: string, original: string): boolean {
  return functionCount(current) <= functionCount(original);
}

export function firstTurn(calls: ToolCall[], name: string): number | undefined {
  return calls.find((c) => c.name === name)?.turn;
}

export function decodeArgs<A, I>(schema: Schema.Schema<A, I>, call: ToolCall): A | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.args);
  } catch {
    return null;
  }
  const result = Schema.decodeUnknownEither(schema)(parsed);
  return Either.isRight(result) ? result.right : null;
}

export function changedPaths(calls: ToolCall[]): string[] {
  return calls.flatMap((call) => {
    if (call.name === "edit") {
      const args = decodeArgs(EditArgsSchema, call);
      return args ? [args.path] : [];
    }
    if (call.name === "write") {
      const args = decodeArgs(WriteArgsSchema, call);
      return args ? [args.path] : [];
    }
    return [];
  });
}

/** @deprecated Use onlyChangedFiles for scoring scope checks. */
export function onlyChangedPaths(calls: ToolCall[], allowedPaths: string[]): boolean {
  const changes = changedPaths(calls);
  return changes.length > 0 && changes.every((path) => allowedPaths.includes(path));
}

export function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

export function firstChangeTurn(calls: ToolCall[]): number | undefined {
  const editTurn = firstTurn(calls, "edit");
  const writeTurn = firstTurn(calls, "write");
  if (editTurn === undefined) return writeTurn;
  if (writeTurn === undefined) return editTurn;
  return Math.min(editTurn, writeTurn);
}

export function readTurnsForPath(calls: ToolCall[], path: string): number[] {
  return calls
    .filter((call) => call.name === "read")
    .flatMap((call) => {
      const args = decodeArgs(ReadArgsSchema, call);
      return args?.path === path ? [call.turn] : [];
    });
}

function isSearchLikeBashCall(call: ToolCall): boolean {
  if (call.name !== "bash") return false;
  const command = normalizeCommand(bashCommand(call));
  return /(^|\s)(ugrep|rg|grep|bfs|find)(\s|$)/.test(command);
}

export function searchBeforeEdit(calls: ToolCall[]): boolean {
  const changeTurn = firstChangeTurn(calls);
  if (changeTurn === undefined) return false;
  return calls.some(
    (call) =>
      (call.name === "grep" || call.name === "glob" || isSearchLikeBashCall(call)) &&
      call.turn < changeTurn
  );
}

export function bashCalls(calls: ToolCall[]): ToolCall[] {
  return calls.filter((call) => call.name === "bash");
}

export function bashCommand(call: ToolCall): string {
  const args = decodeArgs(BashArgsSchema, call);
  return args?.command ?? "";
}

export function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

export function bashCommandMatches(call: ToolCall, matcher: RegExp | string): boolean {
  const command = bashCommand(call);
  return typeof matcher === "string"
    ? normalizeCommand(command) === normalizeCommand(matcher)
    : matcher.test(command);
}

export function failedVerificationBeforeChange(
  calls: ToolCall[],
  changeTurn: number | undefined,
  matcher: RegExp | string
): boolean {
  return (
    changeTurn !== undefined &&
    calls.some(
      (call) => call.turn < changeTurn && !bashPassed(call) && bashCommandMatches(call, matcher)
    )
  );
}

export function passedVerificationAfterChange(
  calls: ToolCall[],
  changeTurn: number | undefined,
  matcher: RegExp | string
): boolean {
  return (
    changeTurn !== undefined &&
    calls.some(
      (call) => call.turn > changeTurn && bashPassed(call) && bashCommandMatches(call, matcher)
    )
  );
}

export function firstFailedVerificationAfterChange(
  calls: ToolCall[],
  changeTurn: number | undefined,
  matcher: RegExp | string
): ToolCall | undefined {
  if (changeTurn === undefined) return undefined;
  return calls.find(
    (call) => call.turn > changeTurn && !bashPassed(call) && bashCommandMatches(call, matcher)
  );
}

export function computeLineRange(
  source: string,
  marker: RegExp
): { start: number; end: number } | null {
  const match = marker.exec(source);
  if (!match) return null;
  const start = source.slice(0, match.index).split("\n").length;
  let depth = 0;
  let seenBrace = false;
  for (let index = match.index; index < source.length; index++) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
      seenBrace = true;
    } else if (char === "}") {
      depth -= 1;
      if (seenBrace && depth === 0) {
        return {
          start,
          end: source.slice(0, index + 1).split("\n").length,
        };
      }
    }
  }
  return null;
}

export function extractReportedLineRange(stdout: string): { start: number; end: number } | null {
  const explicitRange =
    /line(?:s)?\s*(\d+)\s*(?:-|–|—|to)\s*(\d+)/i.exec(stdout) ??
    /(\d+)\s*(?:-|–|—)\s*(\d+)/.exec(stdout);
  if (!explicitRange) return null;
  const start = Number.parseInt(explicitRange[1] ?? "", 10);
  const end = Number.parseInt(explicitRange[2] ?? "", 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function rangesWithinTolerance(
  actual: { start: number; end: number },
  reported: { start: number; end: number } | null,
  tolerance: number
): boolean {
  return (
    reported !== null &&
    Math.abs(actual.start - reported.start) <= tolerance &&
    Math.abs(actual.end - reported.end) <= tolerance
  );
}

export function createPointBasedEvaluation(
  checks: Check[],
  labels: { pass: string; partial: string; fail: string }
): ScenarioEvaluation {
  const points = checks.filter((check) => check.pass).length;
  const maxPoints = checks.length;
  if (points === maxPoints) return Evaluation.pass(maxPoints, checks, labels.pass);
  if (points > 0) return Evaluation.partial(points, maxPoints, checks, labels.partial);
  return Evaluation.fail(maxPoints, checks, labels.fail);
}

export function createSkippedEvaluation(checkName: string, detail: string): ScenarioEvaluation {
  return {
    status: "fail",
    points: 0,
    maxPoints: 0,
    checks: [{ name: checkName, pass: false, detail }],
    summary: detail,
  };
}

export function numberLines(source: string): string {
  return source
    .split("\n")
    .map((line, index) => `${String(index + 1).padStart(5, " ")}: ${line}`)
    .join("\n");
}

async function* walkFiles(dir: string, root: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(root, full);
    if (entry.isDirectory()) {
      yield* walkFiles(full, root);
    } else if (entry.isFile()) {
      yield rel.replaceAll(sep, "/");
    }
  }
}

export async function changedFilesSincePristine(input: {
  playgroundDir: string;
  pristineDir?: string;
  root?: string;
}): Promise<string[]> {
  const pristineDir = input.pristineDir ?? PLAYGROUND_SRC;
  const currentDir = join(input.playgroundDir, "playground");

  const pristineFiles = new Map<string, string>();
  const currentFiles = new Map<string, string>();

  try {
    for await (const rel of walkFiles(pristineDir, pristineDir)) {
      pristineFiles.set(rel, join(pristineDir, rel));
    }
  } catch {
    /* ignore empty or missing pristine dir */
  }

  try {
    for await (const rel of walkFiles(currentDir, currentDir)) {
      currentFiles.set(rel, join(currentDir, rel));
    }
  } catch {
    /* ignore empty or missing current dir */
  }

  const changed: string[] = [];
  const allRels = new Set([...pristineFiles.keys(), ...currentFiles.keys()]);

  for (const rel of allRels) {
    const pPath = pristineFiles.get(rel);
    const cPath = currentFiles.get(rel);

    if (!pPath || !cPath) {
      changed.push(`playground/${rel}`);
      continue;
    }

    const [pStat, cStat] = await Promise.all([stat(pPath), stat(cPath)]);
    if (pStat.size !== cStat.size) {
      changed.push(`playground/${rel}`);
      continue;
    }

    const [pContent, cContent] = await Promise.all([
      readFile(pPath, "utf-8").catch(() => null),
      readFile(cPath, "utf-8").catch(() => null),
    ]);

    if (pContent !== cContent) {
      changed.push(`playground/${rel}`);
    }
  }

  return changed.toSorted();
}

export async function onlyChangedFiles(input: {
  playgroundDir: string;
  allowedPaths: string[];
  pristineDir?: string;
}): Promise<{ pass: boolean; changed: string[]; detail: string }> {
  const changed = await changedFilesSincePristine(input);
  if (changed.length === 0) {
    return { pass: false, changed, detail: "no files changed" };
  }
  const allAllowed = changed.every((path) => input.allowedPaths.includes(path));
  const detail = `changed: ${changed.join(", ")}; allowed: ${input.allowedPaths.join(", ")}`;
  return { pass: allAllowed, changed, detail };
}

export async function noFilesChanged(input: {
  playgroundDir: string;
  pristineDir?: string;
}): Promise<{ pass: boolean; changed: string[]; detail: string }> {
  const changed = await changedFilesSincePristine(input);
  const pass = changed.length === 0;
  return {
    pass,
    changed,
    detail: pass ? "no files changed" : `changed: ${changed.join(", ")}`,
  };
}
