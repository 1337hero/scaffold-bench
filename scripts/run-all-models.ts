#!/usr/bin/env bun
/**
 * Unattended batch runner — starts the server, runs the specified models
 * N times through the full scenario suite, then shuts down cleanly.
 *
 * Edit RUNS_PER_MODEL and MODELS below, or override via CLI:
 *   bun scripts/run-all-models.ts [--runs=2] [--warmup=15]
 *
 * MODELS: list of model IDs to benchmark (as seen by llama-swap / remote provider).
 *         Leave empty ([]) to run ALL discovered models.
 */
import { spawn, type Subprocess } from "bun";
import { summarizeRepeatRuns } from "../lib/aggregates.ts";

// ── config ────────────────────────────────────────────────────────────────────
// Edit these before running.

const RUNS_PER_MODEL = 5;

// Ordered fastest → slowest by measured decode t/s (llama-server timings.predicted_per_second).
// Probe: warm 8 tok (load) + measure 96 tok, short prompt, enable_thinking=false. 2026-07-09.
// AntAngelMed intentionally excluded.
//
// DONE (5 full suite runs each) — leave commented so re-runs don't re-queue them:
//   GPT-OSS               156.1 t/s
//   GLM-4.7-Flash         106.9 t/s
//   nemotron-cascade-2     93.1 t/s
//   nemotron               92.7 t/s
//   Qwen-Coder-30B         87.8 t/s
//   Llama3.2-3B            78.3 t/s
//   Qwen3.6                77.8 t/s
//   Ornith-1.0-35B         77.6 t/s
//   Qwen3.6-Uncensored     74.3 t/s
//   Gemma4-26B-A4B         72.0 t/s
//   Qwen3-Coder-Next       61.1 t/s
//
// NEXT batch (pending):
const MODELS: string[] = [
  "GPT-OSS-120B-F16", // 71.0 t/s — 120B MoE
  "Ornith-1.0-9B", // 31.6 t/s — 9B dense
  "Qwen3.5-122B", // 25.8 t/s — 122B-A10B MoE
  "Gemma4-12B", // 21.4 t/s — 12B dense
  "Devstral-Small-24B", // 17.1 t/s — 24B dense
  "Qwen3.6-27B", // 16.2 t/s — 27B dense
  "IBM-Granite", // 15.0 t/s — 30B dense
  "Gemma4-31B", // 13.7 t/s — 31B dense
  "Kimi-Dev-72B", // 9.9 t/s — 72B dense
  "Mistral-Medium-3.5-128B", // 6.0 t/s — 128B dense
];

// Same IDs as comments above, ready to uncomment if you want a re-run:
// const DONE_MODELS: string[] = [
//   "GPT-OSS", // 156.1 t/s
//   "GLM-4.7-Flash", // 106.9 t/s
//   "nemotron-cascade-2", // 93.1 t/s
//   "nemotron", // 92.7 t/s
//   "Qwen-Coder-30B", // 87.8 t/s
//   "Llama3.2-3B", // 78.3 t/s
//   "Qwen3.6", // 77.8 t/s
//   "Ornith-1.0-35B", // 77.6 t/s
//   "Qwen3.6-Uncensored", // 74.3 t/s
//   "Gemma4-26B-A4B", // 72.0 t/s
//   "Qwen3-Coder-Next", // 61.1 t/s
// ];

// ── end config ────────────────────────────────────────────────────────────────

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

const RUNS_FLAG = parseArg("runs", 0); // 0 = use const above
const WARMUP_WAIT_S = parseArg("warmup", 25);

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

const runsPerModel = RUNS_FLAG > 0 ? RUNS_FLAG : RUNS_PER_MODEL;

console.log(`\n${hr()}`);
console.log(`  scaffold-bench — all-models batch runner`);
console.log(`  Runs per model : ${RUNS_FLAG > 0 ? `${runsPerModel} (via --runs)` : runsPerModel}`);
console.log(`  Warmup wait    : ${WARMUP_WAIT_S}s`);
console.log(`  Server port    : ${PORT}`);
console.log(hr());

console.log("\nWaiting for server...");
await waitForServer();
console.log("Server ready.\n");

const [modelsByGroup, scenarios] = await Promise.all([
  getJSON<{ local: { id: string }[]; remote: { id: string }[] }>("/api/models"),
  getJSON<{ id: string }[]>("/api/scenarios"),
]);

const allModels = [...modelsByGroup.local, ...modelsByGroup.remote];

const byId = new Map(allModels.map((m) => [m.id, m]));
const models =
  MODELS.length > 0 ? MODELS.map((id) => byId.get(id)).filter((m) => m != null) : allModels;

const missing = MODELS.filter((id) => !byId.has(id));
if (missing.length > 0) {
  console.warn(`${RED}Configured but not discovered (skipped): ${missing.join(", ")}${RESET}`);
}

if (models.length === 0) {
  if (MODELS.length > 0) {
    console.error(`${RED}None of the configured models (${MODELS.join(", ")}) were found.${RESET}`);
    console.error(`Available: ${allModels.map((m) => m.id).join(", ") || "(none)"}`);
  } else {
    console.error(
      `${RED}No models discovered — is your local model server running, or SCAFFOLD_REMOTE_* set?${RESET}`
    );
  }
  server.kill();
  process.exit(1);
}

const scenarioIds = scenarios.map((s) => s.id);

const filteredNote = MODELS.length > 0 ? ` (filtered from ${allModels.length} discovered)` : "";
console.log(
  `Found ${CYAN}${models.length} model(s)${filteredNote}${RESET}, ${CYAN}${scenarioIds.length} scenario(s)${RESET}, ${CYAN}${runsPerModel} run(s) per model${RESET}.\n`
);

const results: {
  model: string;
  run: number;
  status: string;
  total: number | null;
  max: number | null;
}[] = [];

for (let mi = 0; mi < models.length; mi++) {
  const model = models[mi];
  console.log(hr());
  console.log(`  Model ${mi + 1}/${models.length}: ${GOLD}${model.id}${RESET}`);
  console.log(hr());

  for (let run = 1; run <= runsPerModel; run++) {
    if (mi > 0 || run > 1) {
      process.stdout.write(`  Warmup wait ${WARMUP_WAIT_S}s...`);
      await Bun.sleep(WARMUP_WAIT_S * 1_000);
      process.stdout.write(" done.\n");
    }

    console.log(`\n  ${CYAN}▶ Run ${run}/${runsPerModel}${RESET} — ${model.id}`);

    const { runId } = await postJSON<{ runId: string }>("/api/runs", {
      modelId: model.id,
      scenarioIds,
    });

    console.log(`    run id: ${DIM}${runId}${RESET}`);

    const result = await waitForRun(runId);
    const statusColor = result.status === "done" ? GREEN : RED;

    console.log(`    status: ${statusColor}${result.status}${RESET}`);
    console.log(`    score:  ${score(result.totalPoints, result.maxPoints)}`);

    results.push({
      model: model.id,
      run,
      status: result.status,
      total: result.totalPoints,
      max: result.maxPoints,
    });
  }

  console.log();
}

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
