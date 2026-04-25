import { Schema } from "effect";
import { EnvSchema } from "../schemas/config.ts";

const DEFAULT_LOCAL_ENDPOINT = "http://127.0.0.1:8082";

export interface RemoteProvider {
  endpoint: string;
  apiKey: string | undefined;
  models: string[];
}

export interface ScaffoldEnv {
  localEndpoint: string;
  remote: RemoteProvider | undefined;
}

export function readEnv(): ScaffoldEnv {
  const env = Schema.decodeUnknownSync(EnvSchema)({
    SCAFFOLD_LOCAL_ENDPOINT: Bun.env.SCAFFOLD_LOCAL_ENDPOINT,
    SCAFFOLD_REMOTE_ENDPOINT: Bun.env.SCAFFOLD_REMOTE_ENDPOINT,
    SCAFFOLD_REMOTE_API_KEY: Bun.env.SCAFFOLD_REMOTE_API_KEY,
    SCAFFOLD_REMOTE_MODELS: Bun.env.SCAFFOLD_REMOTE_MODELS,
  });

  const localEndpoint = env.SCAFFOLD_LOCAL_ENDPOINT?.trim() || DEFAULT_LOCAL_ENDPOINT;

  const remoteModels = parseList(env.SCAFFOLD_REMOTE_MODELS);
  const remote: RemoteProvider | undefined =
    env.SCAFFOLD_REMOTE_ENDPOINT && remoteModels.length > 0
      ? {
          endpoint: env.SCAFFOLD_REMOTE_ENDPOINT,
          apiKey: env.SCAFFOLD_REMOTE_API_KEY,
          models: remoteModels,
        }
      : undefined;

  return { localEndpoint, remote };
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
