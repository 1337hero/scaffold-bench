import { Terminal, Play, Square, History } from "lucide-react";
import type { RunStatus } from "@/types";
import { formatElapsed } from "@/lib/format";

interface HeaderProps {
  totalPoints: number;
  maxPoints: number;
  elapsed: number;
  status: RunStatus;
  onStart: () => void;
  onStop: () => void;
  onHistory: () => void;
}

export function Header({ totalPoints, maxPoints, elapsed, status, onStart, onStop, onHistory }: HeaderProps) {
  const isRunning = status === "running";
  const canStart = !isRunning;

  const statusBadge = () => {
    if (status === "running") return <span className="px-2 py-0.5 text-[10px] uppercase border border-gold text-gold animate-pulse rounded-sm">RUNNING</span>;
    if (status === "done") return <span className="px-2 py-0.5 text-[10px] uppercase border border-green-main text-green-main rounded-sm">DONE</span>;
    if (status === "stopped") return <span className="px-2 py-0.5 text-[10px] uppercase border border-red-main text-red-main rounded-sm">STOPPED</span>;
    if (status === "failed") return <span className="px-2 py-0.5 text-[10px] uppercase border border-red-main text-red-main rounded-sm">FAILED</span>;
    return <span className="px-2 py-0.5 text-[10px] uppercase border border-border-main text-text-dim rounded-sm">IDLE</span>;
  };

  return (
    <header className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-4 pb-4 border-b border-border-main flex-none">
      <div className="flex gap-3 items-center">
        <div className="text-gold">
          <Terminal size={28} strokeWidth={1.5} />
        </div>
        <div className="flex flex-col">
          <h1 className="text-lg font-bold tracking-tight text-text-main leading-none">
            SCAFFOLD<span className="text-gold">BENCH</span>
          </h1>
          <p className="text-[10px] text-text-dim uppercase tracking-widest mt-0.5">AGENT PERFORMANCE TRACKER [v{__APP_VERSION__}]</p>
        </div>
      </div>

      <div className="flex gap-5 items-center">
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-text-dim uppercase tracking-widest">Score</span>
          <span className="text-[17px] font-bold text-green-main leading-tight">
            {totalPoints} <span className="text-text-dim text-sm font-normal">/ {maxPoints} pts</span>
          </span>
        </div>

        <div className="w-px h-8 bg-border-main" />

        <div className="flex flex-col items-end">
          <span className="text-[10px] text-text-dim uppercase tracking-widest">Elapsed</span>
          <span className="text-[17px] font-bold text-text-main leading-tight">{formatElapsed(elapsed)}</span>
        </div>

        <div className="w-px h-8 bg-border-main" />

        {statusBadge()}

        <div className="w-px h-8 bg-border-main" />

        <div className="flex gap-2">
          <button
            onClick={onStart}
            disabled={!canStart}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider border border-border-main bg-content-bg text-text-dim hover:border-gold hover:text-gold disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-sm"
          >
            <Play size={12} />
            Start
          </button>
          <button
            onClick={onStop}
            disabled={!isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider border border-border-main bg-content-bg text-text-dim hover:border-red-main hover:text-red-main disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-sm"
          >
            <Square size={12} />
            Stop
          </button>
          <button
            onClick={onHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider border border-border-main bg-content-bg text-text-dim hover:border-blue-main hover:text-blue-main transition-colors rounded-sm"
          >
            <History size={12} />
            History
          </button>
        </div>
      </div>
    </header>
  );
}
