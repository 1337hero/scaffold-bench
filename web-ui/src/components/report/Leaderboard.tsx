import { useState } from "react";
import type { ReportModelAggregate } from "@/types";
import { formatSeconds, formatTps, formatTokenCount, formatWallTime } from "@/lib/format";
import { scoreTextColor } from "@/lib/score-color";
import { SectionTitle } from "./SectionTitle";
import { SourceBadge } from "./ReportHeader";

type SortKey =
  | "solve"
  | "ptsPerRun"
  | "genTps"
  | "promptTps"
  | "scenAvg"
  | "tokens"
  | "totalWall"
  | "ttft"
  | "tools"
  | "requests"
  | "timeouts"
  | "runs";

type SortDir = "asc" | "desc";

const COLUMNS: Record<SortKey, { label: string; align: string }> = {
  solve: { label: "Score", align: "text-right" },
  ptsPerRun: { label: "Pts/run", align: "text-right" },
  genTps: { label: "Gen TPS", align: "text-right" },
  promptTps: { label: "Prompt TPS", align: "text-right" },
  scenAvg: { label: "Scen Avg", align: "text-right" },
  tokens: { label: "Tokens/scen", align: "text-right" },
  totalWall: { label: "Total Wall", align: "text-right" },
  ttft: { label: "TTFT", align: "text-right" },
  tools: { label: "Tools", align: "text-right" },
  requests: { label: "Requests", align: "text-right" },
  timeouts: { label: "T/O", align: "text-right" },
  runs: { label: "Runs", align: "text-right" },
};

function compareModels(key: SortKey, a: ReportModelAggregate, b: ReportModelAggregate): number {
  const nullSort = (v: number | null): [boolean, number] =>
    v === null || v === undefined ? [true, 0] : [false, v];

  switch (key) {
    case "solve": {
      return a.solveRatePct - b.solveRatePct;
    }
    case "ptsPerRun": {
      return a.pointsAvg - b.pointsAvg;
    }
    case "genTps": {
      const [aNull, aVal] = nullSort(a.completionTps);
      const [bNull, bVal] = nullSort(b.completionTps);
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      return aVal - bVal;
    }
    case "promptTps": {
      const [aNull, aVal] = nullSort(a.promptTps);
      const [bNull, bVal] = nullSort(b.promptTps);
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      return aVal - bVal;
    }
    case "scenAvg": {
      return a.avgScenarioSeconds - b.avgScenarioSeconds;
    }
    case "tokens": {
      return a.avgTokensPerScenario - b.avgTokensPerScenario;
    }
    case "totalWall": {
      return a.totalWallSeconds - b.totalWallSeconds;
    }
    case "ttft": {
      const [aNull, aVal] = nullSort(a.avgFirstTokenSeconds);
      const [bNull, bVal] = nullSort(b.avgFirstTokenSeconds);
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      return aVal - bVal;
    }
    case "tools": {
      return a.toolCallsTotal - b.toolCallsTotal;
    }
    case "requests": {
      return a.requests - b.requests;
    }
    case "timeouts": {
      return a.timeouts - b.timeouts;
    }
    case "runs": {
      return a.runs - b.runs;
    }
  }
}

export function Leaderboard({ models }: { models: ReportModelAggregate[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("solve");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...models].sort((a, b) => {
    const cmp = compareModels(sortKey, a, b);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const arrow = (key: SortKey) => {
    if (key !== sortKey) return null;
    return <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>;
  };

  const sortableTh = (key: SortKey) => {
    const col = COLUMNS[key];
    return (
      <th
        key={key}
        className={`${col.align} py-2 px-2 cursor-pointer select-none hover:text-text-main transition-colors`}
        onClick={() => handleSort(key)}
      >
        {col.label}
        {arrow(key)}
      </th>
    );
  };

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
              {sortableTh("solve")}
              {sortableTh("ptsPerRun")}
              {sortableTh("genTps")}
              {sortableTh("promptTps")}
              {sortableTh("scenAvg")}
              {sortableTh("tokens")}
              {sortableTh("totalWall")}
              {sortableTh("ttft")}
              {sortableTh("tools")}
              {sortableTh("requests")}
              {sortableTh("timeouts")}
              {sortableTh("runs")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((model, index) => (
              <tr key={model.model} className="border-b border-border-main hover:bg-prompt-bg">
                <td className="py-2 px-2 text-text-main">{index + 1}</td>
                <td className="py-2 px-2 text-text-main font-bold max-w-[260px] truncate">
                  {model.model}
                </td>
                <td className="py-2 px-2">
                  <SourceBadge source={model.source} />
                </td>
                <td
                  className={`py-2 px-2 text-right font-bold ${scoreTextColor(model.solveRatePct)}`}
                >
                  {model.solveRatePct.toFixed(1)}%
                  <span className="ml-1 font-normal text-[10px] text-text-dim">
                    ±{((model.solveCiHighPct - model.solveCiLowPct) / 2).toFixed(1)}
                  </span>
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
                <td className="py-2 px-2 text-right text-text-main tabular-nums">
                  {model.avgTokensPerScenario > 0
                    ? formatTokenCount(model.avgTokensPerScenario)
                    : "—"}
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {formatWallTime(model.totalWallSeconds)}
                </td>
                <td className="py-2 px-2 text-right text-text-main">
                  {formatSeconds(model.avgFirstTokenSeconds, 2)}
                </td>
                <td className="py-2 px-2 text-right text-text-main">{model.toolCallsTotal}</td>
                <td className="py-2 px-2 text-right text-text-main">{model.requests}</td>
                <td
                  className={`py-2 px-2 text-right ${model.timeouts > 0 ? "text-red-main font-bold" : "text-text-dim"}`}
                >
                  {model.timeouts}
                </td>
                <td className="py-2 px-2 text-right text-text-main">{model.runs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
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
