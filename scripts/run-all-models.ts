#!/usr/bin/env bun
/**
 * Unattended batch runner — starts the server, runs every discovered model
 * N times through the full scenario suite, then shuts down cleanly.
 *
 * Usage:
 *   bun scripts/run-all-models.ts [--runs=2] [--warmup=15]
 */
import { spawn, type Subprocess } from "bun";

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

const RUNS_PER_MODEL = parseArg("runs", 2);
const WARMUP_WAIT_S = parseArg("warmup", 15);

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
console.log(`  scaffold-bench — all-models batch runner`);
console.log(`  Runs per model : ${RUNS_PER_MODEL}`);
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

const models = [...modelsByGroup.local, ...modelsByGroup.remote];

if (models.length === 0) {
  console.error(
    `${RED}No models discovered — is your local model server running, or SCAFFOLD_REMOTE_* set?${RESET}`
  );
  server.kill();
  process.exit(1);
}

const scenarioIds = scenarios.map((s) => s.id);

console.log(
  `Found ${CYAN}${models.length} model(s)${RESET}, ${CYAN}${scenarioIds.length} scenario(s)${RESET}.\n`
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

  for (let run = 1; run <= RUNS_PER_MODEL; run++) {
    if (mi > 0 || run > 1) {
      process.stdout.write(`  Warmup wait ${WARMUP_WAIT_S}s...`);
      await Bun.sleep(WARMUP_WAIT_S * 1_000);
      process.stdout.write(" done.\n");
    }

    console.log(`\n  ${CYAN}▶ Run ${run}/${RUNS_PER_MODEL}${RESET} — ${model.id}`);

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

const total = results.length;
const done = results.filter((r) => r.status === "done").length;
console.log(`\n  ${done}/${total} runs completed successfully.`);
console.log(hr("═"));

server.kill();
process.exit(done === total ? 0 : 1);
