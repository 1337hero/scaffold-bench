import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  bunAvailable,
  firstChangeTurn,
  firstTurn,
  noAddedComments,
  noConsoleLog,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { instrumentApiCalls, runBunTest, runHiddenTests } from "./_shared/evaluators/index.js";

const DIR = "playground/sb28-query-cache";

export const meta = {
  id: "SB-28",
  name: "query-stale-refetch",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "unit" as const,
  stacks: ["tanstack-query", "typescript"] as const,
  taskType: "bugfix" as const,
  difficulty: "medium" as const,
  surface: "frontend" as const,
  tests: {
    public: ["playground/sb28-query-cache/queryCache.test.ts"],
    hidden: ["lib/scenarios/hidden/SB-28/refetch-counts.test.ts"],
  },
  fixturePath: "playground/sb28-query-cache/",
  prompt: `\`playground/sb28-query-cache/queryCache.ts\` ignores \`staleTime\` and refetches on every \`fetchQuery\` call, hammering the network. Make it serve a fresh entry (within \`staleTime\` of its last fetch) from cache, and only refetch once the entry is stale. Don't change the options shape or the public API.`,
} as const;

// Drive the submitted cache through an instrumented fetch to prove, at evaluate
// time, that a fresh read serves from cache (1 fetch) and a stale read refetches.
async function instrumentedFetchCounts(
  fixtureDir: string
): Promise<{ fresh: number; stale: number } | null> {
  try {
    const mod = await import(join(fixtureDir, "queryCache.ts"));
    const create = mod.createQueryCache as (now: () => number) => {
      fetchQuery: (o: {
        key: string;
        queryFn: () => Promise<unknown>;
        staleTime: number;
      }) => Promise<unknown>;
    };

    let clock = 0;
    const counter = instrumentApiCalls(async () => new Response("ok"));
    const cache = create(() => clock);
    const opts = {
      key: "k",
      staleTime: 5000,
      queryFn: async () => {
        await counter.fetch("/api/k");
        return "v";
      },
    };
    await cache.fetchQuery(opts);
    clock = 2000;
    await cache.fetchQuery(opts);
    const fresh = counter.count; // expect 1
    clock = 9000;
    await cache.fetchQuery(opts);
    const stale = counter.count; // expect 2
    return { fresh, stale };
  } catch {
    return null;
  }
}

const scenario: Scenario = {
  id: "SB-28" as ScenarioId,
  name: "query-stale-refetch",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, DIR);
    const cachePath = join(fixtureDir, "queryCache.ts");
    const cacheSrc = await readFile(cachePath, "utf-8");
    const original = await readFile(join(PLAYGROUND_SRC, "sb28-query-cache/queryCache.ts"), "utf-8");

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${DIR}/queryCache.ts`],
    });

    const readTurn = firstTurn(toolCalls, "read");
    const changeTurn = firstChangeTurn(toolCalls);

    const publicTest = bunAvailable()
      ? await runBunTest(fixtureDir, "queryCache.test.ts")
      : { pass: false, stdout: "", stderr: "bun unavailable" };
    const hidden = await runHiddenTests("SB-28", fixtureDir);
    const counts = await instrumentedFetchCounts(fixtureDir);
    const instrumented = counts !== null && counts.fresh === 1 && counts.stale === 2;
    const correct = publicTest.pass && hidden.total > 0 && hidden.rate === 1 && instrumented;

    const readsStaleTime = /staleTime/.test(cacheSrc) && /fetchedAt|now\s*\(/.test(cacheSrc);
    const keepsApi = /fetchQuery/.test(cacheSrc) && /createQueryCache/.test(cacheSrc);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "fresh read served from cache, stale read refetches (instrumented fetch count)",
            pass: correct,
            weight: 3,
            detail: correct
              ? undefined
              : `counts=${JSON.stringify(counts)}\n${publicTest.stdout}\n${publicTest.stderr}`,
          },
        ],
        scope: [
          { name: "edited only queryCache.ts", pass: scope.pass, weight: 2, detail: scope.detail },
        ],
        pattern: [
          { name: "compares against staleTime using the last fetch time", pass: readsStaleTime, weight: 1 },
          { name: "kept the options shape and public API", pass: keepsApi, weight: 1 },
        ],
        verification: [
          {
            name: "read file before changing it (turn-ordered)",
            pass: readTurn !== undefined && changeTurn !== undefined && readTurn < changeTurn,
            weight: 1,
          },
        ],
        cleanup: [
          { name: "no comments added", pass: noAddedComments(cacheSrc, original), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(cacheSrc), weight: 1 },
        ],
      },
      {
        pass: "staleTime honored: fresh reads cached, stale reads refetch; API intact.",
        partial: "Some caching added but the staleTime boundary is wrong or junk was left.",
        fail: "Did not honor staleTime; still refetches every call (or never refetches).",
      }
    );
  },
};

export default scenario;
