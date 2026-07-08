import { useState } from "react";
import type { RunSummary } from "@/types";
import { formatDuration, formatRelative } from "@/lib/format";
import { scoreBarColor } from "@/lib/score-color";
import { SectionTitle } from "./SectionTitle";
import { RunStatusBadge } from "./Leaderboard";

type SortKey = "scenarios" | "score" | "time" | "started";
type SortDir = "asc" | "desc";

const SORTABLE_COLUMNS: Record<SortKey, { label: string; align: string }> = {
  scenarios: { label: "Scenarios", align: "text-left" },
  score: { label: "Score", align: "text-left" },
  time: { label: "Time", align: "text-left" },
  started: { label: "Started", align: "text-left" },
};

function compareRuns(key: SortKey, a: RunSummary, b: RunSummary): number {
  switch (key) {
    case "scenarios":
      return a.scenarioIds.length - b.scenarioIds.length;
    case "score": {
      const aPct =
        a.totalPoints !== null && a.maxPoints !== null && a.maxPoints > 0
          ? a.totalPoints / a.maxPoints
          : -1;
      const bPct =
        b.totalPoints !== null && b.maxPoints !== null && b.maxPoints > 0
          ? b.totalPoints / b.maxPoints
          : -1;
      return aPct - bPct;
    }
    case "time": {
      const aDur = a.finishedAt ? a.finishedAt - a.startedAt : 0;
      const bDur = b.finishedAt ? b.finishedAt - b.startedAt : 0;
      return aDur - bDur;
    }
    case "started":
      return a.startedAt - b.startedAt;
  }
}

export function RecentRunsTable({ runs }: { runs: RunSummary[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("started");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...runs].sort((a, b) => {
    const cmp = compareRuns(sortKey, a, b);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const arrow = (key: SortKey) => {
    if (key !== sortKey) return null;
    return <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

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
              {Object.entries(SORTABLE_COLUMNS).map(([key, col]) => (
                <th key={key} className={`${col.align} py-2 px-3 cursor-pointer select-none hover:text-text-main transition-colors`} onClick={() => handleSort(key as SortKey)}>
                  {col.label}
                  {arrow(key as SortKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((run, index) => (
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
