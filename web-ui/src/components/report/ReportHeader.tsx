import type { ReportData, ReportSource, ReportSourceFilter } from "@/types";
import { ArrowLeft, RefreshCw, Terminal } from "lucide-react";

export function SourceBadge({ source }: { source: ReportSource }) {
  const color =
    source === "api"
      ? "text-purple-300 border-purple-400/40 bg-purple-400/10"
      : "text-green-main border-green-main/40 bg-green-main/10";
  return (
    <span
      className={`inline-block rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${color}`}
    >
      {source}
    </span>
  );
}

export function ReportHeader({
  totals,
  snapshot,
  isRefreshing,
  onBack,
  onRefresh,
  sourceFilter,
  onSourceFilterChange,
  backHref,
}: {
  totals: ReportData["totals"];
  snapshot: string;
  isRefreshing: boolean;
  onBack: () => void;
  onRefresh: () => void;
  sourceFilter: ReportSourceFilter;
  onSourceFilterChange: (filter: ReportSourceFilter) => void;
  backHref: string;
}) {
  return (
    <header className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-4 pb-4 border-b border-border-main bg-bg-main">
      <div className="flex gap-3 items-center">
        <div className="text-gold">
          <Terminal size={28} strokeWidth={1.5} />
        </div>
        <div className="flex flex-col">
          <h1 className="text-lg font-bold tracking-tight text-text-main leading-none">
            SCAFFOLD<span className="text-gold">BENCH</span>
          </h1>
          <p className="text-[10px] text-text-dim uppercase tracking-widest mt-0.5">
            LLM COMPARISON REPORTS [v{__APP_VERSION__}]
          </p>
          <p className="text-[10px] text-text-dim mt-1">
            {totals.models} models · {totals.runs} runs · {totals.local} local · {totals.api} api ·{" "}
            {totals.scenarioRuns} scenario runs
          </p>
        </div>
      </div>

      <div className="flex gap-5 items-center">
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-text-dim uppercase tracking-widest">Snapshot</span>
          <span className="text-[13px] font-bold text-text-main leading-tight">{snapshot}</span>
        </div>

        <div className="w-px h-8 bg-border-main" />

        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 text-[10px] uppercase border border-blue-main text-blue-main rounded-sm">
            REPORTS
          </span>
          <SourceFilter value={sourceFilter} onChange={onSourceFilterChange} />
        </div>

        <div className="w-px h-8 bg-border-main" />

        <div className="flex gap-2">
          <a
            href={backHref}
            onClick={(e) => {
              e.preventDefault();
              onBack();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider border border-border-main bg-content-bg text-text-dim hover:border-blue-main hover:text-blue-main transition-colors rounded-sm"
          >
            <ArrowLeft size={12} />
            Dashboard
          </a>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider border border-border-main bg-content-bg text-text-dim hover:border-gold hover:text-gold transition-colors rounded-sm"
          >
            <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}

export function SourceFilter({
  value,
  onChange,
}: {
  value: ReportSourceFilter;
  onChange: (value: ReportSourceFilter) => void;
}) {
  const filters: ReportSourceFilter[] = ["all", "local", "api"];
  return (
    <div className="inline-flex gap-2">
      {filters.map((filter) => (
        <button
          key={filter}
          type="button"
          onClick={() => onChange(filter)}
          className={`border rounded-sm px-3 py-1 text-[10px] uppercase tracking-widest ${
            value === filter
              ? "border-gold text-text-main bg-border-main"
              : "border-border-main text-text-dim hover:text-text-main"
          }`}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}
