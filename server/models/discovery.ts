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
    requiresApiKey: !remote.apiKey,
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

export async function resolveModel(modelId: string): Promise<Model | undefined> {
  const { localEndpoint, remote } = readEnv();
  if (remote && remote.models.includes(modelId)) {
    return {
      id: modelId,
      source: "remote",
      endpoint: remote.endpoint,
      requiresApiKey: !remote.apiKey,
    };
  }

  const localModels = await probeLocalModels(localEndpoint);
  if (localModels.length === 0) {
    return { id: modelId, source: "local", endpoint: localEndpoint };
  }

  return localModels.find((m) => m.id === modelId);
}

export function getRemoteApiKey(): string | undefined {
  return readEnv().remote?.apiKey;
}
