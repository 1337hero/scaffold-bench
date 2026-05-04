import type { ScenarioId } from "../../schemas/brands.js";
import type { RuntimeEvent, Runtime } from "../../runtimes/types.ts";
import type {
  Category,
  ModelMetrics,
  RuntimeOutput,
  ScenarioEvaluation,
  ToolCall,
} from "../../scoring.ts";

export type Family = "regression" | "spec-impl" | "regex-style";

export type RubricKind = "10pt" | "custom-5pt" | "custom-3pt";

/**
 * Signal type — describes the dominant scoring mechanism for a scenario.
 * Lets the dashboard filter "show me only behavioral runs" or
 * "exclude regex-shape from the model leaderboard" without averaging
 * incomparable signals.
 *
 * - behavioral — evaluator runs the resulting code; pass = exit code 0
 * - regex-shape — patterns matched against final file contents
 * - stdout — patterns matched against the model's natural-language reply
 * - trace — patterns matched against tool-call sequences (read-before-edit etc.)
 * - latency — wall-clock or first-token timing thresholds
 */
export type SignalType = "behavioral" | "regex-shape" | "stdout" | "trace" | "latency";

export type ScenarioMeta = {
  id: string;
  name: string;
  category: Category;
  family: Family;
  rubricKind: RubricKind;
  signalType: SignalType;
  fixturePath: string;
  prompt: string;
};

export type ScenarioEvaluateInput = {
  stdout: string;
  playgroundDir: string;
  toolCalls: ToolCall[];
  wallTimeMs: number;
  firstTokenMs?: number;
  turnWallTimes?: number[];
  turnFirstTokenMs?: Array<number | undefined>;
  modelMetrics?: ModelMetrics;
  scenarioMetrics?: Record<string, unknown>;
};

export type ScenarioExecutionContext = {
  runtime: Runtime;
  workDir: string;
  timeoutMs: number;
  onRuntimeEvent?: (event: RuntimeEvent) => void;
  runtimeOverrides?: {
    endpoint?: string;
    model?: string;
    apiKey?: string;
    systemPrompt?: string;
  };
};

export type ScenarioBase = {
  id: ScenarioId;
  name: string;
  category: Category;
  family: Family;
  prompt: string;
  maxPoints?: number;
  buildPrompt?(input: { playgroundDir: string }): Promise<string>;
};

export type ExecuteScenario = ScenarioBase & {
  execute(input: ScenarioExecutionContext): Promise<{
    output: RuntimeOutput;
    evaluation: ScenarioEvaluation;
  }>;
  evaluate?: never;
};

export type EvaluateScenario = ScenarioBase & {
  evaluate(input: ScenarioEvaluateInput): Promise<ScenarioEvaluation>;
  execute?: never;
};

export type Scenario = ExecuteScenario | EvaluateScenario;
