import { Play } from "lucide-react";
import type { OneshotPromptState, OneshotPromptStatus } from "@/hooks/oneshot-state-reducer";

type PromptMeta = { id: string; title: string; category: string };

const STATUS_COLORS: Record<OneshotPromptStatus, string> = {
  pending: "text-text-dim border-border-main",
  running: "text-gold border-gold",
  done: "text-green-main border-green-main",
  failed: "text-red-main border-red-main",
  stopped: "text-text-dim border-border-main",
};

interface OneshotQueueProps {
  prompts: PromptMeta[];
  rows: Record<string, OneshotPromptState>;
  focusedPromptId: string | null;
  canRun: boolean;
  onFocus: (promptId: string) => void;
  onRunSingle: (promptId: string) => void;
}

export function OneshotQueue({
  prompts,
  rows,
  focusedPromptId,
  canRun,
  onFocus,
  onRunSingle,
}: OneshotQueueProps) {
  if (prompts.length === 0) {
    return <div className="p-3 text-xs text-text-dim">No prompts loaded yet.</div>;
  }

  return (
    <div className="h-full overflow-auto p-2 space-y-1">
      {prompts.map((prompt) => {
        const row = rows[prompt.id];
        const status = row?.status ?? "pending";
        return (
          <div
            key={prompt.id}
            onClick={() => onFocus(prompt.id)}
            className={`w-full cursor-pointer p-2 border rounded-sm transition-colors ${
              focusedPromptId === prompt.id
                ? "border-gold bg-gold-dim/20"
                : "border-border-main hover:border-text-dim"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-text-main truncate">{prompt.title}</div>
              <div className="flex items-center gap-1.5 flex-none">
                <StatusPill status={status} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRunSingle(prompt.id);
                  }}
                  disabled={!canRun}
                  title={`Run ${prompt.title}`}
                  className="p-1 border border-border-main rounded-sm text-text-dim hover:border-gold hover:text-gold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play size={10} />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
              <div className="text-[10px] text-text-dim">{prompt.category}</div>
              {row?.model ? (
                <div className="text-[10px] text-text-dim truncate" title={row.model}>
                  {row.model}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: OneshotPromptStatus }) {
  return (
    <span
      className={`text-[10px] px-2 py-0.5 border rounded-sm uppercase ${STATUS_COLORS[status]}`}
    >
      {status}
    </span>
  );
}
