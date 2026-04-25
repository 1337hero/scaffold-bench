import type { ScenarioId } from "../schemas/brands.js";
import type { RuntimeEvent, Runtime } from "../runtimes/types.ts";
import type {
  Category,
  ModelMetrics,
  RuntimeOutput,
  ScenarioEvaluation,
  ToolCall,
} from "../scoring.ts";

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
