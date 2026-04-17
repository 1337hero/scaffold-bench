import type { RuntimeEvent } from "./runtimes/types.ts";
import type { Category, ScenarioResult, ScenarioStatus, ToolCall } from "./scoring.ts";

const CATEGORIES: Category[] = [
  "surgical-edit",
  "audit",
  "scope-discipline",
  "read-only-analysis",
  "verify-and-repair",
];

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

export type ScenarioViewSeed = {
  id: string;
  name: string;
  prompt: string;
  category: Category;
};

export type BenchScenarioView = {
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

export class BenchDashboard {
  readonly scenarios: BenchScenarioView[];
  readonly startedAt = Date.now();
  private interval?: ReturnType<typeof setInterval>;
  private lastFrame = "";
  private sigintHandler?: () => void;

  constructor(
    private readonly runtimeName: string,
    private readonly mode: string,
    scenarios: ScenarioViewSeed[]
  ) {
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
    this.interval = setInterval(() => this.tick(this.findActiveIndex()), 250);
    this.sigintHandler = () => {
      this.dispose();
      process.exit(130);
    };
    process.on("SIGINT", this.sigintHandler);
  }

  beginScenario(index: number): void {
    const view = this.scenarios[index];
    if (!view) return;
    view.stage = "running";
    view.startedAt = Date.now();
    view.transcript = [];
    view.toolCalls = [];
    view.misses = [];
    this.tick(index);
  }

  recordEvent(index: number, event: RuntimeEvent): void {
    const view = this.scenarios[index];
    if (!view) return;
    applyRuntimeEvent(view, event);
    this.tick(index);
  }

  completeScenario(index: number, result: ScenarioResult): void {
    const view = this.scenarios[index];
    if (!view) return;
    view.stage = "done";
    view.finishedAt = Date.now();
    view.result = result;
    view.toolCalls = result.output.toolCalls;
    view.transcript = tailLines(result.output.stdout.split("\n").filter(Boolean), 10);
    view.misses = result.evaluation.checks
      .filter((check) => !check.pass)
      .map((check) => `${check.name}${check.detail ? ` - ${check.detail.slice(0, 80)}` : ""}`);
    this.tick(index);
  }

  tick(activeIndex: number): void {
    this.render({
      runtimeName: this.runtimeName,
      mode: this.mode,
      scenarios: this.scenarios,
      startedAt: this.startedAt,
      activeIndex,
      final: false,
    });
  }

  renderFinal(summary: {
    resultsPath: string;
    totalPoints: number;
    maxPoints: number;
    totalTime: number;
    totalTools: number;
  }): void {
    this.render({
      runtimeName: this.runtimeName,
      mode: this.mode,
      scenarios: this.scenarios,
      startedAt: this.startedAt,
      activeIndex: Math.max(0, this.scenarios.length - 1),
      final: true,
      resultsPath: summary.resultsPath,
      totalPoints: summary.totalPoints,
      maxPoints: summary.maxPoints,
      totalTime: summary.totalTime,
      totalTools: summary.totalTools,
    });
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

  private findActiveIndex(): number {
    return this.scenarios.findIndex((scenario) => scenario.stage === "running");
  }

  private render(state: DashboardRenderState): void {
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
  const totalPoints =
    state.totalPoints ??
    state.scenarios.reduce((sum, scenario) => sum + (scenario.result?.evaluation.points ?? 0), 0);
  const maxPoints = state.maxPoints ?? state.scenarios.length * 2;

  const header = [
    fit(`scaffold-bench  runtime=${state.runtimeName}  mode=${state.mode}`, safeWidth),
    fit(
      state.final
        ? `finished  scenarios=${state.scenarios.length}  score=${totalPoints}/${maxPoints}  tools=${state.totalTools ?? totalToolCalls(state.scenarios)}  time=${formatDuration(state.totalTime ?? elapsed)}`
        : `progress=${completed}/${state.scenarios.length}  score=${totalPoints}/${maxPoints}  active=${active?.id ?? "-"}  elapsed=${formatDuration(elapsed)}`,
      safeWidth
    ),
    "-".repeat(safeWidth),
  ];

  const leftLines = renderScenarioList(state.scenarios, leftWidth, bodyHeight);
  const rightLines = state.final
    ? renderFinalDetails(state, rightWidth, bodyHeight)
    : renderActiveDetails(active, rightWidth, bodyHeight);

  const body: string[] = [];
  for (let i = 0; i < bodyHeight; i++) {
    body.push(`${pad(leftLines[i] ?? "", leftWidth)} | ${pad(rightLines[i] ?? "", rightWidth)}`);
  }

  const footer = [
    "-".repeat(safeWidth),
    fit(
      state.final
        ? `Results: ${state.resultsPath ?? ""}`
        : "Tracking live tool activity and assistant output. Final summary appears here when the run completes.",
      safeWidth
    ),
  ];

  return [...header, ...body, ...footer].join("\n");
}

function renderScenarioList(
  scenarios: BenchScenarioView[],
  width: number,
  height: number
): string[] {
  const lines = ["Scenarios", ""];
  for (const scenario of scenarios) {
    const icon =
      scenario.stage === "pending"
        ? "."
        : scenario.stage === "running"
          ? ">"
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

function renderActiveDetails(
  active: BenchScenarioView | undefined,
  width: number,
  height: number
): string[] {
  if (!active) return takeHeight(["Active", "", "No scenario selected."], height);

  const lines = [
    "Active",
    "",
    fit(`${active.id}  ${active.name}`, width),
    fit(
      `stage=${active.stage}  tools=${active.toolCalls.length}  elapsed=${active.startedAt ? formatDuration((active.finishedAt ?? Date.now()) - active.startedAt) : "--"}`,
      width
    ),
    "",
    "Prompt",
    ...wrap(active.prompt, width),
    "",
  ];

  const detailsTitle = active.misses.length > 0 ? "Misses" : "Recent";
  lines.push(detailsTitle);
  const detailLines =
    active.misses.length > 0
      ? active.misses.flatMap((line) => wrap(`* ${line}`, width))
      : active.transcript.length > 0
        ? active.transcript.flatMap((line) => wrap(line, width))
        : ["Waiting for runtime events..."];
  lines.push(...tailLines(detailLines, Math.max(4, height - lines.length)));
  return takeHeight(lines, height);
}

function renderFinalDetails(state: DashboardRenderState, width: number, height: number): string[] {
  const results = state.scenarios.flatMap((scenario) => (scenario.result ? [scenario.result] : []));
  const lines = [
    "Final Results",
    "",
    fit(`score=${state.totalPoints ?? 0}/${state.maxPoints ?? 0}`, width),
    fit(
      `status=${countStatus("pass", results)}${statusIcon("pass")}  ${countStatus("partial", results)}${statusIcon("partial")}  ${countStatus("fail", results)}${statusIcon("fail")}`,
      width
    ),
    fit(
      `tools=${state.totalTools ?? totalToolCalls(state.scenarios)}  time=${formatDuration(state.totalTime ?? 0)}`,
      width
    ),
    "",
    "Categories",
  ];

  for (const category of CATEGORIES) {
    const rows = results.filter((result) => result.category === category);
    if (rows.length === 0) continue;
    const points = rows.reduce((sum, row) => sum + row.evaluation.points, 0);
    lines.push(fit(`${category}  ${points}/${rows.length * 2}`, width));
  }

  const misses = state.scenarios.flatMap((scenario) => {
    if (!scenario.result || scenario.result.evaluation.checks.every((check) => check.pass)) {
      return [];
    }
    return [``, `${scenario.id} ${scenario.name}`].concat(
      scenario.result.evaluation.checks
        .filter((check) => !check.pass)
        .flatMap((check) =>
          wrap(`* ${check.name}${check.detail ? ` - ${check.detail.slice(0, 80)}` : ""}`, width)
        )
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
    view.transcript = tailLines(
      view.transcript.concat(wrap(`assistant: ${event.content}`, 200)),
      12
    );
    return;
  }
  view.toolCalls = view.toolCalls.concat(event.call);
  view.transcript = tailLines(
    view.transcript.concat(`tool: ${event.call.name}(${truncateMiddle(event.call.args, 120)})`),
    12
  );
}

function countStatus(status: ScenarioStatus, results: ScenarioResult[]): number {
  return results.filter((result) => result.evaluation.status === status).length;
}

function totalToolCalls(scenarios: BenchScenarioView[]): number {
  return scenarios.reduce(
    (sum, scenario) =>
      sum + (scenario.result?.output.toolCalls.length ?? scenario.toolCalls.length),
    0
  );
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
