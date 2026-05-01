import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

let cached: BenchIdentity | undefined;

export interface BenchIdentity {
  benchVersion: string;
  gitDirty: 0 | 1;
  systemPromptHash: string | null;
}

function pkgVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function gitShortSha(): string | null {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT, encoding: "utf-8" });
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

function gitDirty(): 0 | 1 {
  const r = spawnSync("git", ["status", "--porcelain"], { cwd: REPO_ROOT, encoding: "utf-8" });
  if (r.status !== 0) return 0;
  return r.stdout.trim().length > 0 ? 1 : 0;
}

function systemPromptHash(): string | null {
  try {
    const buf = readFileSync(join(REPO_ROOT, "system-prompt.md"));
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(buf);
    return hasher.digest("hex");
  } catch {
    return null;
  }
}

export function getBenchIdentity(): BenchIdentity {
  if (cached) return cached;
  const sha = gitShortSha();
  const version = pkgVersion();
  cached = {
    benchVersion: sha ? `${version}+${sha}` : version,
    gitDirty: gitDirty(),
    systemPromptHash: systemPromptHash(),
  };
  return cached;
}
