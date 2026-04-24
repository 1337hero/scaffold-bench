import type { ScenarioInfo } from "@/types";

interface ScenarioPickerProps {
  scenariosByCategory: Record<string, ScenarioInfo[]>;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearGroup: (ids: string[]) => void;
}

export function ScenarioPicker({
  scenariosByCategory,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearGroup,
}: ScenarioPickerProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] uppercase tracking-widest text-text-dim">Scenarios</span>
        <span className="text-[11px] text-gold">{selectedIds.size} selected</span>
      </div>
      <div className="border border-border-main divide-y divide-border-main">
        {Object.entries(scenariosByCategory).map(([category, scenarios]) => {
          const ids = scenarios.map((scenario) => scenario.id);
          return (
            <div key={category}>
              <div className="flex items-center justify-between px-3 py-1.5 bg-border-main/40">
                <span className="text-[10px] uppercase tracking-widest text-text-dim">{category}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectAll(ids)}
                    className="text-[10px] text-text-dim hover:text-gold"
                  >
                    all
                  </button>
                  <button
                    type="button"
                    onClick={() => onClearGroup(ids)}
                    className="text-[10px] text-text-dim hover:text-red-main"
                  >
                    clear
                  </button>
                </div>
              </div>
              {scenarios.map((scenario) => (
                <label
                  key={scenario.id}
                  className="flex items-center gap-3 px-3 py-1.5 cursor-pointer hover:bg-prompt-bg"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(scenario.id)}
                    onChange={() => onToggle(scenario.id)}
                    className="accent-gold"
                  />
                  <span className="text-text-dim w-16 flex-shrink-0">{scenario.id}</span>
                  <span className="text-text-main">{scenario.name}</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
