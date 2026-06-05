import type { ReportModelAggregate } from "@/types";
import { formatSeconds, formatTps, formatWallTime } from "@/lib/format";
import { scoreTextColor } from "@/lib/score-color";
import { SectionTitle } from "./SectionTitle";
import { SourceBadge } from "./ReportHeader";

export function Leaderboard({ models }: { models: ReportModelAggregate[] }) {
  return (
    <section className="mt-8">
      <SectionTitle>Leaderboard</SectionTitle>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border-main text-[10px] uppercase tracking-widest text-text-dim bg-border-main/50">
              <th className="text-left py-2 px-2">#</th>
              <th className="text-left py-2 px-2">Model</th>
              <th className="text-left py-2 px-2">Src</th>
              <th className="text-right py-2 px-2">Score</th>
              <th className="text-right py-2 px-2">Behav</th>
              <th className="text-right py-2 px-2">Browser</th>
              <th className="text-right py-2 px-2">Hidden</th>
              <th className="text-right py-2 px-2">Pts/tool</th>
              <th className="text-right py-2 px-2">Pts/run</th>
              <th className="text-right py-2 px-2">Gen TPS</th>
              <th className="text-right py-2 px-2">Prompt TPS</th>
              <th className="text-right py-2 px-2">Scen Avg</th>
              <th className="text-right py-2 px-2">Total Wall</th>
              <th className="text-right py-2 px-2">TTFT</th>
              <th className="text-right py-2 px-2">Tools</th>
              <th className="text-right py-2 px-2">Requests</th>
              <th className="text-right py-2 px-2">Runs</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model, index) => (
              <tr key={model.model} className="border-b border-border-main hover:bg-prompt-bg">
                <td className="py-2 px-2 text-text-main">{index + 1}</td>
                <td className="py-2 px-2 text-text-main font-bold max-w-[260px] truncate">
                  {model.model}
                </td>
                <td className="py-2 px-2">
                  <SourceBadge source={model.source} />
                </td>
                <td className={`py-2 px-2 text-right font-bold ${scoreTextColor(model.scorePct)}`}>
                  {model.scorePct.toFixed(1)}%
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {formatPct(model.behavioralScorePct)}
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {formatPct(model.browserScorePct)}
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {formatPct(model.hiddenTestPassRate)}
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {model.pointsPerToolCall === null ? "—" : model.pointsPerToolCall.toFixed(2)}
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {model.pointsAvg.toFixed(1)} / {model.maxAvg.toFixed(0)}
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {formatTps(model.completionTps, model.completionTpsApprox, 1)}
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {formatTps(model.promptTps, model.promptTpsApprox, 0)}
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {model.avgScenarioSeconds.toFixed(1)}s
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {formatWallTime(model.totalWallSeconds)}
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {formatSeconds(model.avgFirstTokenSeconds, 2)}
                </td>
                <td className="py-2 px-2 text-right text-text-main">{model.toolCallsTotal}</td>
                <td className="py-2 px-2 text-right text-text-main">{model.requests}</td>
                <td className="py-2 px-2 text-right text-text-main">{model.runs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatPct(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(0)}%`;
}

export function RunStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    done: "border-green-main text-green-main",
    running: "border-gold text-gold animate-pulse",
    failed: "border-red-main text-red-main",
  };
  const color = colors[status] ?? "border-border-main text-text-dim";
  return (
    <span className={`px-2 py-0.5 text-[10px] uppercase border rounded-sm ${color}`}>{status}</span>
  );
}
