import type { RunSummary } from "@/types";
import { formatDuration, formatRelative } from "@/lib/format";
import { scoreBarColor } from "@/lib/score-color";
import { SectionTitle } from "./SectionTitle";
import { RunStatusBadge } from "./Leaderboard";

export function RecentRunsTable({
  runs,
  onReplay,
}: {
  runs: RunSummary[];
  onReplay: (runId: string) => void;
}) {
  return (
    <section className="mt-8">
      <SectionTitle>Recent Runs</SectionTitle>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-border-main text-[10px] uppercase tracking-widest text-text-dim bg-border-main/50">
              <th className="text-left py-2 px-3">#</th>
              <th className="text-left py-2 px-3">Status</th>
              <th className="text-left py-2 px-3">Model</th>
              <th className="text-left py-2 px-3">Scenarios</th>
              <th className="text-left py-2 px-3">Score</th>
              <th className="text-left py-2 px-3">Time</th>
              <th className="text-left py-2 px-3">Started</th>
              <th className="text-left py-2 px-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, index) => (
              <tr
                key={run.id}
                className="border-b border-border-main hover:bg-prompt-bg transition-colors"
              >
                <td className="py-2.5 px-3 text-text-dim">{runs.length - index}</td>
                <td className="py-2.5 px-3">
                  <RunStatusBadge status={run.status} />
                </td>
                <td className="py-2.5 px-3 text-text-main max-w-[180px] truncate">
                  {run.model ?? <span className="text-text-dim">—</span>}
                </td>
                <td className="py-2.5 px-3 text-text-dim">{run.scenarioIds.length}</td>
                <td className="py-2.5 px-3">
                  <RunScore points={run.totalPoints} maxPoints={run.maxPoints} />
                </td>
                <td className="py-2.5 px-3 text-text-dim">
                  {formatDuration(run.startedAt, run.finishedAt)}
                </td>
                <td className="py-2.5 px-3 text-text-dim">{formatRelative(run.startedAt)}</td>
                <td className="py-2.5 px-3">
                  <button
                    type="button"
                    onClick={() => onReplay(run.id)}
                    className="text-gold hover:underline"
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RunScore({ points, maxPoints }: { points: number | null; maxPoints: number | null }) {
  if (points === null || maxPoints === null || maxPoints === 0)
    return <span className="text-text-dim">—</span>;
  const pct = Math.round((points / maxPoints) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-main font-bold">{points}</span>
      <span className="text-text-dim text-[11px]">/ {maxPoints}</span>
      <div className="w-16 h-1.5 bg-border-main rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${scoreBarColor(pct)}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-text-dim text-[11px]">{pct}%</span>
    </div>
  );
}
