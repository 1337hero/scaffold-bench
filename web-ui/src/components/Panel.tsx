import React from "react";

interface PanelProps {
  title: string;
  rightTag?: string;
  className?: string;
  children: React.ReactNode;
}

export function Panel({ title, rightTag, className = "", children }: PanelProps) {
  return (
    <div className={`flex flex-col border border-border-main bg-bg-main ${className}`}>
      <div className="flex justify-between items-center px-3 py-1.5 bg-border-main text-[11px] uppercase tracking-wider border-b border-border-main">
        <span className="text-gold font-bold">{title}</span>
        {rightTag && <span className="text-text-dim">{rightTag}</span>}
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}
