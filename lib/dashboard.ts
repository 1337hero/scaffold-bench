import type { RuntimeEvent } from "./runtimes/types.ts";
import {
  completionTokensPerSecond,
  mergeModelMetrics,
  promptTokensPerSecond,
} from "./scoring.ts";
import type {
  Category,
  ModelMetrics,
  ScenarioResult,
  ScenarioStatus,
  ToolCall,
} from "./scoring.ts";

const CATEGORIES: Category[] = [
  "surgical-edit",
  "audit",
  "scope-discipline",
  "read-only-analysis",
  "verify-and-repair",
];

type DashboardLogKind = "assistant" | "tool" | "stdout" | "stderr" | "system";
type VerificationStatus = "idle" | "pass" | "fail";

type DashboardLogEntry = {
  id: number;
  kind: DashboardLogKind;
  label: string;
  text: string;
  time: string;
};

type DashboardRenderState = {
  runtimeName: string;
  scenarios: BenchScenarioView[];
  startedAt: number;
  activeIndex: number;
  final: boolean;
  resultsPath?: string;
  totalPoints?: number;
  maxPoints?: number;
  totalTime?: number;
  totalTools?: number;
  modelMetrics?: ModelMetrics;
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
  logs: DashboardLogEntry[];
  toolCalls: ToolCall[];
  misses: string[];
  streamBuffer: string;
  liveMetrics?: ModelMetrics;
  latestIssue?: string;
  verificationStatus: VerificationStatus;
  verificationSummary?: string;
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
    scenarios: ScenarioViewSeed[]
  ) {
    this.scenarios = scenarios.map((scenario) => ({
      ...scenario,
      stage: "pending",
      logs: [],
      toolCalls: [],
      misses: [],
      streamBuffer: "",
      verificationStatus: "idle",
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
    view.logs = [
      createLogEntry(
        "system",
        "system",
        `loaded prompt for ${view.id} (${view.category})`
      ),
    ];
    view.toolCalls = [];
    view.misses = [];
    view.streamBuffer = "";
    view.liveMetrics = undefined;
    view.latestIssue = undefined;
    view.verificationStatus = "idle";
    view.verificationSummary = undefined;
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
    view.liveMetrics = result.output.modelMetrics ?? view.liveMetrics;
    view.misses = result.evaluation.checks
      .filter((check) => !check.pass)
      .map((check) => `${check.name}${check.detail ? ` - ${check.detail.slice(0, 120)}` : ""}`);

    if (view.streamBuffer.trim()) {
      pushLog(view, "assistant", "assistant", view.streamBuffer.trim());
      view.streamBuffer = "";
    }

    if (result.output.error) {
      view.latestIssue = result.output.error;
      view.verificationStatus = "fail";
      view.verificationSummary = result.output.error;
      pushLog(view, "stderr", "runtime", result.output.error);
    } else {
      view.verificationStatus =
        result.evaluation.status === "fail"
          ? "fail"
          : result.evaluation.checks.some((check) => !check.pass)
            ? "pass"
            : "pass";
      view.verificationSummary = result.evaluation.summary;
      pushLog(
        view,
        result.evaluation.status === "fail" ? "stderr" : "stdout",
        "verify",
        result.evaluation.summary
      );
    }

    this.tick(index);
  }

  tick(activeIndex: number): void {
    this.render({
      runtimeName: this.runtimeName,
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
    modelMetrics?: ModelMetrics;
  }): void {
    this.render({
      runtimeName: this.runtimeName,
      scenarios: this.scenarios,
      startedAt: this.startedAt,
      activeIndex: Math.max(0, this.scenarios.length - 1),
      final: true,
      resultsPath: summary.resultsPath,
      totalPoints: summary.totalPoints,
      maxPoints: summary.maxPoints,
      totalTime: summary.totalTime,
      totalTools: summary.totalTools,
      modelMetrics: summary.modelMetrics,
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

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GOLD = "\x1b[38;2;245;158;11m";
const GOLD_DIM = "\x1b[38;2;161;98;7m";
const GREEN = "\x1b[38;2;46;204;113m";
const RED = "\x1b[38;2;231;76;60m";
const BLUE = "\x1b[38;2;52;152;219m";
const ZINC = "\x1b[38;2;148;163;184m";
const TEXT = "\x1b[38;2;226;232;240m";

function renderDashboard(state: DashboardRenderState, width: number, height: number): string {
  const safeWidth = Math.max(100, width);
  const safeHeight = Math.max(24, height);
  const activeIndex = state.activeIndex >= 0 ? state.activeIndex : 0;
  const active = state.scenarios[Math.min(activeIndex, Math.max(0, state.scenarios.length - 1))];
  const elapsed = Date.now() - state.startedAt;
  const totalPoints =
    state.totalPoints ??
    state.scenarios.reduce((sum, scenario) => sum + (scenario.result?.evaluation.points ?? 0), 0);
  const maxPoints = state.maxPoints ?? state.scenarios.length * 2;
  const completed = state.scenarios.filter((scenario) => scenario.stage === "done").length;
  const passCount = state.scenarios.filter(
    (scenario) => scenario.result?.evaluation.status === "pass"
  ).length;
  const partialCount = state.scenarios.filter(
    (scenario) => scenario.result?.evaluation.status === "partial"
  ).length;
  const failCount = state.scenarios.filter(
    (scenario) => scenario.result?.evaluation.status === "fail"
  ).length;

  const header = renderHeaderRibbon(
    state,
    safeWidth,
    active,
    elapsed,
    completed,
    totalPoints,
    maxPoints,
    passCount,
    partialCount,
    failCount
  );
  const footer = renderFooter(state, safeWidth, totalPoints, maxPoints, elapsed);
  const bodyHeight = Math.max(9, safeHeight - header.length - footer.length);

  const { leftWidth, centerWidth, rightWidth } = computeColumnWidths(safeWidth);
  const leftPane = renderPane(
    "Queue",
    leftWidth,
    bodyHeight,
    renderScenarioList(state.scenarios, activeIndex, leftWidth - 2, bodyHeight - 2),
    `${completed}/${state.scenarios.length}`
  );
  const centerPane = renderPane(
    active ? `Agent I/O` : "Agent I/O",
    centerWidth,
    bodyHeight,
    renderAgentStream(active, centerWidth - 2, bodyHeight - 2),
    active ? active.id : "idle"
  );
  const rightPane = renderRightColumn(state, active, rightWidth, bodyHeight);

  const body: string[] = [];
  for (let i = 0; i < bodyHeight; i++) {
    body.push(
      `${leftPane[i] ?? " ".repeat(leftWidth)}  ${centerPane[i] ?? " ".repeat(centerWidth)}  ${rightPane[i] ?? " ".repeat(rightWidth)}`
    );
  }

  return [...header, ...body, ...footer].join("\n");
}

function renderHeaderRibbon(
  state: DashboardRenderState,
  width: number,
  active: BenchScenarioView | undefined,
  elapsed: number,
  completed: number,
  totalPoints: number,
  maxPoints: number,
  passCount: number,
  partialCount: number,
  failCount: number
): string[] {
  const title = `${BOLD}${TEXT}SCAFFOLD${GOLD}BENCH${RESET}${DIM}  modern agent bench${RESET}`;
  const runtimeInfo = `${DIM}runtime=${state.runtimeName}${RESET}`;
  const scoreInfo = `${GREEN}${BOLD}${totalPoints}/${maxPoints}${RESET}${DIM} pts${RESET}`;
  const progressInfo = `${DIM}pass${RESET} ${GREEN}${passCount}${RESET}  ${DIM}partial${RESET} ${GOLD}${partialCount}${RESET}  ${DIM}fail${RESET} ${RED}${failCount}${RESET}`;
  const activeInfo = state.final
    ? `${DIM}run complete${RESET}`
    : `${DIM}active${RESET} ${active?.id ?? "-"} ${fitPlain(active?.name ?? "waiting", 28)}`;
  const completionInfo = `${DIM}elapsed${RESET} ${TEXT}${formatDuration(
    state.totalTime ?? elapsed
  )}${RESET}  ${DIM}done${RESET} ${completed}/${state.scenarios.length}`;

  return [
    padBetween(title, runtimeInfo, width),
    padBetween(`${DIM}global${RESET} ${scoreInfo}`, completionInfo, width),
    padBetween(activeInfo, progressInfo, width),
    `${GOLD_DIM}${"─".repeat(width)}${RESET}`,
  ];
}

function renderFooter(
  state: DashboardRenderState,
  width: number,
  totalPoints: number,
  maxPoints: number,
  elapsed: number
): string[] {
  const status = state.final
    ? `${DIM}results${RESET} ${fitPlain(state.resultsPath ?? "", Math.max(10, width - 10))}`
    : `${DIM}score${RESET} ${totalPoints}/${maxPoints}  ${DIM}tools${RESET} ${state.totalTools ?? totalToolCalls(state.scenarios)}  ${DIM}elapsed${RESET} ${formatDuration(elapsed)}`;
  return [`${GOLD_DIM}${"─".repeat(width)}${RESET}`, fitAnsi(status, width)];
}

function renderScenarioList(
  scenarios: BenchScenarioView[],
  activeIndex: number,
  width: number,
  height: number
): string[] {
  if (scenarios.length === 0) return takeHeight([`${DIM}no scenarios loaded${RESET}`], height);

  const rowsPerScenario = 2;
  const visibleCount = Math.max(1, Math.floor(height / rowsPerScenario));
  const anchor = activeIndex >= 0 ? activeIndex : 0;
  const start = clamp(anchor - Math.floor(visibleCount / 2), 0, Math.max(0, scenarios.length - visibleCount));
  const end = Math.min(scenarios.length, start + visibleCount);

  const lines: string[] = [];
  for (let index = start; index < end; index++) {
    const scenario = scenarios[index];
    const isActive = index === activeIndex && scenario.stage === "running";
    const icon = renderScenarioIcon(scenario);
    const id = isActive ? `${GOLD}${BOLD}${scenario.id}${RESET}` : `${TEXT}${scenario.id}${RESET}`;
    const name = isActive
      ? `${GOLD}${fitPlain(scenario.name, Math.max(8, width - scenario.id.length - 4))}${RESET}`
      : `${TEXT}${fitPlain(scenario.name, Math.max(8, width - scenario.id.length - 4))}${RESET}`;
    const points = scenario.result ? `${scenario.result.evaluation.points}pt` : "--";
    const elapsed = scenario.result
      ? formatDuration(scenario.result.output.wallTimeMs)
      : scenario.startedAt
        ? formatDuration((scenario.finishedAt ?? Date.now()) - scenario.startedAt)
        : "--:--";

    lines.push(fitAnsi(`${icon} ${id} ${name}`, width));
    lines.push(
      fitAnsi(
        `${DIM}  ${fitPlain(scenario.category, 18)}  ${points}  ${elapsed}${RESET}`,
        width
      )
    );
  }

  if (end < scenarios.length) {
    lines.push(fitAnsi(`${DIM}  +${scenarios.length - end} more scenarios${RESET}`, width));
  }

  return takeHeight(lines, height);
}

function renderAgentStream(
  active: BenchScenarioView | undefined,
  width: number,
  height: number
): string[] {
  if (!active) {
    return takeHeight([`${DIM}waiting for a scenario to start${RESET}`], height);
  }

  const lines = [
    fitAnsi(`${TEXT}${BOLD}${active.id}${RESET} ${TEXT}${active.name}${RESET}`, width),
    fitAnsi(
      `${DIM}${active.category}${RESET}  ${DIM}stage${RESET} ${renderStage(active)}  ${DIM}tools${RESET} ${active.toolCalls.length}  ${DIM}elapsed${RESET} ${formatDuration(
        active.startedAt ? (active.finishedAt ?? Date.now()) - active.startedAt : 0
      )}`,
      width
    ),
    "",
  ];

  const availableLogHeight = Math.max(1, height - lines.length);
  const blocks = active.logs.flatMap((entry) => renderLogEntry(entry, width));
  if (active.streamBuffer.trim()) {
    blocks.push(...renderLiveAssistant(active.streamBuffer.trim(), width));
  }

  const visibleLogs =
    blocks.length > 0 ? tailLines(blocks, availableLogHeight) : [`${DIM}awaiting runtime events...${RESET}`];
  return takeHeight(lines.concat(visibleLogs), height);
}

function renderRightColumn(
  state: DashboardRenderState,
  active: BenchScenarioView | undefined,
  width: number,
  height: number
): string[] {
  const metricsHeight = clamp(Math.floor(height * 0.34), 7, Math.max(7, height - 8));
  const checksHeight = Math.max(6, height - metricsHeight);
  const metricsPane = renderPane(
    "Metrics",
    width,
    metricsHeight,
    renderMetrics(active, state, width - 2, metricsHeight - 2)
  );
  const checksPane = renderPane(
    state.final ? "Run Summary" : "Verification",
    width,
    checksHeight,
    renderChecks(active, state, width - 2, checksHeight - 2)
  );
  return metricsPane.concat(checksPane);
}

function renderMetrics(
  active: BenchScenarioView | undefined,
  state: DashboardRenderState,
  width: number,
  height: number
): string[] {
  const metrics =
    active?.liveMetrics ??
    state.modelMetrics ??
    mergeModelMetrics(
      state.scenarios.map((scenario) => scenario.liveMetrics ?? scenario.result?.output.modelMetrics)
    );
  const promptTps = metrics ? promptTokensPerSecond(metrics) : undefined;
  const completionTps = metrics ? completionTokensPerSecond(metrics) : undefined;
  const bashCalls = active ? active.toolCalls.filter((call) => call.name === "bash").length : 0;
  const edits = active
    ? active.toolCalls.filter((call) => call.name === "edit" || call.name === "write").length
    : 0;

  const lines = [
    fitAnsi(
      `${DIM}runtime${RESET} ${TEXT}${state.runtimeName}${RESET}`,
      width
    ),
    fitAnsi(
      `${DIM}scenario tools${RESET} ${TEXT}${active?.toolCalls.length ?? 0}${RESET}  ${DIM}checks${RESET} ${TEXT}${bashCalls}${RESET}`,
      width
    ),
    fitAnsi(`${DIM}file edits${RESET} ${TEXT}${edits}${RESET}`, width),
  ];

  if (metrics) {
    lines.push(
      fitAnsi(`${DIM}model${RESET} ${TEXT}${fitPlain(metrics.model ?? "unknown", width - 6)}${RESET}`, width),
      fitAnsi(`${DIM}prompt tok${RESET} ${TEXT}${metrics.promptTokens}${RESET}`, width),
      fitAnsi(`${DIM}gen tok${RESET} ${GREEN}${metrics.completionTokens}${RESET}`, width),
      fitAnsi(`${DIM}requests${RESET} ${TEXT}${metrics.requestCount}${RESET}`, width)
    );

    if (promptTps !== undefined || completionTps !== undefined) {
      lines.push(
        fitAnsi(
          `${DIM}speed${RESET} ${TEXT}${promptTps?.toFixed(1) ?? "--"}p/s${RESET}  ${GREEN}${completionTps?.toFixed(1) ?? "--"}g/s${RESET}`,
          width
        )
      );
    }
  } else {
    lines.push(fitAnsi(`${DIM}waiting for model usage data...${RESET}`, width));
  }

  return takeHeight(lines, height);
}

function renderChecks(
  active: BenchScenarioView | undefined,
  state: DashboardRenderState,
  width: number,
  height: number
): string[] {
  if (state.final) {
    return renderFinalSummary(state, width, height);
  }
  if (!active) {
    return takeHeight([`${DIM}no active scenario${RESET}`], height);
  }

  const checks: string[] = [
    renderCheckLine(active.stage !== "pending" ? "pass" : "pending", "Scenario loaded"),
    renderCheckLine(
      active.logs.length > 0 || active.streamBuffer.length > 0 ? "pass" : "pending",
      "Agent output observed"
    ),
    renderCheckLine(
      active.toolCalls.length > 0 ? "pass" : "pending",
      `Tool activity (${active.toolCalls.length})`
    ),
    renderCheckLine(
      active.toolCalls.some((call) => call.name === "bash") ? "pass" : "pending",
      active.toolCalls.some((call) => call.name === "bash")
        ? "Verification commands seen"
        : "Verification pending"
    ),
  ];

  if (active.verificationStatus === "fail" && active.verificationSummary) {
    checks.push(
      renderCheckLine(false, "Latest verification failed"),
      ...wrapPlain(`detail: ${active.verificationSummary}`, width).map((line) =>
        `${RED}${fitPlain(line, width)}${RESET}`
      )
    );
  } else if (active.verificationStatus === "pass" && active.verificationSummary) {
    checks.push(renderCheckLine(true, "Latest verification passed"));
    checks.push(
      ...wrapPlain(`detail: ${active.verificationSummary}`, width).map((line) =>
        `${GREEN}${fitPlain(line, width)}${RESET}`
      )
    );
  }

  if (active.latestIssue && active.verificationStatus !== "fail") {
    checks.push(
      renderCheckLine(false, "Latest issue"),
      ...wrapPlain(active.latestIssue, width).map((line) => `${RED}${fitPlain(line, width)}${RESET}`)
    );
  }

  if (active.result) {
    checks.push("", `${TEXT}${BOLD}Evaluation${RESET}`);
    for (const check of active.result.evaluation.checks) {
      checks.push(renderCheckLine(check.pass, check.name));
      if (!check.pass && check.detail) {
        checks.push(
          ...wrapPlain(check.detail, width).map((line) => `${RED}${fitPlain(line, width)}${RESET}`)
        );
      }
    }
  }

  return takeHeight(checks, height);
}

function renderFinalSummary(state: DashboardRenderState, width: number, height: number): string[] {
  const results = state.scenarios.flatMap((scenario) => (scenario.result ? [scenario.result] : []));
  const totalPoints = state.totalPoints ?? 0;
  const maxPoints = state.maxPoints ?? results.length * 2;
  const lines = [
    fitAnsi(`${DIM}score${RESET} ${GREEN}${BOLD}${totalPoints}/${maxPoints}${RESET}`, width),
    fitAnsi(
      `${DIM}pass${RESET} ${GREEN}${countStatus("pass", results)}${RESET}  ${DIM}partial${RESET} ${GOLD}${countStatus("partial", results)}${RESET}  ${DIM}fail${RESET} ${RED}${countStatus("fail", results)}${RESET}`,
      width
    ),
    fitAnsi(
      `${DIM}tools${RESET} ${TEXT}${state.totalTools ?? totalToolCalls(state.scenarios)}${RESET}  ${DIM}time${RESET} ${TEXT}${formatDuration(state.totalTime ?? 0)}${RESET}`,
      width
    ),
    "",
    `${TEXT}${BOLD}Categories${RESET}`,
  ];

  for (const category of CATEGORIES) {
    const rows = results.filter((result) => result.category === category);
    if (rows.length === 0) continue;
    const points = rows.reduce((sum, row) => sum + row.evaluation.points, 0);
    lines.push(fitAnsi(`${DIM}${category}${RESET} ${TEXT}${points}/${rows.length * 2}${RESET}`, width));
  }

  const misses = state.scenarios.flatMap((scenario) =>
    scenario.result
      ? scenario.result.evaluation.checks
          .filter((check) => !check.pass)
          .flatMap((check) => wrapPlain(`${scenario.id}: ${check.name}`, width))
      : []
  );
  if (misses.length > 0) {
    lines.push("", `${TEXT}${BOLD}Misses${RESET}`);
    lines.push(...misses.map((line) => `${RED}${fitPlain(line, width)}${RESET}`));
  }

  return takeHeight(lines, height);
}

function renderPane(
  title: string,
  width: number,
  height: number,
  lines: string[],
  rightTag?: string
): string[] {
  const clampedHeight = Math.max(3, height);
  const bodyHeight = clampedHeight - 2;
  const top = renderPaneTop(title, width, rightTag);
  const body = takeHeight(lines, bodyHeight).map(
    (line) => `${GOLD}│${RESET}${padAnsi(line, width - 2)}${GOLD}│${RESET}`
  );
  const bottom = `${GOLD}╰${"─".repeat(Math.max(0, width - 2))}╯${RESET}`;
  return [top, ...body, bottom];
}

function renderPaneTop(title: string, width: number, rightTag?: string): string {
  const innerWidth = Math.max(0, width - 2);
  const titleText = `${TEXT}${BOLD} ${title.toUpperCase()} ${RESET}`;
  const rightText = rightTag ? `${DIM} ${fitPlain(rightTag, 16)} ${RESET}` : "";
  const fill = Math.max(0, innerWidth - visibleLength(titleText) - visibleLength(rightText));
  return `${GOLD}╭${RESET}${titleText}${GOLD}${"─".repeat(fill)}${RESET}${rightText}${GOLD}╮${RESET}`;
}

function renderLogEntry(entry: DashboardLogEntry, width: number): string[] {
  const prefixPlain = `[${entry.time}] ${entry.label.padEnd(9, " ")}`;
  const prefixWidth = prefixPlain.length + 1;
  const bodyWidth = Math.max(8, width - prefixWidth);
  const wrapped = wrapPlain(entry.text, bodyWidth);
  const prefixColor = logLabelColor(entry.kind);
  const textColor = logTextColor(entry.kind);

  return wrapped.map((line, index) => {
    const prefix =
      index === 0
        ? `${ZINC}[${entry.time}]${RESET} ${prefixColor}${entry.label.padEnd(9, " ")}${RESET}`
        : `${" ".repeat(prefixPlain.length)}`;
    return fitAnsi(`${prefix} ${textColor}${line}${RESET}`, width);
  });
}

function renderLiveAssistant(content: string, width: number): string[] {
  const lines = wrapPlain(content, Math.max(8, width - 20));
  return lines.map((line, index) => {
    const prefix =
      index === 0
        ? `${ZINC}[${clockStamp()}]${RESET} ${GOLD}assistant${RESET}`
        : `${" ".repeat(19)}`;
    const cursor = index === lines.length - 1 ? `${GOLD} ▋${RESET}` : "";
    return fitAnsi(`${padAnsi(prefix, 19)} ${ZINC}${line}${RESET}${cursor}`, width);
  });
}

function applyRuntimeEvent(view: BenchScenarioView, event: RuntimeEvent): void {
  if (event.type === "assistant_delta") {
    view.streamBuffer += event.content;
    return;
  }

  if (event.type === "assistant") {
    const final = (view.streamBuffer || event.content).trim();
    view.streamBuffer = "";
    if (final) {
      pushLog(view, "assistant", "assistant", final);
    }
    return;
  }

  if (event.type === "model_metrics") {
    view.liveMetrics = event.metrics;
    return;
  }

  if (event.type === "tool_call") {
    if (view.streamBuffer.trim()) {
      pushLog(view, "assistant", "assistant", view.streamBuffer.trim());
      view.streamBuffer = "";
    }
    view.toolCalls = view.toolCalls.concat(event.call);
    pushLog(view, "tool", toolLabel(event.call), toolCallText(event.call));
    return;
  }

  if (event.type === "tool_result") {
    applyToolResult(view, event.call, event.result);
  }
}

function applyToolResult(view: BenchScenarioView, call: ToolCall, result: string): void {
  if (result.startsWith("error:")) {
    view.latestIssue = result;
    pushLog(view, "stderr", "stderr", result);
    return;
  }

  if (call.name === "bash") {
    const parsed = parseBashResult(result);
    if (parsed.stdout) {
      pushLog(view, "stdout", "stdout", parsed.stdout);
    }
    if (parsed.stderr) {
      pushLog(view, "stderr", "stderr", parsed.stderr);
    }
    if (parsed.exitCode === 0) {
      view.verificationStatus = "pass";
      view.verificationSummary = parsed.stdout || "exit_code 0";
      view.latestIssue = undefined;
      if (!parsed.stdout && !parsed.stderr) {
        pushLog(view, "stdout", "stdout", "exit_code 0");
      }
    } else {
      view.verificationStatus = "fail";
      view.verificationSummary = parsed.stderr || parsed.stdout || `exit_code ${parsed.exitCode}`;
      view.latestIssue = view.verificationSummary;
      if (!parsed.stderr && !parsed.stdout) {
        pushLog(view, "stderr", "stderr", `exit_code ${parsed.exitCode}`);
      }
    }
    return;
  }

  if (call.name === "edit" || call.name === "write") {
    pushLog(view, "stdout", "stdout", result);
    return;
  }

  if (call.name === "grep" || call.name === "glob" || call.name === "ls") {
    const count = result === "no matches" ? 0 : result.split("\n").filter(Boolean).length;
    const label = call.name === "ls" ? "entries" : "matches";
    pushLog(view, "system", "system", `${call.name}: ${count} ${label}`);
  }
}

function createLogEntry(kind: DashboardLogKind, label: string, text: string): DashboardLogEntry {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    kind,
    label,
    text: compressWhitespace(text),
    time: clockStamp(),
  };
}

function pushLog(
  view: BenchScenarioView,
  kind: DashboardLogKind,
  label: string,
  text: string
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  view.logs = tailLines(view.logs.concat(createLogEntry(kind, label, trimmed)), 80);
}

function toolLabel(call: ToolCall): string {
  if (call.name === "bash") return "cmd";
  if (call.name === "edit" || call.name === "write") return "edit";
  return "tool";
}

function toolCallText(call: ToolCall): string {
  const args = safeParseJson(call.args);
  if (call.name === "bash") {
    return `$ ${stringValue(args?.command) ?? truncateMiddle(call.args, 60)}`;
  }
  if (call.name === "edit") {
    return `edit ${stringValue(args?.path) ?? "file"}${stringValue(args?.old_str) ? " (replace)" : ""}`;
  }
  if (call.name === "write") {
    return `write ${stringValue(args?.path) ?? "file"}`;
  }
  if (call.name === "read" || call.name === "ls" || call.name === "glob") {
    return `${call.name} ${stringValue(args?.path) ?? "."}`;
  }
  if (call.name === "grep") {
    return `grep ${stringValue(args?.pattern) ?? truncateMiddle(call.args, 40)}`;
  }
  return `${call.name} ${truncateMiddle(call.args, 48)}`;
}

function parseBashResult(result: string): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const exitMatch = /^exit_code:\s*(\d+)/m.exec(result);
  const stdoutMatch = /(?:^|\n)stdout:\n([\s\S]*?)(?=\n\nstderr:\n|\n\n[A-Za-z_]+:\n|$)/m.exec(result);
  const stderrMatch = /(?:^|\n)stderr:\n([\s\S]*?)(?=\n\n[A-Za-z_]+:\n|$)/m.exec(result);

  return {
    exitCode: exitMatch ? Number.parseInt(exitMatch[1] ?? "1", 10) : 1,
    stdout: summarizeOutput(stdoutMatch?.[1] ?? ""),
    stderr: summarizeOutput(stderrMatch?.[1] ?? ""),
  };
}

function summarizeOutput(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "<empty>")) {
    return "";
  }
  return truncateMiddle(lines.slice(0, 3).join(" | "), 160);
}

function renderScenarioIcon(scenario: BenchScenarioView): string {
  if (scenario.stage === "running") return `${GOLD}▶${RESET}`;
  if (scenario.stage === "pending") return `${ZINC}·${RESET}`;
  return scenario.result?.evaluation.status === "pass"
    ? `${GREEN}✓${RESET}`
    : scenario.result?.evaluation.status === "partial"
      ? `${GOLD}◐${RESET}`
      : `${RED}✗${RESET}`;
}

function renderStage(scenario: BenchScenarioView): string {
  return scenario.stage === "running"
    ? `${GOLD}running${RESET}`
    : scenario.stage === "done"
      ? `${GREEN}done${RESET}`
      : `${ZINC}pending${RESET}`;
}

function renderCheckLine(status: boolean | "pass" | "fail" | "pending", label: string): string {
  const normalized =
    status === true ? "pass" : status === false ? "fail" : status;
  const icon =
    normalized === "pass"
      ? `${GREEN}✓${RESET}`
      : normalized === "fail"
        ? `${RED}✗${RESET}`
        : `${ZINC}•${RESET}`;
  return `${icon} ${TEXT}${label}${RESET}`;
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

function computeColumnWidths(totalWidth: number): {
  leftWidth: number;
  centerWidth: number;
  rightWidth: number;
} {
  const gutters = 4;
  const inner = Math.max(80, totalWidth - gutters);
  let leftWidth = Math.max(26, Math.floor(inner * 0.3));
  let centerWidth = Math.max(38, Math.floor(inner * 0.5));
  let rightWidth = inner - leftWidth - centerWidth;

  if (rightWidth < 24) {
    const deficit = 24 - rightWidth;
    const centerGive = Math.min(deficit, Math.max(0, centerWidth - 38));
    centerWidth -= centerGive;
    rightWidth += centerGive;
  }
  if (rightWidth < 24) {
    const deficit = 24 - rightWidth;
    const leftGive = Math.min(deficit, Math.max(0, leftWidth - 24));
    leftWidth -= leftGive;
    rightWidth += leftGive;
  }
  return { leftWidth, centerWidth, rightWidth };
}

function padBetween(left: string, right: string, width: number): string {
  const minGap = 2;
  const leftLen = visibleLength(left);
  const rightLen = visibleLength(right);
  if (leftLen + minGap + rightLen > width) {
    const rightBudget = Math.max(10, Math.floor(width * 0.36));
    const leftBudget = Math.max(10, width - minGap - rightBudget);
    return `${padAnsi(left, leftBudget)}${" ".repeat(minGap)}${padAnsi(right, rightBudget)}`;
  }
  return `${left}${" ".repeat(width - leftLen - rightLen)}${right}`;
}

function wrapPlain(text: string, width: number): string[] {
  if (width <= 0) return [""];
  const normalized = compressWhitespace(text);
  if (!normalized) return [""];

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = fitPlain(word, width);
      continue;
    }
    if (`${current} ${word}`.length <= width) {
      current += ` ${word}`;
      continue;
    }
    lines.push(current);
    current = fitPlain(word, width);
  }
  lines.push(current);
  return lines;
}

function takeHeight(lines: string[], height: number): string[] {
  if (lines.length >= height) return lines.slice(0, height);
  return lines.concat(Array.from({ length: height - lines.length }, () => ""));
}

function tailLines<T>(lines: T[], count: number): T[] {
  return lines.slice(Math.max(0, lines.length - count));
}

function fitPlain(text: string, width: number): string {
  if (width <= 0) return "";
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;
}

function fitAnsi(text: string, width: number): string {
  if (visibleLength(text) <= width) return text;
  let visible = 0;
  let out = "";
  for (let i = 0; i < text.length && visible < Math.max(0, width - 1); ) {
    if (text[i] === "\x1b") {
      let j = i + 1;
      while (j < text.length && text[j] !== "m") j++;
      out += text.slice(i, Math.min(text.length, j + 1));
      i = Math.min(text.length, j + 1);
      continue;
    }
    out += text[i];
    visible += 1;
    i += 1;
  }
  return `${out}…${RESET}`;
}

function padAnsi(text: string, width: number): string {
  const fitted = fitAnsi(text, width);
  return `${fitted}${" ".repeat(Math.max(0, width - visibleLength(fitted)))}`;
}

function visibleLength(text: string): number {
  return text.replace(ANSI_REGEX, "").length;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function truncateMiddle(text: string, width: number): string {
  if (text.length <= width) return text;
  const left = Math.floor((width - 1) / 2);
  const right = width - left - 1;
  return `${text.slice(0, left)}…${text.slice(text.length - right)}`;
}

function safeParseJson(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function logLabelColor(kind: DashboardLogKind): string {
  if (kind === "assistant") return GOLD;
  if (kind === "tool") return BLUE;
  if (kind === "stdout") return GREEN;
  if (kind === "stderr") return RED;
  return ZINC;
}

function logTextColor(kind: DashboardLogKind): string {
  if (kind === "assistant") return ZINC;
  if (kind === "tool") return BLUE;
  if (kind === "stdout") return GREEN;
  if (kind === "stderr") return RED;
  return DIM;
}

function compressWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clockStamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
