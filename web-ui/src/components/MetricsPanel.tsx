import type { ModelMetrics } from "@/types";
import { TuiBox } from "./TuiBox";
import { Cpu, Zap } from "lucide-react";

interface MetricsPanelProps {
  metrics?: ModelMetrics;
  toolCount: number;
  bashCalls: number;
  editCalls: number;
  firstTokenMs?: number;
  turnWallTimes?: number[];
  turnFirstTokenMs?: number[];
}

function fmtRate(tokens?: number, ms?: number): string {
  if (tokens === undefined || ms === undefined || ms <= 0) return "—";
  return ((tokens / ms) * 1000).toFixed(1);
}

function compactSeconds(values?: number[]): string {
  if (!values?.length) return "—";
  const shown = values.slice(0, 4).map((ms) => `${(ms / 1000).toFixed(1)}s`);
  return values.length > 4 ? `${shown.join(", ")} +${values.length - 4}` : shown.join(", ");
}

export function MetricsPanel({
  metrics,
  toolCount,
  bashCalls,
  editCalls,
  firstTokenMs,
  turnWallTimes,
  turnFirstTokenMs,
}: MetricsPanelProps) {
  const promptTps = metrics
    ? fmtRate(metrics.promptEvalTokens, metrics.promptEvalTimeMs)
    : "—";
  const genTps = metrics
    ? fmtRate(metrics.completionEvalTokens, metrics.completionEvalTimeMs)
    : "—";

  return (
    <TuiBox title="Metrics" className="flex-none">
      <div className="p-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex flex-col">
            <span className="text-[10px] text-text-dim uppercase tracking-widest flex items-center gap-1">
              <Cpu size={9} /> Calls / Tools
            </span>
            <span className="text-[16px] font-bold text-text-main leading-tight">
              {metrics?.requestCount ?? 0}{" "}
              <span className="text-sm font-normal text-text-dim">/ {toolCount}</span>
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-text-dim uppercase tracking-widest flex items-center gap-1">
              <Zap size={9} /> Speed (p/s · g/s)
            </span>
            <span className="text-[16px] font-bold text-gold leading-tight">
              {promptTps} <span className="text-text-dim font-normal">·</span> {genTps}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-text-dim uppercase tracking-widest">Prompt Tok</span>
            <span className="text-[14px] font-bold text-text-main leading-tight">
              {metrics?.promptTokens.toLocaleString() ?? "—"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-text-dim uppercase tracking-widest">Gen Tok</span>
            <span className="text-[14px] font-bold text-green-main leading-tight">
              {metrics?.completionTokens.toLocaleString() ?? "—"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-text-dim uppercase tracking-widest">Bash / Edit</span>
            <span className="text-[14px] font-bold text-blue-main leading-tight">
              {bashCalls} <span className="text-text-dim font-normal">/ {editCalls}</span>
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-text-dim uppercase tracking-widest">First Token</span>
            <span className="text-[14px] font-bold text-text-main leading-tight">
              {firstTokenMs !== undefined ? `${(firstTokenMs / 1000).toFixed(2)}s` : "—"}
            </span>
          </div>
        </div>
        <div className="border-t border-border-main pt-2 text-[11px] text-text-dim flex flex-col gap-0.5">
          {metrics?.model && <span>model: {metrics.model}</span>}
          {metrics?.requestCount && <span>requests: {metrics.requestCount}</span>}
          {metrics?.totalRequestTimeMs !== undefined && metrics.totalRequestTimeMs > 0 && (
            <span>request wall: {(metrics.totalRequestTimeMs / 1000).toFixed(2)}s</span>
          )}
          <span>turn walls: {compactSeconds(turnWallTimes)}</span>
          <span>turn first token: {compactSeconds(turnFirstTokenMs)}</span>
        </div>
      </div>
    </TuiBox>
  );
}
