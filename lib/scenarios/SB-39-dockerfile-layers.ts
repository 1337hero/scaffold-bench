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

const DOCKERFILE_PATH = "playground/ops/Dockerfile";

const PROMPT = `Our Docker builds are slow — every code change re-runs \`bun install\` from scratch because dependencies aren't cached separately. Also, the build fails with a lockfile error. Fix \`playground/ops/Dockerfile\` to properly layer the dependency installation before copying source files.`;

export const meta = {
  id: "SB-39",
  name: "dockerfile-layers",
  category: "verify-and-repair" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/ops/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-39" as ScenarioId,
  name: "dockerfile-layers",
  category: "verify-and-repair",
  family: "regex-style",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const filePath = join(playgroundDir, DOCKERFILE_PATH);
    const content = await readOrEmpty(filePath);
    const lines = content.split("\n").filter((l) => l.trim());

    const copyDotDotIndex = lines.findIndex((l) => /^COPY\s+\.\s+\./.test(l.trim()));
    const bunInstallIndex = lines.findIndex((l) => /^RUN\s+bun\s+install/.test(l.trim()));
    const firstCopyIndex = lines.findIndex((l) => /^COPY\b/.test(l.trim()));

    const firstCopyIsManifest =
      firstCopyIndex !== -1 &&
      !/COPY\s+\.\s+\./.test(lines[firstCopyIndex] ?? "") &&
      /package\.json|bun\.lock/.test(lines[firstCopyIndex] ?? "");

    const installBeforeSourceCopy =
      bunInstallIndex !== -1 &&
      copyDotDotIndex !== -1 &&
      bunInstallIndex < copyDotDotIndex;

    const correctLockfile =
      /bun\.lock(?!b)/.test(content) && !/bun\.lockb/.test(content);

    const noFrozenLockfileHack =
      !/--no-frozen-lockfile/.test(content);

    const changeTurn = firstChangeTurn(toolCalls);
    const readBeforeEdit =
      changeTurn !== undefined &&
      readTurnsForPath(toolCalls, DOCKERFILE_PATH).some((t) => t < changeTurn);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [DOCKERFILE_PATH],
    });

    const noLeftoverComments = content
      .split("\n")
      .filter((l) => l.trim().startsWith("#") && !/^#\s*(FROM|ARG|ENV|WORKDIR)/.test(l))
      .length === 0;

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "manifest COPY comes before bun install",
            pass: firstCopyIsManifest && installBeforeSourceCopy,
            weight: 2,
            detail:
              !firstCopyIsManifest
                ? "first COPY is not a manifest-only copy"
                : !installBeforeSourceCopy
                ? "bun install does not come before COPY . ."
                : undefined,
          },
          {
            name: "correct lockfile name (bun.lock not bun.lockb)",
            pass: correctLockfile,
            weight: 1,
            detail: correctLockfile ? undefined : "wrong lockfile: found bun.lockb, expected bun.lock",
          },
        ],
        scope: [
          {
            name: "only Dockerfile changed",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "idiomatic layer pattern (no --no-frozen-lockfile hack)",
            pass: noFrozenLockfileHack,
            weight: 1,
            detail: noFrozenLockfileHack ? undefined : "--no-frozen-lockfile used as workaround",
          },
          {
            name: "COPY . . present after install",
            pass: copyDotDotIndex !== -1 && installBeforeSourceCopy,
            weight: 1,
            detail:
              copyDotDotIndex === -1
                ? "COPY . . missing"
                : !installBeforeSourceCopy
                ? "COPY . . before install"
                : undefined,
          },
        ],
        verification: [
          {
            name: "read Dockerfile before editing",
            pass: readBeforeEdit,
            weight: 1,
            detail: readBeforeEdit ? undefined : "no read of Dockerfile before first edit",
          },
        ],
        cleanup: [
          {
            name: "no leftover debug comments",
            pass: noLeftoverComments,
            weight: 1,
            detail: noLeftoverComments ? undefined : "stray comments found in Dockerfile",
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
        pass: "Dockerfile properly layers deps before source; correct lockfile.",
        partial: "Partial fix — some layer issues remain.",
        fail: "Dockerfile still copies source before install or has wrong lockfile.",
      }
    );
  },
};

export default scenario;
