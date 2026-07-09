import type { Model } from "@/types";

interface OneshotControlsProps {
  promptCount: number;
  models: Model[];
  selectedModelId: string;
  running: boolean;
  stopping: boolean;
  onModelChange: (modelId: string) => void;
  onRunAll: () => void;
  onStop: () => void;
}

export function OneshotControls({
  promptCount,
  models,
  selectedModelId,
  running,
  stopping,
  onModelChange,
  onRunAll,
  onStop,
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
        {running ? (
          <button
            onClick={onStop}
            disabled={stopping}
            className="px-2 py-1 text-[11px] uppercase border border-red-main text-red-main rounded-sm hover:bg-red-main/10 disabled:opacity-40"
          >
            {stopping ? "Stopping…" : "Stop Run"}
          </button>
        ) : (
          <button
            onClick={onRunAll}
            disabled={!canRun || !hasModels}
            className="px-2 py-1 text-[11px] uppercase border border-border-main rounded-sm hover:border-gold hover:text-gold disabled:opacity-40"
          >
            Run All ({promptCount})
          </button>
        )}
      </div>
    </div>
  );
}
