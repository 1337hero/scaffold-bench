type PromptMeta = { id: string; title: string; category: string };

type PromptStatus = "pending" | "running" | "done" | "failed";

type PromptRow = {
  id: string;
  status: PromptStatus;
};

const STATUS_COLORS: Record<PromptStatus, string> = {
  pending: "text-text-dim border-border-main",
  running: "text-gold border-gold",
  done: "text-green-main border-green-main",
  failed: "text-red-main border-red-main",
};

interface OneshotQueueProps {
  prompts: PromptMeta[];
  rows: Record<string, PromptRow>;
  focusedPromptId: string | null;
  onFocus: (promptId: string) => void;
}

export function OneshotQueue({ prompts, rows, focusedPromptId, onFocus }: OneshotQueueProps) {
  if (prompts.length === 0) {
    return <div className="p-3 text-xs text-text-dim">No prompts loaded yet.</div>;
  }

  return (
    <div className="h-full overflow-auto p-2 space-y-1">
      {prompts.map((prompt) => {
        const row = rows[prompt.id];
        const status = row?.status ?? "pending";
        return (
          <button
            key={prompt.id}
            onClick={() => onFocus(prompt.id)}
            className={`w-full text-left p-2 border rounded-sm transition-colors ${
              focusedPromptId === prompt.id
                ? "border-gold bg-gold-dim/20"
                : "border-border-main hover:border-text-dim"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-text-main truncate">{prompt.title}</div>
              <StatusPill status={status} />
            </div>
            <div className="text-[10px] text-text-dim mt-1">{prompt.category}</div>
          </button>
        );
      })}
    </div>
  );
}

function StatusPill({ status }: { status: PromptStatus }) {
  return (
    <span
      className={`text-[10px] px-2 py-0.5 border rounded-sm uppercase ${STATUS_COLORS[status]}`}
    >
      {status}
    </span>
  );
}
