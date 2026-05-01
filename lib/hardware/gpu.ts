import { spawnSync } from "node:child_process";

export type GpuBackend = "ROCm" | "CUDA" | "CPU";

export interface GpuInfo {
  backend: GpuBackend;
  model: string | null;
  count: number;
  vramTotalMB: number | null;
}

let cached: GpuInfo | undefined;

function detectRocm(): GpuInfo | null {
  const r = spawnSync("rocm-smi", ["--showproductname", "--showmeminfo", "vram", "--json"], {
    encoding: "utf-8",
  });
  if (r.status !== 0) return null;
  const jsonStart = r.stdout.indexOf("{");
  if (jsonStart === -1) return null;
  let parsed: Record<string, Record<string, string>>;
  try {
    parsed = JSON.parse(r.stdout.slice(jsonStart));
  } catch {
    return null;
  }
  const cards = Object.values(parsed);
  if (cards.length === 0) return null;
  const first = cards[0];
  const model = first?.["Card Series"] ?? null;
  const vramBytes = cards.reduce((sum, c) => {
    const v = Number(c["VRAM Total Memory (B)"]);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
  return {
    backend: "ROCm",
    model,
    count: cards.length,
    vramTotalMB: vramBytes > 0 ? Math.round(vramBytes / (1024 * 1024)) : null,
  };
}

function detectCuda(): GpuInfo | null {
  const r = spawnSync(
    "nvidia-smi",
    ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
    { encoding: "utf-8" }
  );
  if (r.status !== 0) return null;
  const lines = r.stdout.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return null;
  const rows = lines.map((line) => {
    const [name, memMb] = line.split(",").map((s) => s.trim());
    return { name, memMb: Number(memMb) };
  });
  return {
    backend: "CUDA",
    model: rows[0]?.name ?? null,
    count: rows.length,
    vramTotalMB: rows.reduce((sum, r) => sum + (Number.isFinite(r.memMb) ? r.memMb : 0), 0) || null,
  };
}

export function detectGpu(): GpuInfo {
  if (cached) return cached;
  cached = detectRocm() ?? detectCuda() ?? {
    backend: "CPU",
    model: null,
    count: 0,
    vramTotalMB: null,
  };
  return cached;
}
