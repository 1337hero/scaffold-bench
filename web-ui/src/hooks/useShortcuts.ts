import { useEffect, useRef } from "react";

export function useShortcuts(
  bindings: Record<string, (e: KeyboardEvent) => void>,
  opts?: { enabled?: boolean }
): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const enabled = opts?.enabled !== false;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const current = bindingsRef.current;
      const isSingleLetter = e.key.length === 1 && /[a-zA-Z]/.test(e.key);
      if (isSingleLetter) {
        const lower = e.key.toLowerCase();
        const upper = e.key.toUpperCase();
        const binding = current[lower] ?? current[upper] ?? current[e.key];
        if (binding) binding(e);
        return;
      }

      const binding = current[e.key];
      if (binding) binding(e);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}
