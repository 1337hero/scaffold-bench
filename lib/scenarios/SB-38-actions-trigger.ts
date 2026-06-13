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

const WORKFLOW_PATH = "playground/ops/.github/workflows/deploy.yml";

const PROMPT = `Our CI pipeline is running production deploys on every pull request — we only want deploys to trigger on push to main. The workflow is at \`playground/ops/.github/workflows/deploy.yml\`. Fix the trigger/condition without touching the test or build jobs.`;

export const meta = {
  id: "SB-38",
  name: "actions-trigger",
  category: "surgical-edit" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/ops/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-38" as ScenarioId,
  name: "actions-trigger",
  category: "surgical-edit",
  family: "regex-style",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const filePath = join(playgroundDir, WORKFLOW_PATH);
    const content = await readOrEmpty(filePath);

    const prRemoved = !/pull_request/.test(content);
    const deployJobRestricted =
      /if:\s*github\.event_name\s*==\s*['"]push['"]/.test(content) ||
      /if:\s*github\.ref\s*==\s*['"]refs\/heads\/main['"]/.test(content);
    const deployUnreachableOnPR = prRemoved || deployJobRestricted;

    const pushStillPresent = /push:/.test(content) && /branches:\s*\[main\]/.test(content);

    const testJobPresent = /^\s{2}test:/m.test(content);
    const buildJobPresent = /^\s{2}build:/m.test(content);

    const noCommentedLines =
      !/^\s*#/.test(content) ||
      content.split("\n").filter((l) => l.trim().startsWith("#")).length === 0;

    const changeTurn = firstChangeTurn(toolCalls);
    const readBeforeEdit =
      changeTurn !== undefined &&
      readTurnsForPath(toolCalls, WORKFLOW_PATH).some((t) => t < changeTurn);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [WORKFLOW_PATH],
    });

    const fixInRightPlace = prRemoved ? true : deployJobRestricted;

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "deploy job unreachable on PR events",
            pass: deployUnreachableOnPR,
            weight: 2,
            detail: deployUnreachableOnPR
              ? undefined
              : "pull_request still in on: and no job-level if guard on deploy",
          },
          {
            name: "push to main still triggers deploy",
            pass: pushStillPresent,
            weight: 1,
            detail: pushStillPresent ? undefined : "push/main trigger missing",
          },
        ],
        scope: [
          {
            name: "only workflow file changed",
            pass: scope.pass,
            weight: 1,
            detail: scope.detail,
          },
          {
            name: "test and build jobs still present",
            pass: testJobPresent && buildJobPresent,
            weight: 1,
            detail: !testJobPresent
              ? "test job missing"
              : !buildJobPresent
                ? "build job missing"
                : undefined,
          },
        ],
        pattern: [
          {
            name: "fix in trigger or job condition (not a separate workflow)",
            pass: fixInRightPlace,
            weight: 2,
            detail: fixInRightPlace ? undefined : "fix not detected in expected location",
          },
        ],
        verification: [
          {
            name: "read workflow file before editing",
            pass: readBeforeEdit,
            weight: 1,
            detail: readBeforeEdit ? undefined : "no read of workflow file before first edit",
          },
        ],
        cleanup: [
          {
            name: "no commented-out YAML lines",
            pass: noCommentedLines,
            weight: 1,
            detail: noCommentedLines ? undefined : "commented-out YAML found",
          },
          {
            name: "no spurious changes",
            pass: scope.pass,
            weight: 1,
            detail: scope.pass ? undefined : `extra files changed: ${scope.detail}`,
          },
        ],
      },
      {
        pass: "Deploy job restricted to push events; test/build jobs unchanged.",
        partial: "Partial fix — some conditions met but not all.",
        fail: "Deploy still runs on pull_request or test/build jobs broken.",
      }
    );
  },
};

export default scenario;
