import { ChevronDown, ChevronRight } from "lucide-react";

interface AdvancedOptionsPanelProps {
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
  timeoutSecs: number;
  onTimeoutChange: (value: number) => void;
  toolExecution: "sequential" | "parallel";
  onToolExecutionChange: (value: "sequential" | "parallel") => void;
  open: boolean;
  onToggle: () => void;
}

export function AdvancedOptionsPanel({
  systemPrompt,
  onSystemPromptChange,
  timeoutSecs,
  onTimeoutChange,
  toolExecution,
  onToolExecutionChange,
  open,
  onToggle,
}: AdvancedOptionsPanelProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-[11px] uppercase tracking-widest text-text-dim hover:text-text-main"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Advanced
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-3 border border-border-main p-3">
          <div>
            <label className="block text-[11px] text-text-dim mb-1">System Prompt Override</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              rows={4}
              placeholder="Leave empty to use default system prompt"
              className="w-full bg-content-bg border border-border-main text-text-main px-3 py-2 text-[12px] focus:outline-none focus:border-gold resize-none placeholder:text-text-dim"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[11px] text-text-dim mb-1">Timeout (seconds)</label>
              <input
                type="number"
                value={timeoutSecs}
                onChange={(e) => onTimeoutChange(Number(e.target.value))}
                min={30}
                max={3600}
                className="w-full bg-content-bg border border-border-main text-text-main px-3 py-2 text-[12px] focus:outline-none focus:border-gold"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] text-text-dim mb-1">Tool Execution</label>
              <select
                value={toolExecution}
                onChange={(e) => onToolExecutionChange(e.target.value as "sequential" | "parallel")}
                className="w-full bg-content-bg border border-border-main text-text-main px-3 py-2 text-[12px] focus:outline-none focus:border-gold"
              >
                <option value="sequential">Sequential</option>
                <option value="parallel">Parallel</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
