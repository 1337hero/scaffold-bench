type PromptMetrics = {
  finishReason?: string;
  wallTimeMs?: number;
  firstTokenMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
};

interface OneshotMetadataProps {
  model: string | null;
  promptId: string | null;
  metrics?: PromptMetrics;
}

export function OneshotMetadata({ model, promptId, metrics }: OneshotMetadataProps) {
  const wallTimeMs = metrics?.wallTimeMs ?? 0;
  const completionTokens = metrics?.completionTokens;
  const tps =
    completionTokens != null && wallTimeMs > 0
      ? ((completionTokens * 1000) / wallTimeMs).toFixed(1)
      : null;

  return (
    <div className="p-3 text-xs space-y-2">
      <Row label="Model" value={model ?? "—"} />
      <Row label="Prompt" value={promptId ?? "—"} />
      <Row label="Finish" value={metrics?.finishReason ?? "—"} />
      <Row label="Wall" value={metrics?.wallTimeMs != null ? `${metrics.wallTimeMs} ms` : "—"} />
      <Row
        label="First token"
        value={
          metrics?.firstTokenMs != null && metrics.firstTokenMs > 0
            ? `${metrics.firstTokenMs} ms`
            : "—"
        }
      />
      <Row label="Prompt tokens" value={metrics?.promptTokens?.toString() ?? "—"} />
      <Row label="Completion tokens" value={metrics?.completionTokens?.toString() ?? "—"} />
      <Row label="Output rate" value={tps ? `${tps} tok/s` : "—"} />
      {metrics?.error ? <div className="text-red-main break-words">{metrics.error}</div> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border-main pb-1">
      <span className="text-text-dim uppercase tracking-wider">{label}</span>
      <span className="text-text-main text-right break-all">{value}</span>
    </div>
  );
}
