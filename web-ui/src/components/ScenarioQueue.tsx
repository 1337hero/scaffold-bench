import type { ScenarioState, ScenarioStatus } from "@/types";
import { formatElapsed } from "@/lib/format";
import { TuiBox } from "./TuiBox";

interface ScenarioQueueProps {
  scenarios: ScenarioState[];
  focusedId: string | null;
  onFocus: (id: string) => void;
}

function StatusIcon({ status }: { status: ScenarioStatus }) {
  if (status === "running") return <span className="text-gold animate-pulse">▶</span>;
  if (status === "pending") return <span className="text-text-dim">·</span>;
  if (status === "pass") return <span className="text-green-main">✓</span>;
  if (status === "partial") return <span className="text-gold">◐</span>;
  if (status === "fail") return <span className="text-red-main">✗</span>;
  if (status === "stopped") return <span className="text-text-dim">✗</span>;
  return <span className="text-text-dim">·</span>;
}

function elapsedMs(s: ScenarioState): number {
  if (!s.startedAt) return 0;
  return (s.finishedAt ?? Date.now()) - s.startedAt;
}

export function ScenarioQueue({ scenarios, focusedId, onFocus }: ScenarioQueueProps) {
  const completed = scenarios.filter(
    (s) => s.status !== "pending" && s.status !== "running"
  ).length;

  return (
    <TuiBox
      title="Queue"
      rightTag={`${completed} / ${scenarios.length}`}
      className="h-full"
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {scenarios.length === 0 ? (
          <div className="p-4 text-text-dim text-[12px] text-center">No scenarios</div>
        ) : (
          scenarios.map((s) => {
            const isRunning = s.status === "running";
            const isFocused = s.id === focusedId;
            const elapsed = elapsedMs(s);

            return (
              <button
                key={s.id}
                onClick={() => onFocus(s.id)}
                className={[
                  "w-full text-left flex flex-col px-3 py-2 border-b border-border-main relative",
                  "border-l-[3px] transition-colors",
                  isRunning
                    ? "bg-gold-bg border-l-gold"
                    : isFocused
                    ? "border-l-blue-main bg-prompt-bg"
                    : "border-l-transparent hover:bg-prompt-bg",
                ].join(" ")}
              >
                {/* Line 1: icon + id + name */}
                <div className="flex items-center gap-2 text-[12px] leading-tight">
                  <span className="w-3 text-center flex-shrink-0 text-[13px]">
                    <StatusIcon status={s.status} />
                  </span>
                  <span className={`font-bold flex-shrink-0 ${isRunning ? "text-gold" : "text-text-dim"}`}>
                    {s.id}
                  </span>
                  <span className="text-text-main truncate">{s.name}</span>
                  {isRunning && (
                    <span className="ml-auto flex-shrink-0 w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                  )}
                </div>
                {/* Line 2: category badge + points + elapsed */}
                <div className="flex items-center gap-2 mt-1 text-[11px] text-text-dim pl-5">
                  {s.category && (
                    <span className="border border-border-main rounded-sm px-1 text-[9px] uppercase text-text-dim">
                      {s.category}
                    </span>
                  )}
                  <span>
                    {s.points !== undefined ? `${s.points}` : "0"}
                    <span className="text-text-dim">/{s.maxPoints}pt</span>
                  </span>
                  {elapsed > 0 ? (
                    <span>{formatElapsed(elapsed)}</span>
                  ) : (
                    <span>--:--</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </TuiBox>
  );
}
