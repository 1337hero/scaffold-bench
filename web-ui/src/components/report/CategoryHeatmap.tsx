import type { ReportModelAggregate, ReportCategoryScore } from "@/types";
import { SectionTitle } from "./SectionTitle";
import { SourceBadge } from "./ReportHeader";

/**
 * Presentational heatmap: one row per model, one column per score dimension.
 * Generalized from the category heatmap so the difficulty tier grid reuses the
 * same layout. `scoreFor` returns the per-model record (categories or tiers);
 * missing cells render as "—".
 */
export function CategoryHeatmap({
  models,
  columns,
  scoreFor,
  title,
}: {
  models: ReportModelAggregate[];
  columns: string[];
  scoreFor: (model: ReportModelAggregate) => Record<string, ReportCategoryScore> | undefined;
  title: string;
}) {
  return (
    <section className="mt-8">
      <SectionTitle>{title}</SectionTitle>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-border-main/50 text-text-dim uppercase tracking-widest">
              <th className="text-left border border-border-main py-2 px-2">Model</th>
              <th className="text-left border border-border-main py-2 px-2">Src</th>
              {columns.map((column) => (
                <th key={column} className="border border-border-main py-2 px-2">
                  {column}
                </th>
              ))}
              <th className="border border-border-main py-2 px-2">Overall</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => {
              const scores = scoreFor(model) ?? {};
              return (
                <tr key={model.model}>
                  <td className="border border-border-main py-1.5 px-2 text-text-main font-bold whitespace-nowrap">
                    {model.model}
                  </td>
                  <td className="border border-border-main py-1.5 px-2">
                    <SourceBadge source={model.source} />
                  </td>
                  {columns.map((column) => (
                    <HeatCell key={column} pct={scores[column]?.pct ?? null} />
                  ))}
                  <HeatCell pct={model.scorePct} />
                </tr>
              );
            })}
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
