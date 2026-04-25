import type { StreamDebugStats } from "@/hooks/useSSE";
import type { RunStatus } from "@/types";

interface StatusBarProps {
  model: string | null;
  apiStatus: "checking" | "ok" | "error";
  runStatus: RunStatus;
  streamStats?: StreamDebugStats;
}

function formatAgo(lastEventTs: number | null): string {
  if (!lastEventTs) return "—";
  const delta = Date.now() - lastEventTs;
  if (delta < 1000) return "just now";
  return `${(delta / 1000).toFixed(1)}s ago`;
}

export function StatusBar({ model, apiStatus, runStatus, streamStats }: StatusBarProps) {
  const eventsPerSec = streamStats?.eventsPerSec ?? 0;
  const charsPerSec = streamStats?.deltaCharsPerSec ?? 0;
  const lastAgoMs = streamStats?.lastEventTs
    ? Date.now() - streamStats.lastEventTs
    : Number.POSITIVE_INFINITY;
  const streamHealthy = runStatus !== "running" || eventsPerSec > 0 || lastAgoMs < 2500;
  const streamClass =
    runStatus !== "running" ? "text-text-dim" : streamHealthy ? "text-green-main" : "text-red-main";
  const streamState = streamStats?.connectionState ?? "idle";
  return (
    <footer className="flex-none flex items-center justify-between h-[42px] border-t border-border-main bg-content-bg px-4 text-[11px] text-text-dim mt-2">
      <div className="flex gap-4 items-center">
        <span className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              apiStatus === "ok"
                ? "bg-green-main shadow-[0_0_4px_var(--color-green-main)]"
                : apiStatus === "error"
                  ? "bg-red-main shadow-[0_0_4px_var(--color-red-main)]"
                  : "bg-gold animate-pulse"
            }`}
          />
          {apiStatus === "ok"
            ? "HTTP API: connected"
            : apiStatus === "error"
              ? "HTTP API: unreachable"
              : "HTTP API: connecting…"}
        </span>
        <span>MODEL: {model ?? "—"}</span>
        <span className={streamClass}>
          STREAM[{streamState}]: {eventsPerSec} ev/s · {charsPerSec} ch/s
        </span>
        <span className="text-text-dim">last: {formatAgo(streamStats?.lastEventTs ?? null)}</span>
      </div>
      <div className="flex items-center gap-3">
        <span>
          <kbd className="bg-border-main px-1.5 py-0.5 rounded-sm text-text-main">R</kbd> Start
        </span>
        <span>
          <kbd className="bg-border-main px-1.5 py-0.5 rounded-sm text-text-main">S</kbd> Stop
        </span>
        <span>
          <kbd className="bg-border-main px-1.5 py-0.5 rounded-sm text-text-main">H</kbd> History
        </span>
        <span>
          <kbd className="bg-border-main px-1.5 py-0.5 rounded-sm text-text-main">Esc</kbd> Close
        </span>
      </div>
    </footer>
  );
}
