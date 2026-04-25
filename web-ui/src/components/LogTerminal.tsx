import { useEffect, useRef } from "react";
import type { ScenarioState, LogEntry } from "@/types";
import { formatElapsed, formatNowHHMMSS } from "@/lib/format";
import { Panel } from "./Panel";

interface LogTerminalProps {
  scenario?: ScenarioState;
  isLive: boolean;
}

const LABEL_STYLES: Record<string, { label: string; text: string }> = {
  assistant: { label: "text-gold-dim", text: "text-[#A0AEC0] whitespace-pre-wrap" },
  cmd: { label: "text-blue-main", text: "text-blue-main font-bold whitespace-pre-wrap" },
  edit: { label: "text-blue-main opacity-70", text: "text-[#A0AEC0] whitespace-pre-wrap" },
  tool: { label: "text-blue-main", text: "text-text-main whitespace-pre-wrap" },
  stdout: { label: "text-green-main", text: "text-green-main whitespace-pre-wrap" },
  stderr: {
    label: "text-red-main",
    text: "text-red-main bg-red-main/10 px-1 rounded-sm whitespace-pre-wrap",
  },
  system: { label: "text-text-dim", text: "text-text-dim whitespace-pre-wrap" },
};
const FALLBACK = { label: "text-text-dim", text: "text-text-main whitespace-pre-wrap" };

function LogLine({ entry }: { entry: LogEntry }) {
  const style = LABEL_STYLES[entry.label] ?? FALLBACK;
  return (
    <div className="flex gap-2 mb-1 break-words min-w-0">
      <span className="text-text-dim w-[60px] flex-shrink-0 text-[11px]">[{entry.time}]</span>
      <span className={`w-[72px] flex-shrink-0 text-right pr-2 text-[11px] ${style.label}`}>
        {entry.label}
      </span>
      <span className={`flex-1 min-w-0 break-words ${style.text}`}>{entry.text}</span>
    </div>
  );
}

export function LogTerminal({ scenario, isLive }: LogTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isUserScrolledUp.current && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [scenario?.logs.length, scenario?.streamBuffer]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    isUserScrolledUp.current = !atBottom;
  };

  const title = scenario
    ? scenario.name && scenario.name !== scenario.id
      ? `${scenario.id} / ${scenario.name}`
      : scenario.id
    : "Agent Log";

  const statusTag = scenario?.status === "running" ? "RUNNING" : scenario?.status?.toUpperCase();

  const elapsed = scenario?.startedAt
    ? (scenario.finishedAt ?? Date.now()) - scenario.startedAt
    : 0;

  return (
    <Panel title={title} className="h-full">
      {scenario ? (
        <div className="flex flex-col h-full bg-content-bg overflow-hidden">
          {/* Sub-header */}
          <div className="flex-none px-4 py-2 border-b border-border-main flex justify-between items-center text-[11px]">
            <div className="flex gap-3 items-center">
              <span className="text-text-dim">{scenario.category}</span>
              {scenario.status === "running" && (
                <span className="text-gold uppercase">● RUNNING</span>
              )}
              {scenario.status !== "running" && statusTag && (
                <span
                  className={`uppercase ${
                    scenario.status === "pass"
                      ? "text-green-main"
                      : scenario.status === "fail" || scenario.status === "stopped"
                        ? "text-red-main"
                        : scenario.status === "partial"
                          ? "text-gold"
                          : "text-text-dim"
                  }`}
                >
                  {statusTag}
                </span>
              )}
            </div>
            <div className="flex gap-3 text-text-dim">
              {scenario.toolCallCount !== undefined && <span>tools {scenario.toolCallCount}</span>}
              {elapsed > 0 && <span>elapsed {formatElapsed(elapsed)}</span>}
            </div>
          </div>

          {/* Log body */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 text-[12px] font-mono"
          >
            {scenario.logs.map((entry) => (
              <LogLine key={entry.id} entry={entry} />
            ))}

            {/* Stream buffer / live cursor */}
            {isLive && scenario.streamBuffer && (
              <div className="flex gap-2 mb-1 min-w-0">
                <span className="text-text-dim w-[60px] flex-shrink-0 text-[11px]">
                  [{formatNowHHMMSS()}]
                </span>
                <span className="w-[72px] flex-shrink-0 text-right pr-2 text-[11px] text-gold-dim">
                  assistant
                </span>
                <span className="flex-1 min-w-0 text-[#A0AEC0] whitespace-pre-wrap break-words">
                  {scenario.streamBuffer}
                  <span className="inline-block w-[7px] h-[13px] bg-gold animate-pulse translate-y-0.5 ml-0.5" />
                </span>
              </div>
            )}

            {/* Blinking cursor when live but buffer empty */}
            {isLive && !scenario.streamBuffer && (
              <div className="flex gap-2 mt-2">
                <span className="text-text-dim w-[60px] flex-shrink-0 text-[11px]">
                  [{formatNowHHMMSS()}]
                </span>
                <span className="w-[72px] flex-shrink-0 text-right pr-2 text-[11px] text-gold-dim">
                  assistant
                </span>
                <span className="flex-1">
                  <span className="inline-block w-[7px] h-[13px] bg-gold-dim animate-pulse translate-y-0.5" />
                </span>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-dim text-[13px] bg-content-bg">
          waiting for a scenario to start…
        </div>
      )}
    </Panel>
  );
}
