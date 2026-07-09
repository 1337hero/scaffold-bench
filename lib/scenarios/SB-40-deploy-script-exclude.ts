import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  firstChangeTurn,
  onlyChangedFiles,
  readOrEmpty,
  readTurnsForPath,
} from "./_shared/helpers.js";
import { hasTool } from "./_shared/toolchain.js";
import { shellcheckFile } from "./_shared/runners/shell.js";

const DEPLOY_PATH = "playground/ops/deploy.sh";

const PROMPT = `Our deploy script is accidentally syncing \`.env\` files to production. Update \`playground/ops/deploy.sh\` to exclude \`.env\` from the rsync transfer. Don't restructure the script — just add the exclude to the existing rsync command.`;

export const meta = {
  id: "SB-40",
  name: "deploy-script-exclude",
  category: "scope-discipline" as const,
  family: "regex-style" as const,
  difficulty: "medium" as const, // cognitive-load override (field mean inflated by strong-model sample)
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/ops/",
  prompt: PROMPT,
  requires: ["shellcheck"],
} as const;

const scenario: Scenario = {
  id: "SB-40" as ScenarioId,
  name: "deploy-script-exclude",
  category: "scope-discipline",
  family: "regex-style",
  difficulty: "medium",
  prompt: PROMPT,
  requires: ["shellcheck"],
  async evaluate({ playgroundDir, toolCalls }) {
    if (!hasTool("shellcheck")) {
      return {
        status: "fail" as const,
        points: 0,
        maxPoints: 10,
        checks: [{ name: "shellcheck required", pass: false, detail: "shellcheck not available" }],
        summary: "shellcheck not available — scenario skipped",
      };
    }

    const filePath = join(playgroundDir, DEPLOY_PATH);
    const content = await readOrEmpty(filePath);

    const rsyncLine = content.split("\n").find((l) => /\brsync\b/.test(l)) ?? "";
    const hasExclude = /--exclude/.test(rsyncLine) && /\.env/.test(rsyncLine);
    const correctSyntax = /--exclude=['"]\.env['"]/.test(rsyncLine);

    const shellcheckResult = await shellcheckFile(content);

    const originalLines = 10;
    const currentLines = content.split("\n").filter((l) => l !== "").length;
    const minimalChange = Math.abs(currentLines - originalLines) <= 1;

    const changeTurn = firstChangeTurn(toolCalls);
    const readBeforeEdit =
      changeTurn !== undefined &&
      readTurnsForPath(toolCalls, DEPLOY_PATH).some((t) => t < changeTurn);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [DEPLOY_PATH],
    });

    const noExtraLines = !/console\.log|echo.*debug|printf.*debug/i.test(content);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "rsync line contains --exclude and .env",
            pass: hasExclude,
            weight: 2,
            detail: hasExclude ? undefined : `rsync line missing --exclude .env: ${rsyncLine}`,
          },
          {
            name: "shellcheck passes",
            pass: shellcheckResult.ok,
            weight: 1,
            detail: shellcheckResult.ok
              ? undefined
              : shellcheckResult.stdout || shellcheckResult.stderr,
          },
        ],
        scope: [
          {
            name: "only rsync line changed (minimal diff)",
            pass: minimalChange,
            weight: 1,
            detail: minimalChange
              ? undefined
              : `line count delta too large (${currentLines} vs ${originalLines})`,
          },
          {
            name: "only deploy.sh changed",
            pass: scope.pass,
            weight: 1,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "correct rsync exclude syntax (--exclude='.env')",
            pass: correctSyntax,
            weight: 2,
            detail: correctSyntax
              ? undefined
              : `wrong syntax — expected --exclude='.env', got: ${rsyncLine}`,
          },
        ],
        verification: [
          {
            name: "read deploy.sh before editing",
            pass: readBeforeEdit,
            weight: 1,
            detail: readBeforeEdit ? undefined : "no read of deploy.sh before first edit",
          },
        ],
        cleanup: [
          {
            name: "no debug additions",
            pass: noExtraLines,
            weight: 1,
            detail: noExtraLines ? undefined : "debug output found",
          },
          {
            name: "no spurious file changes",
            pass: scope.pass,
            weight: 1,
            detail: scope.pass ? undefined : `extra files changed: ${scope.detail}`,
          },
        ],
      },
      {
        pass: "rsync excludes .env; shellcheck clean; minimal change.",
        partial: "Exclude added but syntax issues or scope drift.",
        fail: ".env not excluded from rsync or shellcheck fails.",
      }
    );
  },
};

export default scenario;
