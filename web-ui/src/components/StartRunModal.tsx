import { useEffect, useRef, type MouseEvent } from "react";
import { X } from "lucide-react";
import { ScenarioPicker } from "@/components/start-run/ScenarioPicker";
import { ModelSelect } from "@/components/start-run/ModelSelect";
import { AdvancedOptionsPanel } from "@/components/start-run/AdvancedOptionsPanel";
import { useStartRunForm } from "@/hooks/useStartRunForm";

interface StartRunModalProps {
  onClose: () => void;
  onLaunch: (runId: string, scenarioIds: string[]) => void;
}

export function StartRunModal({ onClose, onLaunch }: StartRunModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const form = useStartRunForm({ onLaunch });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
    };
  }, [onClose]);

  const onDialogClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={onDialogClick}
      aria-labelledby="start-run-title"
      className="bg-bg-main border border-border-main w-full max-w-2xl max-h-[85vh] p-0 font-mono text-[13px] text-text-main backdrop:bg-black/70"
    >
      <form onSubmit={form.handleSubmit} className="flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center px-4 py-3 border-b border-border-main bg-border-main">
          <span id="start-run-title" className="text-gold font-bold uppercase tracking-wider text-[11px]">Start Run</span>
          <button type="button" onClick={onClose} className="text-text-dim hover:text-text-main">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
          {form.loading ? (
            <div className="text-text-dim text-center py-8">Loading…</div>
          ) : form.loadError ? (
            <div className="text-red-main text-center py-8">Failed to load scenarios or models</div>
          ) : (
            <>
              <ScenarioPicker
                scenariosByCategory={form.scenariosByCategory}
                selectedIds={form.selectedIds}
                onToggle={form.toggleScenario}
                onSelectAll={form.selectAll}
                onClearGroup={form.clearGroup}
              />
              <ModelSelect
                value={form.selectedModel}
                onChange={form.setSelectedModel}
                localModels={form.localModels}
                remoteModels={form.remoteModels}
              />
              <AdvancedOptionsPanel
                systemPrompt={form.systemPrompt}
                onSystemPromptChange={form.setSystemPrompt}
                timeoutSecs={form.timeoutSecs}
                onTimeoutChange={form.setTimeoutSecs}
                toolExecution={form.toolExecution}
                onToolExecutionChange={form.setToolExecution}
                open={form.showAdvanced}
                onToggle={() => form.setShowAdvanced(!form.showAdvanced)}
              />
            </>
          )}

          {form.error && (
            <div className="text-red-main text-[12px] border border-red-main px-3 py-2 bg-red-main/10">
              {form.error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-4 py-3 border-t border-border-main">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-[12px] border border-border-main text-text-dim hover:text-text-main"
          >
            Cancel
          </button>
          <button
            type="submit"
            autoFocus
            disabled={form.isPending || form.loading || form.selectedIds.size === 0}
            className="px-4 py-1.5 text-[12px] border border-gold text-gold hover:bg-gold-bg disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {form.isPending ? "Starting…" : "Start Run"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
