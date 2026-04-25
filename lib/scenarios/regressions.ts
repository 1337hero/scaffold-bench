import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { Evaluation } from "../scoring.ts";
import type { Check, RuntimeOutput, ScenarioEvaluation } from "../scoring.ts";
import type { ExecuteScenario, ScenarioExecutionContext } from "./types.js";
import {
  createSkippedEvaluation,
  onlyChangedFiles,
  stripComments,
} from "./helpers.js";

type RegressionScenarioConfig = {
  id: ScenarioId;
  name: string;
  prompt: string;
  fixtureDir: string;
  sourcePath: string;
  testCommand: string[];
  preflightCommand?: string[];
  testLabel?: string;
  canonicalCheck?: (input: {
    sourceAfter: string;
    fixtureDir: string;
    workDir: string;
  }) => Promise<Check> | Check;
  passSummary: string;
  partialSummary?: string;
};

function createRegressionScenario(config: RegressionScenarioConfig): ExecuteScenario {
  return {
    id: config.id,
    name: config.name,
    category: "verify-and-repair",
    maxPoints: 2,
    prompt: config.prompt,
    async execute(ctx: ScenarioExecutionContext) {
      const { runtime, workDir, timeoutMs, onRuntimeEvent, runtimeOverrides } = ctx;
      const fixtureDir = join(workDir, config.fixtureDir);
      const sourceFile = join(workDir, config.sourcePath);

      if (config.preflightCommand) {
        const preflight = Bun.spawnSync(config.preflightCommand, {
          stdout: "pipe",
          stderr: "pipe",
        });
        if (preflight.exitCode !== 0) {
          const output: RuntimeOutput = {
            stdout: "",
            toolCalls: [],
            wallTimeMs: 0 as Ms,
            scenarioMetrics: { skipped: true, reason: `${config.preflightCommand[0]}-not-on-path` },
          };
          return {
            output,
            evaluation: createSkippedEvaluation(
              `${config.preflightCommand[0]} on PATH`,
              `SKIPPED: ${config.preflightCommand[0]} not found on PATH`
            ),
          };
        }
      }

      const runStartedAt = performance.now();
      let output: RuntimeOutput;
      try {
        output = await runtime.run({
          workDir,
          prompt: config.prompt,
          timeoutMs,
          onEvent: onRuntimeEvent,
          ...runtimeOverrides,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        output = {
          stdout: "",
          toolCalls: [],
          wallTimeMs: Math.round(performance.now() - runStartedAt) as Ms,
          error: `CRASH: ${msg}`,
        };
      }

      if (output.error) {
        return {
          output,
          evaluation: {
            status: "fail",
            points: 0,
            maxPoints: 2,
            checks: [
              { name: "completed without runtime error", pass: false, detail: output.error },
            ],
            summary: `Runtime error: ${output.error}`,
          },
        };
      }

      const testRun = Bun.spawnSync(config.testCommand, {
        cwd: fixtureDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const testsPass = testRun.exitCode === 0;
      const testOutput = new TextDecoder()
        .decode(testRun.stdout)
        .concat(new TextDecoder().decode(testRun.stderr))
        .trim()
        .slice(0, 240);

      const scope = await onlyChangedFiles({
        playgroundDir: workDir,
        allowedPaths: [config.sourcePath],
      });

      const sourceAfter = await readFile(sourceFile, "utf-8").catch(() => "");

      const canonicalCheckResult = config.canonicalCheck
        ? await Promise.resolve(config.canonicalCheck({ sourceAfter, fixtureDir, workDir }))
        : undefined;

      const checks: Check[] = [
        {
          name: config.testLabel ?? `${config.testCommand.join(" ")} passes`,
          pass: testsPass,
          detail: testOutput,
        },
        {
          name: `only ${config.sourcePath.split("/").pop()} changed`,
          pass: scope.pass,
          detail: scope.detail,
        },
        ...(canonicalCheckResult ? [canonicalCheckResult] : []),
      ];

      let evaluation: ScenarioEvaluation;
      if (!testsPass) {
        evaluation = Evaluation.fail(2, checks, "Tests still fail after fix.");
      } else if (!scope.pass) {
        evaluation = Evaluation.fail(
          2,
          checks,
          "Tests pass but changes touched files outside the allowed source file."
        );
      } else if (!canonicalCheckResult || canonicalCheckResult.pass) {
        evaluation = Evaluation.pass(2, checks, config.passSummary);
      } else {
        evaluation = Evaluation.partial(
          1,
          2,
          checks,
          config.partialSummary ??
            "Tests pass but fix doesn't match the canonical pattern."
        );
      }

      return { output, evaluation };
    },
  };
}

const SB24_PROMPT = [
  "Caddy 2.7: `uri replace` does not work with escaped closing braces.",
  "Input `\\}` should produce `}`, but instead it comes back unchanged as `\\}`.",
  "",
  "The failing cases live in `playground/sb24-caddy-replacer/replacer_test.go`.",
  "The replacer logic is in `playground/sb24-caddy-replacer/replacer.go`.",
  "",
  "Run `go test ./...` from inside `playground/sb24-caddy-replacer` to see",
  "the failing cases, then fix `replacer.go`. Change only what is necessary.",
  "Verify the tests pass when you're done.",
].join("\n");

const SB27_PROMPT = [
  "Terraform's remote-exec provisioner keeps SSH connections open long",
  "after the scripts have finished running. The disconnect goroutine in",
  "`RunScripts` waits on the caller's context, which stays live for the",
  "entire Terraform run — so the communicator stays connected.",
  "",
  "It should disconnect promptly once the scripts complete, while still",
  "disconnecting if the caller cancels mid-execution.",
  "",
  "Tests live in `playground/sb27-tf-ssh-leak/runner_test.go`.",
  "The logic is in `playground/sb27-tf-ssh-leak/runner.go`.",
  "",
  "Run `go test ./...` from inside `playground/sb27-tf-ssh-leak` to see",
  "the failure, then fix `runner.go`. Only edit runner.go. Verify the",
  "tests pass when you're done.",
].join("\n");

const SB29_PROMPT = [
  "Axios's `isAbsoluteURL` helper treats protocol-relative URLs like",
  "`//example.com/` as absolute. That behaviour is the root of",
  "CVE-2024-39338 — an attacker can redirect server-side requests to",
  "arbitrary hosts. Protocol-relative URLs must be treated as RELATIVE.",
  "",
  "Tests live in `playground/sb29-axios-ssrf/isAbsoluteURL.test.mjs`.",
  "The helper is in `playground/sb29-axios-ssrf/isAbsoluteURL.mjs`.",
  "",
  "Run `node isAbsoluteURL.test.mjs` from inside `playground/sb29-axios-ssrf`",
  "to see the failure, then fix `isAbsoluteURL.mjs`. Only edit that file.",
].join("\n");

const SB31_PROMPT = [
  "Babel's generator crashes when an `inputSourceMap` is provided without",
  "`sourcesContent`. The source-map v3 spec makes sourcesContent optional,",
  "but `applyInputMap` dereferences `inputMap.sourcesContent[i]`, throwing",
  "`TypeError: Cannot read properties of undefined (reading '0')`.",
  "",
  "Tests live in `playground/sb31-babel-sourcemap/sourceMap.test.mjs`.",
  "The logic is in `playground/sb31-babel-sourcemap/sourceMap.mjs`.",
  "",
  "Run `node sourceMap.test.mjs` from inside `playground/sb31-babel-sourcemap`",
  "to see the failure, then fix `sourceMap.mjs`. Only edit sourceMap.mjs.",
].join("\n");

const SB33_PROMPT = [
  "When `scope.rename('a', '_a')` walks the AST, shorthand ObjectProperty",
  "nodes like `{ a }` should be expanded: `{ a: _a }` — key stays, value",
  "is renamed, and `shorthand` flips to false. Today the rename visitor",
  "doesn't handle ObjectProperty; both key and value get renamed to `_a`,",
  "silently changing the object's field name.",
  "",
  "Tests live in `playground/sb33-babel-rename-shorthand/renameShorthand.test.mjs`.",
  "The logic is in `playground/sb33-babel-rename-shorthand/renameShorthand.mjs`.",
  "",
  "Run `node renameShorthand.test.mjs`. Only edit renameShorthand.mjs.",
].join("\n");

const SB35_PROMPT = [
  "Vue's `renderList` (the runtime that powers v-for) wraps each item of",
  "a reactive array via `toReactive`. That's correct for a deep reactive",
  "array, but wrong for a `shallowReactive` array — its whole point is",
  "that nested reads do NOT track reactivity. Today items of a",
  "`shallowReactive([{foo:1}])` get silently upgraded to deep reactive.",
  "",
  "Tests live in `playground/sb35-vue-shallowreactive-vfor/renderList.test.ts`.",
  "The logic is in `playground/sb35-vue-shallowreactive-vfor/renderList.ts`.",
  "",
  "Run `bun renderList.test.ts`. Only edit renderList.ts.",
].join("\n");

const SB36_PROMPT = [
  "Vue's reactivity `endBatch` decrements `batchDepth` AFTER it processes",
  "the queued effects. When an effect inside the loop calls another",
  "`startBatch`/`endBatch` pair (e.g. a sync watcher writing to a ref),",
  "the nested `endBatch` sees `batchDepth > 1` and returns early — leaving",
  "dependents in an in-flush state that breaks computed scheduling.",
  "",
  "Tests live in `playground/sb36-vue-sync-watchers/effect.test.ts`.",
  "The logic is in `playground/sb36-vue-sync-watchers/effect.ts`.",
  "",
  "Run `bun effect.test.ts`. Only edit effect.ts.",
].join("\n");

export const regressionScenarios: ExecuteScenario[] = [
  createRegressionScenario({
    id: "SB-24" as ScenarioId,
    name: "caddy-replacer-closing-brace",
    prompt: SB24_PROMPT,
    fixtureDir: "playground/sb24-caddy-replacer",
    sourcePath: "playground/sb24-caddy-replacer/replacer.go",
    testCommand: ["go", "test", "./..."],
    preflightCommand: ["go", "version"],
    passSummary: "Tests pass, only replacer.go changed, root-cause guard applied.",
    partialSummary:
      "Tests pass but the fix is superficial (early-return guard not strengthened).",
    canonicalCheck({ sourceAfter }) {
      const strengthenedGuardLine = sourceAfter
        .split("\n")
        .find((line) => line.includes("strings.Contains") && line.includes("phOpen"));
      const strengthenedGuard =
        strengthenedGuardLine !== undefined &&
        strengthenedGuardLine.includes("&&") &&
        /!strings\.Contains\s*\(\s*input\s*,\s*string\s*\(\s*phOpen\s*\)\s*\)/.test(
          strengthenedGuardLine
        ) &&
        /!strings\.Contains\s*\(\s*input\s*,\s*string\s*\(\s*phClose\s*\)\s*\)/.test(
          strengthenedGuardLine
        );
      return {
        name: "early-return guard checks both phOpen and phClose",
        pass: strengthenedGuard,
        detail: strengthenedGuard ? "guard matched" : "pattern not matched in updated file",
      };
    },
  }),

  createRegressionScenario({
    id: "SB-27" as ScenarioId,
    name: "terraform-ssh-connection-leak",
    prompt: SB27_PROMPT,
    fixtureDir: "playground/sb27-tf-ssh-leak",
    sourcePath: "playground/sb27-tf-ssh-leak/runner.go",
    testCommand: ["go", "test", "-timeout", "15s", "./..."],
    preflightCommand: ["go", "version"],
    passSummary: "Tests pass, only runner.go changed, derived context with defer cancel applied.",
    partialSummary:
      "Tests pass but fix doesn't match canonical context-derivation pattern (e.g., bare defer Disconnect).",
    canonicalCheck({ sourceAfter }) {
      const runScriptsMatch = /func\s+RunScripts\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}\s*$/m.exec(
        sourceAfter
      );
      let canonicalFix = false;
      let fixDetail = "RunScripts function not found";
      if (runScriptsMatch) {
        const body = runScriptsMatch[1];
        const derivedCtx =
          /(\w+)\s*,\s*(\w+)\s*:=\s*context\.(?:WithCancel|WithTimeout|WithDeadline)\s*\(\s*ctx\b/.exec(
            body
          );
        if (derivedCtx) {
          const cancelName = derivedCtx[2];
          const hasDeferCancel = new RegExp(`defer\\s+${cancelName}\\s*\\(`).test(body);
          canonicalFix = hasDeferCancel;
          fixDetail = hasDeferCancel
            ? `derived ctx (${derivedCtx[1]}) with defer ${cancelName}()`
            : `derived ctx present but no defer ${cancelName}()`;
        } else {
          fixDetail = "no context.WithCancel/WithTimeout/WithDeadline from ctx";
        }
      }
      return {
        name: "derives cancellable context from ctx and defers cancel",
        pass: canonicalFix,
        detail: fixDetail,
      };
    },
  }),

  createRegressionScenario({
    id: "SB-29" as ScenarioId,
    name: "axios-ssrf-protocol-relative",
    prompt: SB29_PROMPT,
    fixtureDir: "playground/sb29-axios-ssrf",
    sourcePath: "playground/sb29-axios-ssrf/isAbsoluteURL.mjs",
    testCommand: ["node", "isAbsoluteURL.test.mjs"],
    preflightCommand: ["node", "--version"],
    passSummary: "Tests pass, only isAbsoluteURL.mjs changed, optional-scheme regex removed.",
    partialSummary:
      "Tests pass but dangerous `(scheme:)?//` regex still present (wrapper-style fix).",
    canonicalCheck({ sourceAfter }) {
      const fnMatch = /function\s+isAbsoluteURL\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(sourceAfter);
      const fnBody = fnMatch?.[1] ?? "";
      const stillHasOptionalScheme = /\)\?\s*\\?\/\s*\\?\//.test(fnBody);
      const canonicalFix = fnMatch !== null && !stillHasOptionalScheme;
      return {
        name: "optional-scheme group removed from regex",
        pass: canonicalFix,
        detail: canonicalFix ? "optional scheme removed" : "dangerous optional scheme still present",
      };
    },
  }),

  createRegressionScenario({
    id: "SB-31" as ScenarioId,
    name: "babel-sourcemap-undefined-content",
    prompt: SB31_PROMPT,
    fixtureDir: "playground/sb31-babel-sourcemap",
    sourcePath: "playground/sb31-babel-sourcemap/sourceMap.mjs",
    testCommand: ["node", "sourceMap.test.mjs"],
    preflightCommand: ["node", "--version"],
    passSummary:
      "Tests pass and only sourceMap.mjs changed; fixture oracle covers missing and partial sourcesContent cases.",
  }),

  createRegressionScenario({
    id: "SB-33" as ScenarioId,
    name: "babel-rename-shorthand",
    prompt: SB33_PROMPT,
    fixtureDir: "playground/sb33-babel-rename-shorthand",
    sourcePath: "playground/sb33-babel-rename-shorthand/renameShorthand.mjs",
    testCommand: ["node", "renameShorthand.test.mjs"],
    preflightCommand: ["node", "--version"],
    passSummary:
      "Tests pass, only renameShorthand.mjs changed, ObjectProperty visitor flips shorthand.",
    partialSummary:
      "Tests pass but ObjectProperty visitor with shorthand=false not present (superficial fix).",
    canonicalCheck({ sourceAfter }) {
      const stripped = stripComments(sourceAfter);
      const canonicalFix =
        /ObjectProperty\s*[(]/.test(stripped) && /shorthand\s*=\s*false/.test(stripped);
      return {
        name: "fix adds ObjectProperty visitor that flips shorthand=false",
        pass: canonicalFix,
        detail: canonicalFix ? "ObjectProperty visitor matched" : "visitor not found",
      };
    },
  }),

  createRegressionScenario({
    id: "SB-35" as ScenarioId,
    name: "vue-shallowreactive-vfor",
    prompt: SB35_PROMPT,
    fixtureDir: "playground/sb35-vue-shallowreactive-vfor",
    sourcePath: "playground/sb35-vue-shallowreactive-vfor/renderList.ts",
    testCommand: ["bun", "renderList.test.ts"],
    passSummary: "Tests pass, only renderList.ts changed, isShallow(source) consulted.",
    partialSummary: "Tests pass but isShallow(source) not referenced (superficial fix).",
    canonicalCheck({ sourceAfter }) {
      const canonicalFix = /isShallow\s*\(\s*source\s*\)/.test(stripComments(sourceAfter));
      return {
        name: "fix consults isShallow(source)",
        pass: canonicalFix,
        detail: canonicalFix ? "isShallow(source) found" : "isShallow(source) not referenced",
      };
    },
  }),

  createRegressionScenario({
    id: "SB-36" as ScenarioId,
    name: "vue-sync-watchers-batch",
    prompt: SB36_PROMPT,
    fixtureDir: "playground/sb36-vue-sync-watchers",
    sourcePath: "playground/sb36-vue-sync-watchers/effect.ts",
    testCommand: ["bun", "effect.test.ts"],
    passSummary: "Tests pass, only effect.ts changed, batchDepth-- moved before flush loop.",
    partialSummary: "Tests pass but batchDepth-- still after flush loop (superficial fix).",
    canonicalCheck({ sourceAfter }) {
      const stripped = stripComments(sourceAfter);
      const endBatchStart = stripped.search(/function\s+endBatch\s*\([^)]*\)[^{]*\{/);
      let canonicalFix = false;
      if (endBatchStart !== -1) {
        let depth = 0;
        let bodyStart = -1;
        let bodyEnd = -1;
        for (let i = endBatchStart; i < stripped.length; i++) {
          if (stripped[i] === "{") {
            if (depth === 0) bodyStart = i + 1;
            depth++;
          } else if (stripped[i] === "}") {
            depth--;
            if (depth === 0) {
              bodyEnd = i;
              break;
            }
          }
        }
        if (bodyStart !== -1 && bodyEnd !== -1) {
          const body = stripped.slice(bodyStart, bodyEnd);
          const decrementMatches = [...body.matchAll(/batchDepth\s*--/g)];
          const decrementCount = decrementMatches.length;
          const loopIdx = body.search(/while\s*\(\s*batchedHead/);
          const lastDecrement = decrementMatches.at(-1)?.index ?? -1;
          canonicalFix =
            decrementCount === 1 &&
            loopIdx !== -1 &&
            lastDecrement !== -1 &&
            lastDecrement < loopIdx;
        }
      }
      return {
        name: "batchDepth-- precedes while(batchedHead) in endBatch",
        pass: canonicalFix,
        detail: canonicalFix ? "ordering matched" : "batchDepth-- not before while loop",
      };
    },
  }),
];
