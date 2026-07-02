import { useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "scaffold-bench-theme";

// Apply persisted theme at import time, before first paint. Light is default.
// (localStorage is absent in the bun test environment.)
if (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "dark") {
  document.documentElement.classList.add("dark");
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    setIsDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider border border-border-main bg-content-bg text-text-dim hover:border-gold hover:text-gold transition-colors rounded-sm"
    >
      {isDark ? <Sun size={12} /> : <Moon size={12} />}
    </button>
  );
}
