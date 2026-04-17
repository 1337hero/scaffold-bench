#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { runScenario } from "./lib/orchestrator.ts";
import { scenarios } from "./lib/scenarios.ts";
import { localRuntime } from "./lib/runtimes/local-agent.ts";
import type { Runtime, RuntimeEvent } from "./lib/runtimes/types.ts";
import type { Category, ScenarioResult, ScenarioStatus, ToolCall } from "./lib/scoring.ts";

const RUNTIMES: Record<string, Runtime> = {
  local: localRuntime,
};

const { values } = parseArgs({
  options: {
    runtime: { type: "string", short: "r", default: "local" },
    mode: { type: "string", short: "m", default: "lite" },
    scenario: { type: "string", short: "s" },
    timeout: { type: "string", short: "t", default: "180000" },
  },
  strict: true,
});

const runtimeName = String(values.runtime);
const runtime = RUNTIMES[runtimeName];
if (!runtime) {
  console.error(`Unknown runtime: ${runtimeName}. Choices: ${Object.keys(RUNTIMES).join(", ")}`);
  process.exit(1);
}

const mode = String(values.mode);
const timeoutMs = Number(values.timeout);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error(`Invalid --timeout: ${values.timeout}. Must be a positive number (ms).`);
  process.exit(1);
}
const filter = values.scenario ? String(values.scenario) : undefined;
const activeScenarios = filter ? scenarios.filter((s) => s.name === filter || s.id === filter) : scenarios;

if (activeScenarios.length === 0) {
  console.error(`No scenarios matched "${filter}". Available: ${scenarios.map((s) => s.name).join(", ")}`);
  process.exit(1);
}

const categories: Category[] = ["surgical-edit", "audit", "scope-discipline", "read-only-analysis", "verify-and-repair"];

function countStatus(s: "pass" | "partial" | "fail", rs: ScenarioResult[]): number {
  return rs.filter((r) => r.evaluation.status === s).length;
}

function printPlainSummary(
  results: ScenarioResult[],
  totalPoints: number,
  maxPoints: number,
  totalTime: number,
  totalTools: number,
  outPath: string,
): void {
  console.log();
  console.log("━".repeat(72));
  console.log("  SUMMARY");
  console.log("━".repeat(72));
  console.log(`  Score:   ${totalPoints}/${maxPoints} points  (${results.length} scenarios, 2pt max each)`);
  console.log(`  Status:  ${countStatus("pass", results)}✓  ${countStatus("partial", results)}◐  ${countStatus("fail", results)}✗`);
  console.log(`  Tools:   ${totalTools} calls`);
  console.log(`  Time:    ${Math.round(totalTime / 1000)}s total`);
  console.log();
  console.log("  By category:");
  for (const cat of categories) {
    const rows = results.filter((r) => r.category === cat);
    if (rows.length === 0) continue;
    const pts = rows.reduce((sum, r) => sum + r.evaluation.points, 0);
    const max = rows.length * 2;
    console.log(`    ${cat.padEnd(22)} ${pts}/${max}`);
  }
  console.log();
  console.log(`  Results: ${outPath}`);
  console.log("━".repeat(72));
}

type BenchScenarioView = {
  id: string;
  name: string;
  prompt: string;
  category: Category;
  stage: "pending" | "running" | "done";
  startedAt?: number;
  finishedAt?: number;
  transcript: string[];
  toolCalls: ToolCall[];
  misses: string[];
  result?: ScenarioResult;
};

type DashboardRenderState = {
  runtimeName: string;
  mode: string;
  scenarios: BenchScenarioView[];
  startedAt: number;
  activeIndex: number;
  final: boolean;
  resultsPath?: string;
  totalPoints?: number;
  maxPoints?: number;
  totalTime?: number;
  totalTools?: number;
};

class BenchDashboard {
  readonly scenarios: BenchScenarioView[];
  readonly startedAt = Date.now();
  private interval?: ReturnType<typeof setInterval>;
  private lastFrame = "";
  private sigintHandler?: () => void;

  constructor(scenarios: Array<Pick<BenchScenarioView, "id" | "name" | "prompt" | "category">>) {
    this.scenarios = scenarios.map((scenario) => ({
      ...scenario,
      stage: "pending",
      transcript: [],
      toolCalls: [],
      misses: [],
    }));
  }

  attach(): void {
    process.stdout.write("\x1b[?25l");
    const renderTick = () => {
      this.render({
        runtimeName: "local",
        mode,
        scenarios: this.scenarios,
        startedAt: this.startedAt,
        activeIndex: this.scenarios.findIndex((s) => s.stage === "running"),
        final: false,
      });
    };
    this.interval = setInterval(renderTick, 250);
    this.sigintHandler = () => {
      this.dispose();
      process.exit(130);
    };
    process.on("SIGINT", this.sigintHandler);
  }

  dispose(): void {
    if (this.interval) clearInterval(this.interval);
    if (this.sigintHandler) process.off("SIGINT", this.sigintHandler);
    process.stdout.write("\x1b[?25h");
  }

  finish(): void {
    if (this.interval) clearInterval(this.interval);
    if (this.sigintHandler) process.off("SIGINT", this.sigintHandler);
    process.stdout.write("\n\x1b[?25h");
  }

  render(state: DashboardRenderState): void {
    const frame = renderDashboard(state, process.stdout.columns ?? 120, process.stdout.rows ?? 32);
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    process.stdout.write(`\x1b[H\x1b[J${frame}`);
  }
}

function renderDashboard(state: DashboardRenderState, width: number, height: number): string {
  const safeWidth = Math.max(80, width);
  const bodyHeight = Math.max(16, height - 8);
  const leftWidth = Math.min(42, Math.max(30, Math.floor(safeWidth * 0.34)));
  const rightWidth = safeWidth - leftWidth - 3;
  const activeIndex = state.activeIndex >= 0 ? state.activeIndex : 0;
  const active = state.scenarios[Math.min(activeIndex, state.scenarios.length - 1)];
  const elapsed = Date.now() - state.startedAt;
  const completed = state.scenarios.filter((scenario) => scenario.stage === "done").length;
  const totalPoints = state.totalPoints ?? state.scenarios.reduce((sum, scenario) => sum + (scenario.result?.evaluation.points ?? 0), 0);
  const maxPoints = state.maxPoints ?? state.scenarios.length * 2;

  const header = [
    fit(`scaffold-bench  runtime=${state.runtimeName}  mode=${state.mode}`, safeWidth),
    fit(
      state.final
        ? `finished  scenarios=${state.scenarios.length}  score=${totalPoints}/${maxPoints}  tools=${state.totalTools ?? totalToolCalls(state.scenarios)}  time=${formatDuration(state.totalTime ?? elapsed)}`
        : `progress=${completed}/${state.scenarios.length}  score=${totalPoints}/${maxPoints}  active=${active?.id ?? "-"}  elapsed=${formatDuration(elapsed)}`,
      safeWidth,
    ),
    "─".repeat(safeWidth),
  ];

  const leftLines = renderScenarioList(state.scenarios, leftWidth, bodyHeight);
  const rightLines = state.final
    ? renderFinalDetails(state, rightWidth, bodyHeight)
    : renderActiveDetails(active, rightWidth, bodyHeight);

  const body: string[] = [];
  for (let i = 0; i < bodyHeight; i++) {
    body.push(`${pad(leftLines[i] ?? "", leftWidth)} │ ${pad(rightLines[i] ?? "", rightWidth)}`);
  }

  const footer = [
    "─".repeat(safeWidth),
    fit(
      state.final
        ? `Results: ${state.resultsPath ?? ""}`
        : "Tracking live tool activity and assistant output. Final summary appears here when the run completes.",
      safeWidth,
    ),
  ];

  return [...header, ...body, ...footer].join("\n");
}

function renderScenarioList(scenarios: BenchScenarioView[], width: number, height: number): string[] {
  const lines = ["Scenarios", ""];
  for (const scenario of scenarios) {
    const icon =
      scenario.stage === "pending"
        ? "·"
        : scenario.stage === "running"
          ? "▶"
          : statusIcon(scenario.result?.evaluation.status ?? "fail");
    const points = scenario.result ? `${scenario.result.evaluation.points}pt` : "--";
    const elapsed = scenario.result
      ? formatDuration(scenario.result.output.wallTimeMs)
      : scenario.startedAt
        ? formatDuration(Date.now() - scenario.startedAt)
        : "--";
    lines.push(fit(`${icon} ${scenario.id} ${scenario.name}`, width));
    lines.push(fit(`   ${scenario.category}  ${points}  ${elapsed}`, width));
  }
  return takeHeight(lines, height);
}

function renderActiveDetails(active: BenchScenarioView | undefined, width: number, height: number): string[] {
  if (!active) return takeHeight(["Active", "", "No scenario selected."], height);

  const lines = [
    "Active",
    "",
    fit(`${active.id}  ${active.name}`, width),
    fit(`stage=${active.stage}  tools=${active.toolCalls.length}  elapsed=${active.startedAt ? formatDuration((active.finishedAt ?? Date.now()) - active.startedAt) : "--"}`, width),
    "",
    "Prompt",
    ...wrap(active.prompt, width),
    "",
  ];

  const detailsTitle = active.misses.length > 0 ? "Misses" : "Recent";
  lines.push(detailsTitle);
  const detailLines = active.misses.length > 0
    ? active.misses.flatMap((line) => wrap(`• ${line}`, width))
    : (active.transcript.length > 0 ? active.transcript.flatMap((line) => wrap(line, width)) : ["Waiting for runtime events..."]);
  lines.push(...tailLines(detailLines, Math.max(4, height - lines.length)));
  return takeHeight(lines, height);
}

function renderFinalDetails(state: DashboardRenderState, width: number, height: number): string[] {
  const lines = [
    "Final Results",
    "",
    fit(`score=${state.totalPoints ?? 0}/${state.maxPoints ?? 0}`, width),
    fit(`status=${countStatus("pass", state.scenarios.flatMap((scenario) => scenario.result ? [scenario.result] : []))}✓  ${countStatus("partial", state.scenarios.flatMap((scenario) => scenario.result ? [scenario.result] : []))}◐  ${countStatus("fail", state.scenarios.flatMap((scenario) => scenario.result ? [scenario.result] : []))}✗`, width),
    fit(`tools=${state.totalTools ?? totalToolCalls(state.scenarios)}  time=${formatDuration(state.totalTime ?? 0)}`, width),
    "",
    "Categories",
  ];

  for (const cat of categories) {
    const rows = state.scenarios.flatMap((scenario) => scenario.result && scenario.result.category === cat ? [scenario.result] : []);
    if (rows.length === 0) continue;
    const pts = rows.reduce((sum, row) => sum + row.evaluation.points, 0);
    lines.push(fit(`${cat}  ${pts}/${rows.length * 2}`, width));
  }

  const misses = state.scenarios.flatMap((scenario) => {
    if (!scenario.result || scenario.result.evaluation.checks.every((check) => check.pass)) return [];
    return [``, `${scenario.id} ${scenario.name}`].concat(
      scenario.result.evaluation.checks
        .filter((check) => !check.pass)
        .flatMap((check) => wrap(`• ${check.name}${check.detail ? ` — ${check.detail.slice(0, 80)}` : ""}`, width)),
    );
  });

  if (misses.length > 0) {
    lines.push("", "Misses", ...misses);
  }

  if (state.resultsPath) {
    lines.push("", fit(`saved: ${state.resultsPath}`, width));
  }

  return takeHeight(lines, height);
}

function applyRuntimeEvent(view: BenchScenarioView, event: RuntimeEvent): void {
  if (event.type === "assistant") {
    view.transcript = tailLines(view.transcript.concat(wrap(`Qwopus: ${event.content}`, 200)), 12);
    return;
  }
  view.toolCalls = view.toolCalls.concat(event.call);
  view.transcript = tailLines(view.transcript.concat(`tool: ${event.call.name}(${truncateMiddle(event.call.args, 120)})`), 12);
}

function totalToolCalls(scenarios: BenchScenarioView[]): number {
  return scenarios.reduce((sum, scenario) => sum + (scenario.result?.output.toolCalls.length ?? scenario.toolCalls.length), 0);
}

function statusIcon(status: ScenarioStatus): string {
  return status === "pass" ? "✓" : status === "partial" ? "◐" : "✗";
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function fit(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;
}

function pad(text: string, width: number): string {
  return fit(text, width).padEnd(width, " ");
}

function wrap(text: string, width: number): string[] {
  if (width <= 0) return [""];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= width) {
      current += ` ${word}`;
      continue;
    }
    lines.push(fit(current, width));
    current = word;
  }
  lines.push(fit(current, width));
  return lines;
}

function takeHeight(lines: string[], height: number): string[] {
  if (lines.length >= height) return lines.slice(0, height);
  return lines.concat(Array.from({ length: height - lines.length }, () => ""));
}

function tailLines<T>(lines: T[], count: number): T[] {
  return lines.slice(Math.max(0, lines.length - count));
}

function truncateMiddle(text: string, width: number): string {
  if (text.length <= width) return text;
  const left = Math.floor((width - 1) / 2);
  const right = width - left - 1;
  return `${text.slice(0, left)}…${text.slice(text.length - right)}`;
}

async function main(): Promise<void> {
  const results: ScenarioResult[] = [];
  const ui = process.stdout.isTTY ? new BenchDashboard(activeScenarios.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    prompt: scenario.prompt,
    category: scenario.category,
  }))) : null;

  let finished = false;

  try {
    ui?.attach();
    if (ui) {
      ui.render({
        runtimeName: runtime.name,
        mode,
        scenarios: ui.scenarios,
        startedAt: ui.startedAt,
        activeIndex: 0,
        final: false,
      });
    } else {
      console.log("━".repeat(72));
      console.log(`  scaffold-bench — runtime=${runtime.name} mode=${mode}`);
      console.log("━".repeat(72));
    }

    for (const [index, scenario] of activeScenarios.entries()) {
      const view = ui?.scenarios[index];
      if (view) {
        view.stage = "running";
        view.startedAt = Date.now();
        view.transcript = [];
        view.toolCalls = [];
      }

      if (!ui) {
        process.stdout.write(`  ${scenario.id.padEnd(6)} ${scenario.name.padEnd(22)} `);
      } else {
        ui.render({
          runtimeName: runtime.name,
          mode,
          scenarios: ui.scenarios,
          startedAt: ui.startedAt,
          activeIndex: index,
          final: false,
        });
      }

      const result = await runScenario({
        runtime,
        scenario,
        mode,
        timeoutMs,
        onRuntimeEvent: (event) => {
          if (!view) return;
          applyRuntimeEvent(view, event);
          ui?.render({
            runtimeName: runtime.name,
            mode,
            scenarios: ui.scenarios,
            startedAt: ui.startedAt,
            activeIndex: index,
            final: false,
          });
        },
      });

      results.push(result);

      if (view) {
        view.stage = "done";
        view.finishedAt = Date.now();
        view.result = result;
        view.toolCalls = result.output.toolCalls;
        view.transcript = tailLines(result.output.stdout.split("\n").filter(Boolean), 10);
        view.misses = result.evaluation.checks
          .filter((check) => !check.pass)
          .map((check) => `${check.name}${check.detail ? ` — ${check.detail.slice(0, 80)}` : ""}`);
      }

      if (!ui) {
        const statusTag = {
          pass: "✓ PASS",
          partial: "◐ PART",
          fail: "✗ FAIL",
        }[result.evaluation.status];

        const toolCount = result.output.toolCalls.length;
        const timeS = Math.round(result.output.wallTimeMs / 1000);
        console.log(`${statusTag} (${result.evaluation.points}pt)  ${toolCount} tools  ${timeS}s`);

        for (const check of result.evaluation.checks.filter((c) => !c.pass)) {
          console.log(`    · miss: ${check.name}${check.detail ? ` — ${check.detail.slice(0, 60)}` : ""}`);
        }
      }
    }

    const totalPoints = results.reduce((sum, r) => sum + r.evaluation.points, 0);
    const maxPoints = results.length * 2;
    const totalTime = results.reduce((sum, r) => sum + r.output.wallTimeMs, 0);
    const totalTools = results.reduce((sum, r) => sum + r.output.toolCalls.length, 0);

    const timestamp = Date.now();
    const resultsDir = join(import.meta.dir, "results");
    await mkdir(resultsDir, { recursive: true });
    const outPath = join(resultsDir, `${timestamp}-${runtime.name}-${mode}.json`);
    await Bun.write(outPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      runtime: runtime.name,
      mode,
      totalPoints,
      maxPoints,
      results: results.map((r) => ({
        scenarioId: r.scenarioId,
        category: r.category,
        status: r.evaluation.status,
        points: r.evaluation.points,
        toolCallCount: r.output.toolCalls.length,
        wallTimeMs: r.output.wallTimeMs,
        error: r.output.error,
        checks: r.evaluation.checks,
      })),
    }, null, 2));

    if (ui) {
      ui.render({
        runtimeName: runtime.name,
        mode,
        scenarios: ui.scenarios,
        startedAt: ui.startedAt,
        activeIndex: Math.max(0, ui.scenarios.length - 1),
        final: true,
        resultsPath: outPath,
        totalPoints,
        maxPoints,
        totalTime,
        totalTools,
      });
      ui.finish();
      finished = true;
    } else {
      printPlainSummary(results, totalPoints, maxPoints, totalTime, totalTools, outPath);
    }
  } finally {
    if (ui && !finished) ui.dispose();
  }
}

await main();
