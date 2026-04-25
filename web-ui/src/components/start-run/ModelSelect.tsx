import type { Model } from "@/types";

interface ModelSelectProps {
  value: string;
  onChange: (id: string) => void;
  localModels: Model[];
  remoteModels: Model[];
}

export function ModelSelect({ value, onChange, localModels, remoteModels }: ModelSelectProps) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-widest text-text-dim mb-1">
        Model
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-content-bg border border-border-main text-text-main px-3 py-2 text-[12px] focus:outline-none focus:border-gold"
      >
        {localModels.length > 0 && (
          <optgroup label="Local">
            {localModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </optgroup>
        )}
        {remoteModels.length > 0 && (
          <optgroup label="Remote">
            {remoteModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} (remote)
              </option>
            ))}
          </optgroup>
        )}
        {localModels.length === 0 && remoteModels.length === 0 && (
          <option value="">No models available</option>
        )}
      </select>
    </div>
  );
}
