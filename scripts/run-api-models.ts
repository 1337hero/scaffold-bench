#!/usr/bin/env bun
/**
 * Parallel API-model batch runner — starts the server, fires ALL remote (API)
 * models at once, and lets each work through the full scenario suite on its
 * own. Local models are never touched (they stay serialized behind the GPU).
 *
 *   bun scripts/run-api-models.ts                          # all remote models, 1 run each
 *   bun scripts/run-api-models.ts --runs=3                 # 3 runs per model (sequential within a model)
 *   bun scripts/run-api-models.ts --model=gpt-5.5 --model=claude-sonnet-5
 */
import { spawn, type Subprocess } from "bun";
import { summarizeRepeatRuns } from "../lib/aggregates.ts";

const PORT = Number(Bun.env.SCAFFOLD_WEB_PORT ?? 4317);
const BASE = `http://localhost:${PORT}`;

const GOLD = "\x1b[33m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// ── args ──────────────────────────────────────────────────────────────────────

function parseArg(name: string, fallback: number): number {
  const flag = Bun.argv.find((a) => a.startsWith(`--${name}=`));
  return flag ? Number(flag.split("=")[1]) : fallback;
}

function getAllArgs(name: string): string[] {
  const vals: string[] = [];
  for (const a of Bun.argv) {
    const m = a.match(new RegExp(`^--${name}=(.+)$`));
    if (m) vals.push(m[1]!);
  }
  return vals;
}

const RUNS_PER_MODEL = parseArg("runs", 1);
const ONLY_MODELS = getAllArgs("model");

// ── server lifecycle ──────────────────────────────────────────────────────────

function startServer(): Subprocess {
  const proc = spawn(["bun", "scripts/web.ts"], {
    cwd: import.meta.dir + "/..",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  const tag = (line: string) => process.stdout.write(`${DIM}[server]${RESET} ${line}\n`);

  const pipe = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) tag(l);
    }
    if (buf) tag(buf);
  };

  pipe(proc.stdout);
  pipe(proc.stderr);
  return proc;
}

async function waitForServer(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {}
    await Bun.sleep(500);
  }
  throw new Error("Server did not become ready in time");
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function waitForRun(
  runId: string,
  pollMs = 5_000
): Promise<{ status: string; totalPoints: number | null; maxPoints: number | null }> {
  while (true) {
    const run = await getJSON<{
      status: string;
      totalPoints: number | null;
      maxPoints: number | null;
    }>(`/api/runs/${runId}`);

    if (run.status === "done" || run.status === "failed" || run.status === "stopped") {
      return run;
    }
    await Bun.sleep(pollMs);
  }
}

// ── formatting ────────────────────────────────────────────────────────────────

const hr = (char = "━", width = 72) => char.repeat(width);

function score(total: number | null, max: number | null): string {
  if (total == null || max == null) return "—";
  const pct = max > 0 ? Math.round((total / max) * 100) : 0;
  const color = pct >= 70 ? GREEN : pct >= 40 ? GOLD : RED;
  return `${color}${total}/${max} (${pct}%)${RESET}`;
}

// ── main ──────────────────────────────────────────────────────────────────────

const server = startServer();

process.on("SIGINT", () => {
  server.kill();
  process.exit(0);
});
process.on("SIGTERM", () => {
  server.kill();
  process.exit(0);
});

console.log(`\n${hr()}`);
console.log(`  scaffold-bench — parallel API-model runner`);
console.log(`  Runs per model : ${RUNS_PER_MODEL}`);
console.log(`  Server port    : ${PORT}`);
console.log(hr());

console.log("\nWaiting for server...");
await waitForServer();
console.log("Server ready.\n");

const [modelsByGroup, scenarios] = await Promise.all([
  getJSON<{ local: { id: string }[]; remote: { id: string }[] }>("/api/models"),
  getJSON<{ id: string }[]>("/api/scenarios"),
]);

const remoteModels = modelsByGroup.remote;
const models =
  ONLY_MODELS.length > 0 ? remoteModels.filter((m) => ONLY_MODELS.includes(m.id)) : remoteModels;

const missing = ONLY_MODELS.filter((id) => !remoteModels.some((m) => m.id === id));
if (missing.length > 0) {
  console.warn(`${RED}Requested but not a remote model (skipped): ${missing.join(", ")}${RESET}`);
}

if (models.length === 0) {
  console.error(
    `${RED}No remote models found — is SCAFFOLD_REMOTE_ENDPOINT / SCAFFOLD_REMOTE_MODELS set?${RESET}`
  );
  server.kill();
  process.exit(1);
}

const scenarioIds = scenarios.map((s) => s.id);

console.log(
  `Firing ${CYAN}${models.length} remote model(s)${RESET} in parallel — ${CYAN}${scenarioIds.length} scenario(s)${RESET}, ${CYAN}${RUNS_PER_MODEL} run(s) per model${RESET}.\n`
);

const results: {
  model: string;
  run: number;
  status: string;
  total: number | null;
  max: number | null;
}[] = [];

await Promise.all(
  models.map(async (model) => {
    const tag = `${GOLD}${model.id}${RESET}`;
    for (let run = 1; run <= RUNS_PER_MODEL; run++) {
      try {
        const { runId } = await postJSON<{ runId: string }>("/api/runs", {
          modelId: model.id,
          scenarioIds,
        });
        console.log(`  ${CYAN}▶${RESET} ${tag} run ${run}/${RUNS_PER_MODEL} started ${DIM}(${runId})${RESET}`);

        const result = await waitForRun(runId);
        const statusColor = result.status === "done" ? GREEN : RED;
        console.log(
          `  ${statusColor}■${RESET} ${tag} run ${run}/${RUNS_PER_MODEL} ${statusColor}${result.status}${RESET}  ${score(result.totalPoints, result.maxPoints)}`
        );
        results.push({
          model: model.id,
          run,
          status: result.status,
          total: result.totalPoints,
          max: result.maxPoints,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ${RED}■ ${model.id} run ${run}/${RUNS_PER_MODEL} error: ${msg}${RESET}`);
        results.push({ model: model.id, run, status: "error", total: null, max: null });
      }
    }
  })
);

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${hr("═")}`);
console.log("  SUMMARY");
console.log(hr("═"));

for (const r of results) {
  const statusColor = r.status === "done" ? GREEN : RED;
  console.log(
    `  ${r.model.padEnd(40)} run ${r.run}  ${statusColor}${r.status.padEnd(8)}${RESET}  ${score(r.total, r.max)}`
  );
}

const byModel = new Map<string, number[]>();
for (const r of results) {
  if (r.status !== "done" || r.total == null) continue;
  byModel.set(r.model, [...(byModel.get(r.model) ?? []), r.total]);
}
if (byModel.size > 0) {
  console.log();
  for (const [model, totals] of byModel) {
    const s = summarizeRepeatRuns(totals);
    const max = results.find((r) => r.model === model && r.max != null)?.max ?? null;
    const excluded = results.filter((r) => r.model === model).length - s.runs;
    const note = excluded > 0 ? ` ${DIM}(${excluded} run(s) excluded)${RESET}` : "";
    console.log(
      `  ${model.padEnd(40)} median ${score(s.medianPoints, max)} over ${s.runs} run(s), spread ±${s.spread}${note}`
    );
  }
}

const total = results.length;
const done = results.filter((r) => r.status === "done").length;
console.log(`\n  ${done}/${total} runs completed successfully.`);
console.log(hr("═"));

server.kill();
process.exit(done === total ? 0 : 1);
