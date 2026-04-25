import type { Model } from "@/types";

type PromptMeta = { id: string; title: string; category: string };

interface OneshotControlsProps {
  prompts: PromptMeta[];
  models: Model[];
  selectedModelId: string;
  running: boolean;
  focusedPromptId: string | null;
  onModelChange: (modelId: string) => void;
  onStartAll: () => void;
  onRerunAll: () => void;
  onRerunSingle: (promptId: string) => void;
}

export function OneshotControls({
  prompts,
  models,
  selectedModelId,
  running,
  focusedPromptId,
  onModelChange,
  onStartAll,
  onRerunAll,
  onRerunSingle,
}: OneshotControlsProps) {
  const canRun = !running && selectedModelId.length > 0;
  const hasModels = models.length > 0;

  return (
    <div className="p-2 space-y-2 border-b border-border-main">
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] text-text-dim uppercase">Model</div>
          {running ? <div className="text-[10px] text-gold uppercase">Running…</div> : null}
        </div>
        <select
          value={selectedModelId}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={!hasModels || running}
          className="w-full bg-content-bg border border-border-main rounded-sm px-2 py-1 text-xs disabled:opacity-50"
        >
          <option value="">{hasModels ? "Select model" : "No models available"}</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.id}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-1">
        <button
          onClick={onStartAll}
          disabled={!canRun || !hasModels}
          className="px-2 py-1 text-[11px] uppercase border border-border-main rounded-sm hover:border-gold hover:text-gold disabled:opacity-40"
        >
          {running ? "Run in progress" : `Start One-Shot Run (${prompts.length})`}
        </button>
        <button
          onClick={onRerunAll}
          disabled={!canRun || !hasModels}
          className="px-2 py-1 text-[11px] uppercase border border-border-main rounded-sm hover:border-blue-main hover:text-blue-main disabled:opacity-40"
        >
          Rerun All
        </button>
        <button
          onClick={() => focusedPromptId && onRerunSingle(focusedPromptId)}
          disabled={!canRun || !hasModels || !focusedPromptId}
          className="px-2 py-1 text-[11px] uppercase border border-border-main rounded-sm hover:border-blue-main hover:text-blue-main disabled:opacity-40"
        >
          Rerun Single
        </button>
      </div>
    </div>
  );
}
