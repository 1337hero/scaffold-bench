export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function formatTps(value: number | null, approx: boolean, digits: number): string {
  if (value === null) return "—";
  return `${approx ? "~" : ""}${value.toFixed(digits)}`;
}

export function formatSeconds(value: number | null, digits: number): string {
  return value === null ? "—" : `${value.toFixed(digits)}s`;
}

export function formatDuration(startedAt: number, finishedAt: number | null): string {
  if (!finishedAt) return "—";
  const totalSec = Math.floor((finishedAt - startedAt) / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function formatNowHHMMSS(): string {
  return new Date().toISOString().substring(11, 19);
}
