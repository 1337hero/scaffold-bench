import type { ScenarioResult, ToolCall } from "../../lib/scoring.ts";

const tool = (name: string, args: string, turn: number, result: string): ToolCall => ({
  name,
  args,
  turn,
  result,
});

export const FIXTURE_RESULTS: ScenarioResult[] = [
  {
    scenarioId: "SB-01",
    category: "surgical-edit",
    runtime: "local",
    evaluation: {
      status: "pass",
      points: 2,
      maxPoints: 2,
      summary: "all checks pass",
      checks: [
        { name: "bash exit 0", pass: true },
        { name: "file edited", pass: true },
      ],
    },
    output: {
      stdout: "ok",
      wallTimeMs: 12000,
      firstTokenMs: 420,
      turnWallTimes: [6000, 6000],
      toolCalls: [
        tool("bash", `{"command":"ls"}`, 1, "exit_code: 0\nstdout:\nfile.ts\n"),
        tool("edit", `{"path":"file.ts"}`, 1, "ok"),
        tool("write", `{"path":"new.ts"}`, 2, "ok"),
      ],
      modelMetrics: {
        model: "qwen3-test",
        requestCount: 2,
        promptTokens: 1000,
        completionTokens: 400,
        totalTokens: 1400,
        totalRequestTimeMs: 5000,
        promptEvalTokens: 1000,
        promptEvalTimeMs: 2000,
        completionEvalTokens: 400,
        completionEvalTimeMs: 1000,
      },
    },
  },
  {
    scenarioId: "SB-02",
    category: "audit",
    runtime: "local",
    evaluation: {
      status: "partial",
      points: 1,
      maxPoints: 2,
      summary: "partial checks",
      checks: [
        { name: "identified issue", pass: true },
        { name: "proposed fix", pass: false, detail: "missed the null-branch case that triggers on empty arrays when inputs skip validation entirely" },
      ],
    },
    output: {
      stdout: "",
      wallTimeMs: 8000,
      toolCalls: [
        tool("read", `{"path":"lib/x.ts"}`, 1, "file contents..."),
        tool("grep", `{"pattern":"foo"}`, 1, "lib/x.ts:10: foo\n"),
      ],
      modelMetrics: {
        model: "qwen3-test",
        requestCount: 1,
        promptTokens: 500,
        completionTokens: 200,
        totalTokens: 700,
        totalRequestTimeMs: 2500,
      },
    },
  },
  {
    scenarioId: "SB-03",
    category: "scope-discipline",
    runtime: "local",
    evaluation: {
      status: "fail",
      points: 0,
      maxPoints: 2,
      summary: "failed checks",
      checks: [
        { name: "stayed in scope", pass: false, detail: "edited unrelated files" },
        { name: "no extra tests", pass: false },
      ],
    },
    output: {
      stdout: "",
      wallTimeMs: 15000,
      toolCalls: [
        tool("bash", `{"command":"cat x.ts"}`, 1, "exit_code: 0\nstdout:\nx\n"),
        tool("edit", `{"path":"x.ts"}`, 1, "ok"),
        tool("edit", `{"path":"y.ts"}`, 2, "ok"),
        tool("edit", `{"path":"z.ts"}`, 2, "ok"),
      ],
      modelMetrics: {
        model: "qwen3-test",
        requestCount: 2,
        promptTokens: 800,
        completionTokens: 600,
        totalTokens: 1400,
        totalRequestTimeMs: 4000,
      },
    },
  },
  {
    scenarioId: "SB-04",
    category: "implementation",
    runtime: "local",
    evaluation: {
      status: "fail",
      points: 0,
      maxPoints: 2,
      summary: "runtime crash",
      checks: [{ name: "completed", pass: false, detail: "process crashed" }],
    },
    output: {
      stdout: "",
      wallTimeMs: 3000,
      toolCalls: [],
      error: "CRASH",
    },
  },
  {
    scenarioId: "SB-05",
    category: "audit",
    runtime: "local",
    evaluation: {
      status: "pass",
      points: 2,
      maxPoints: 2,
      summary: "all checks pass",
      checks: [{ name: "audit complete", pass: true }],
    },
    output: {
      stdout: "",
      wallTimeMs: 6000,
      toolCalls: [
        tool("grep", `{"pattern":"TODO"}`, 1, "no matches"),
        tool("glob", `{"path":"**/*.ts"}`, 1, "a.ts\nb.ts\n"),
      ],
    },
  },
  {
    scenarioId: "SB-06",
    category: "long-context",
    runtime: "local",
    evaluation: {
      status: "partial",
      points: 1,
      maxPoints: 2,
      summary: "partial",
      checks: [
        { name: "read all sources", pass: true },
        { name: "summary accurate", pass: false, detail: "missed one module" },
      ],
    },
    output: {
      stdout: "",
      wallTimeMs: 20000,
      firstTokenMs: 1200,
      turnWallTimes: [10000, 10000],
      toolCalls: [
        tool("read", `{"path":"lib/a.ts"}`, 1, "..."),
        tool("read", `{"path":"lib/b.ts"}`, 1, "..."),
        tool("ls", `{"path":"lib"}`, 1, "a.ts\nb.ts\n"),
      ],
      modelMetrics: {
        model: "qwen3-test",
        requestCount: 2,
        promptTokens: 4000,
        completionTokens: 800,
        totalTokens: 4800,
        totalRequestTimeMs: 8000,
        promptEvalTokens: 4000,
        promptEvalTimeMs: 4000,
        completionEvalTokens: 800,
        completionEvalTimeMs: 2000,
      },
    },
  },
];

export const FIXTURE_SEEDS = FIXTURE_RESULTS.map((r) => ({
  id: r.scenarioId,
  name: `${r.scenarioId} fixture`,
  prompt: `prompt for ${r.scenarioId}`,
  category: r.category,
}));

export const FIXTURE_START_EPOCH = 1_700_000_000_000;
