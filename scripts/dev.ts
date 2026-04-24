#!/usr/bin/env bun
import { spawn, type Subprocess } from "bun";

const GOLD = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function prefix(label: string, color: string, stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buf = "";
  (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        process.stdout.write(`${color}${label}${RESET} ${DIM}│${RESET} ${line}\n`);
      }
    }
    if (buf) process.stdout.write(`${color}${label}${RESET} ${DIM}│${RESET} ${buf}\n`);
  })();
}

const procs: Subprocess[] = [];

function shutdown(code = 0) {
  for (const p of procs) {
    try { p.kill(); } catch {}
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const api = spawn(["bun", "web.ts"], {
  cwd: import.meta.dir + "/..",
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env, FORCE_COLOR: "1" },
});
procs.push(api);
prefix("api", GOLD, api.stdout);
prefix("api", GOLD, api.stderr);

const ui = spawn(["bun", "run", "dev"], {
  cwd: import.meta.dir + "/../web-ui",
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env, FORCE_COLOR: "1" },
});
procs.push(ui);
prefix("ui ", CYAN, ui.stdout);
prefix("ui ", CYAN, ui.stderr);

await Promise.race([api.exited, ui.exited]);
shutdown(1);
