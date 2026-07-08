#!/usr/bin/env bun
/**
 * Overnight batch runner — brings local (and optionally remote) models up to
 * a target number of runs each.
 *
 * Usage:
 *   bun scripts/run-to-target.ts                    # local models → 5 runs
 *   bun scripts/run-to-target.ts --target=3           # local models → 3 runs
 *   bun scripts/run-to-target.ts --include-remote     # also fill remote models
 *   bun scripts/run-to-target.ts --target=5 --warmup=30
 *   bun scripts/run-to-target.ts --exclude=AntAngelMed --exclude=Llama3.2-3B
 */
import { spawn, type Subprocess } from "bun";
import { Database } from "bun:sqlite";
import { summarizeRepeatRuns } from "../lib/aggregates.ts";

// ── exclude list ──────────────────────────────────────────────────────────────
// Models to skip (e.g. broken models, tiny models not worth bench-marking)
const EXCLUDE = new Set(["AntAngelMed"]);

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

function hasFlag(name: string): boolean {
  return Bun.argv.includes(`--${name}`);
}

function getAllArgs(name: string): string[] {
  const vals: string[] = [];
  for (const a of Bun.argv) {
    const m = a.match(new RegExp(`^--${name}=(.+)$`));
    if (m) vals.push(m[1]!);
  }
  return vals;
}

const TARGET = parseArg("target", 5);
const WARMUP_WAIT_S = parseArg("warmup", 25);
const INCLUDE_REMOTE = hasFlag("include-remote");

// ── paths ─────────────────────────────────────────────────────────────────────

const ROOT = import.meta.dir + "/..";
const DB_PATH = process.env.SCAFFOLD_DB_PATH || `${ROOT}/scaffold-bench.db`;
const PORT = Number(Bun.env.SCAFFOLD_WEB_PORT ?? 4317);
const BASE = `http://localhost:${PORT}`;

// ── DB helpers ────────────────────────────────────────────────────────────────

function getRunCounts(): Map<string, number> {
  const db = new Database(DB_PATH);
  const rows = db.query("SELECT model, COUNT(*) as cnt FROM runs GROUP BY model").all() as {
    model: string;
    cnt: number;
  }[];
  db.close();
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.model, r.cnt);
  return map;
}

// ── server lifecycle (lifted from run-piped-models.ts) ────────────────────────

function startServer(): Subprocess {
  const proc = spawn(["bun", "scripts/web.ts"], {
    cwd: ROOT,
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

async function waitForServer(timeoutMs = 30_000): Promise<void> {
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

// CLI-driven excludes (can be used multiple times)
for (const id of getAllArgs("exclude")) EXCLUDE.add(id);

const server = startServer();

process.on("SIGINT", () => {
  server.kill();
  process.exit(0);
});
process.on("SIGTERM", () => {
  server.kill();
  process.exit(0);
});

// 1. Get current run counts from DB
const currentCounts = getRunCounts();

console.log(`\n${hr("═")}`);
console.log(`  scaffold-bench — overnight target runner`);
console.log(`  Target runs per model: ${TARGET}`);
console.log(`  Include remote models: ${INCLUDE_REMOTE ? "yes" : "no"}`);
console.log(`  Warmup wait          : ${WARMUP_WAIT_S}s`);
console.log(`  Server port          : ${PORT}`);
console.log(`  DB path              : ${DB_PATH}`);
console.log(hr("═"));

// 2. Wait for server and get model list
console.log("\nWaiting for server...");
await waitForServer();
console.log("Server ready.\n");

const { local, remote } = await getJSON<{
  local: { id: string }[];
  remote: { id: string }[];
}>("/api/models");

const candidates = INCLUDE_REMOTE
  ? [
      ...local.map((m) => ({ id: m.id, source: "local" as const })),
      ...remote.map((m) => ({ id: m.id, source: "remote" as const })),
    ]
  : local.map((m) => ({ id: m.id, source: "local" as const }));

// 3. Filter to models below target
const deficits: { id: string; source: string; needed: number }[] = [];
for (const m of candidates) {
  const current = currentCounts.get(m.id) ?? 0;
  const needed = TARGET - current;
  if (needed > 0 && !EXCLUDE.has(m.id)) {
    deficits.push({ id: m.id, source: m.source, needed });
  }
}

if (deficits.length === 0) {
  console.log(`${GREEN}All models already at ${TARGET}+ runs. Nothing to do.${RESET}`);
  server.kill();
  process.exit(0);
}

console.log(`Models needing runs (${deficits.length} total):\n`);
for (const d of deficits) {
  const current = currentCounts.get(d.id) ?? 0;
  console.log(
    `  ${d.id.padEnd(40)} ${current} → ${TARGET}  ${GOLD}+${d.needed} run(s)${RESET}  ${DIM}(${d.source})${RESET}`
  );
}

// 4. Get all scenario IDs
const scenarios = await getJSON<{ id: string }[]>("/api/scenarios");
const scenarioIds = scenarios.map((s) => s.id);
console.log(`\n  Scenarios: ${CYAN}${scenarioIds.length}${RESET}`);

const totalRuns = deficits.reduce((sum, d) => sum + d.needed, 0);
console.log(`  Total runs to execute: ${CYAN}${totalRuns}${RESET}`);
console.log(hr("═"));

// 5. Execute runs
const results: {
  model: string;
  run: number;
  source: string;
  status: string;
  total: number | null;
  max: number | null;
}[] = [];

let cumulativeIndex = 0;

for (let mi = 0; mi < deficits.length; mi++) {
  const m = deficits[mi]!;
  console.log(`\n${hr()}`);
  console.log(
    `  ${CYAN}${m.id}${RESET}  ${DIM}(${m.source})${RESET} — need ${GOLD}+${m.needed}${RESET} to reach ${TARGET}`
  );
  console.log(hr());

  for (let run = 1; run <= m.needed; run++) {
    cumulativeIndex++;

    if (cumulativeIndex > 1) {
      process.stdout.write(`  Warmup wait ${WARMUP_WAIT_S}s...`);
      await Bun.sleep(WARMUP_WAIT_S * 1_000);
      process.stdout.write(" done.\n");
    }

    const pct = Math.round((cumulativeIndex / totalRuns) * 100);
    console.log(
      `\n  ${GOLD}[${cumulativeIndex}/${totalRuns} (${pct}%)]${RESET}  ${CYAN}▶ Run ${run}/${m.needed}${RESET} — ${m.id}`
    );

    try {
      const { runId } = await postJSON<{ runId: string }>("/api/runs", {
        modelId: m.id,
        scenarioIds,
      });

      console.log(`    run id: ${DIM}${runId}${RESET}`);

      const result = await waitForRun(runId);
      const statusColor = result.status === "done" ? GREEN : RED;

      console.log(`    status: ${statusColor}${result.status}${RESET}`);
      console.log(`    score:  ${score(result.totalPoints, result.maxPoints)}`);

      results.push({
        model: m.id,
        run,
        source: m.source,
        status: result.status,
        total: result.totalPoints,
        max: result.maxPoints,
      });
    } catch (err) {
      console.error(`    ${RED}Error: ${err}${RESET}`);
      results.push({
        model: m.id,
        run,
        source: m.source,
        status: `error: ${err}`,
        total: null,
        max: null,
      });
    }
  }
}

// 6. Summary
console.log(`\n\n${hr("═")}`);
console.log("  FINAL SUMMARY");
console.log(hr("═"));

const newCounts = getRunCounts();
let ok = 0;
let fail = 0;

for (const d of deficits) {
  const after = newCounts.get(d.id) ?? 0;
  const before = currentCounts.get(d.id) ?? 0;
  const added = after - before;
  const targetReached = after >= TARGET;
  const icon = targetReached ? GREEN + "✓" : RED + "✗";
  console.log(
    `  ${icon}${RESET}  ${d.id.padEnd(40)} ${before} → ${CYAN}${after}${RESET}  (+${added}) ${targetReached ? "" : `${RED}short ${TARGET - after}${RESET}`}`
  );
  if (targetReached) ok++;
  else fail++;
}

console.log();
if (results.length > 0) {
  console.log(`  Run results:`);
  for (const r of results) {
    const statusColor = r.status === "done" ? GREEN : RED;
    console.log(
      `    ${r.model.padEnd(40)} run ${r.run}  ${statusColor}${r.status.padEnd(8)}${RESET}  ${score(r.total, r.max)}`
    );
  }
}

console.log(`\n  ${GREEN}${ok}${RESET} models at target, ${RED}${fail}${RESET} short`);
console.log(hr("═"));

server.kill();
process.exit(fail === 0 ? 0 : 1);
