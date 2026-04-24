import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { RootConfigSchema } from "../../lib/schemas/config.ts";

export interface Model {
  id: string;
  source: "local" | "remote";
  endpoint?: string;
  requiresApiKey?: boolean;
}

const ROOT_CONFIG_PATH = join(import.meta.dir, "../../scaffold.config.json");

function readConfig(): Schema.Schema.Type<typeof RootConfigSchema> {
  if (!existsSync(ROOT_CONFIG_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(ROOT_CONFIG_PATH, "utf-8"));
    return Schema.decodeUnknownSync(RootConfigSchema)(raw);
  } catch {
    return {};
  }
}

export async function probeLocalModels(endpoint: string): Promise<Model[]> {
  const baseUrl = endpoint.replace(/\/v1\/chat\/completions$/, "");
  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as unknown;
    if (
      typeof data !== "object" ||
      data === null ||
      !("data" in data) ||
      !Array.isArray((data as { data: unknown }).data)
    ) {
      return [];
    }
    return (data as { data: Array<{ id?: unknown }> }).data
      .filter((m) => typeof m.id === "string")
      .map((m) => ({ id: m.id as string, source: "local" as const, endpoint }));
  } catch {
    return [];
  }
}

export function getRemoteModels(): Model[] {
  const config = readConfig();
  if (!config.remoteModels) return [];
  return config.remoteModels.map((m) => ({
    id: m.id,
    source: "remote" as const,
    endpoint: m.endpoint,
    requiresApiKey: m.requiresApiKey,
  }));
}

export async function listModels(endpoint?: string): Promise<{ local: Model[]; remote: Model[] }> {
  const config = readConfig();
  const effectiveEndpoint = endpoint ?? config.endpoint ?? "http://127.0.0.1:8082";
  const [local, remote] = await Promise.all([
    probeLocalModels(effectiveEndpoint),
    Promise.resolve(getRemoteModels()),
  ]);
  const dedupeById = (models: Model[]) => {
    const seen = new Set<string>();
    return models.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  };
  return { local: dedupeById(local), remote: dedupeById(remote) };
}
