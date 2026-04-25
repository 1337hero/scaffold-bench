import { readEnv } from "../../lib/config/env.ts";

export interface Model {
  id: string;
  source: "local" | "remote";
  endpoint: string;
  requiresApiKey?: boolean;
}

export async function probeLocalModels(endpoint: string): Promise<Model[]> {
  const baseUrl = endpoint.replace(/\/v1\/chat\/completions$/, "");
  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
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
  const { remote } = readEnv();
  if (!remote) return [];
  return remote.models.map((id) => ({
    id,
    source: "remote" as const,
    endpoint: remote.endpoint,
    requiresApiKey: Boolean(remote.apiKey),
  }));
}

function dedupeById(models: Model[]): Model[] {
  const seen = new Set<string>();
  return models.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export async function listModels(): Promise<{ local: Model[]; remote: Model[] }> {
  const { localEndpoint } = readEnv();
  const [local, remote] = await Promise.all([
    probeLocalModels(localEndpoint),
    Promise.resolve(getRemoteModels()),
  ]);
  return { local: dedupeById(local), remote: dedupeById(remote) };
}

export function resolveModel(modelId: string): Model | undefined {
  const { localEndpoint, remote } = readEnv();
  if (remote && remote.models.includes(modelId)) {
    return {
      id: modelId,
      source: "remote",
      endpoint: remote.endpoint,
      requiresApiKey: Boolean(remote.apiKey),
    };
  }
  return { id: modelId, source: "local", endpoint: localEndpoint };
}

export function getRemoteApiKey(): string | undefined {
  return readEnv().remote?.apiKey;
}
