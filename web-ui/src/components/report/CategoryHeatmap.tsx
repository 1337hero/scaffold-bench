import type { ReportModelAggregate } from "@/types";
import { SectionTitle } from "./SectionTitle";
import { SourceBadge } from "./ReportHeader";

export function CategoryHeatmap({
  models,
  categories,
}: {
  models: ReportModelAggregate[];
  categories: string[];
}) {
  return (
    <section className="mt-8">
      <SectionTitle>Category heatmap (%)</SectionTitle>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-border-main/50 text-text-dim uppercase tracking-widest">
              <th className="text-left border border-border-main py-2 px-2">Model</th>
              <th className="text-left border border-border-main py-2 px-2">Src</th>
              {categories.map((category) => (
                <th key={category} className="border border-border-main py-2 px-2">
                  {category}
                </th>
              ))}
              <th className="border border-border-main py-2 px-2">Overall</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.model}>
                <td className="border border-border-main py-1.5 px-2 text-text-main font-bold whitespace-nowrap">
                  {model.model}
                </td>
                <td className="border border-border-main py-1.5 px-2">
                  <SourceBadge source={model.source} />
                </td>
                {categories.map((category) => (
                  <HeatCell key={category} pct={model.categories[category]?.pct ?? null} />
                ))}
                <HeatCell pct={model.scorePct} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HeatCell({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <td className="border border-border-main py-1.5 px-2 text-center bg-border-main text-text-dim">
        —
      </td>
    );
  }
  return (
    <td
      className="border border-border-main py-1.5 px-2 text-center text-bg-main font-bold"
      style={{ background: `hsl(${pct * 1.2}, 60%, 55%)` }}
    >
      {pct.toFixed(0)}
    </td>
  );
}
