import { chatHeaders, normalizeEndpoint } from "./local-model.ts";

export type PreflightFailureReason =
  | "endpoint_unreachable"
  | "model_not_found"
  | "auth"
  | "bad_response";

export type PreflightResult =
  | { ok: true; latencyMs: number }
  | { ok: false; reason: PreflightFailureReason; detail: string };

const DEFAULT_PREFLIGHT_TIMEOUT_MS = 120_000;

export async function preflightModel(cfg: {
  endpoint: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<PreflightResult> {
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(normalizeEndpoint(cfg.endpoint), {
      method: "POST",
      headers: chatHeaders(cfg.apiKey),
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: "." }],
        // OpenAI (via OpenRouter) rejects max_tokens < 16
        max_tokens: 16,
        stream: false,
      }),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? DEFAULT_PREFLIGHT_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: "endpoint_unreachable", detail };
  }

  if (response.ok) {
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  }

  const body = await response.text().catch(() => "");
  const detail = `HTTP ${response.status}: ${body.slice(0, 300)}`;
  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: "auth", detail };
  }
  if (response.status === 404 || /model.*not.*found|unknown model/i.test(body)) {
    return { ok: false, reason: "model_not_found", detail };
  }
  return { ok: false, reason: "bad_response", detail };
}
