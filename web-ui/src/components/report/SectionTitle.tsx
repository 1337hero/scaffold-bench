export function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] uppercase tracking-[0.18em] text-text-dim border-b border-border-main pb-2 mb-3">
      {children}
    </h2>
  );
}
