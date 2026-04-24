import type { ReportData, ReportModelAggregate } from "@/types";
import { formatTps } from "@/lib/format";

export function AwardsGrid({ awards }: { awards: ReportData["awards"] }) {
  return (
    <section className="mt-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <AwardCard label="🏆 Best Overall" model={awards.bestOverall} tone="text-gold" detail={bestOverallDetail} />
        <AwardCard label="🎯 Best Aligned" model={awards.bestAligned} tone="text-green-main" detail={alignedDetail} />
        <AwardCard label="⚡ Fastest Generation" model={awards.fastestGeneration} tone="text-blue-main" detail={fastestGenerationDetail} />
        <AwardCard label="📨 Fastest Prompt Eval" model={awards.fastestPrompt} tone="text-gold" detail={fastestPromptDetail} />
      </div>
    </section>
  );
}

function AwardCard({
  label,
  model,
  tone,
  detail,
}: {
  label: string;
  model?: ReportModelAggregate;
  tone: string;
  detail: (model: ReportModelAggregate) => string;
}) {
  return (
    <div className="bg-content-bg border border-border-main rounded-sm p-4 min-w-0">
      <div className="text-[10px] text-text-dim uppercase tracking-widest">{label}</div>
      <div className={`text-[17px] mt-1 font-bold truncate ${tone}`}>{model?.model ?? "—"}</div>
      <div className="text-[11px] text-text-dim mt-1">{model ? detail(model) : "No data"}</div>
    </div>
  );
}

function bestOverallDetail(model: ReportModelAggregate): string {
  return `${model.scorePct.toFixed(1)}% · ${model.pointsAvg.toFixed(1)}/${model.maxAvg.toFixed(0)} pts · ${formatTps(model.completionTps, model.completionTpsApprox, 1)} gen tps`;
}

function alignedDetail(model: ReportModelAggregate): string {
  return `${model.scorePct.toFixed(1)}% @ ${model.avgScenarioSeconds.toFixed(1)}s/scen · ${formatTps(model.completionTps, model.completionTpsApprox, 1)} gen tps`;
}

function fastestGenerationDetail(model: ReportModelAggregate): string {
  return `${formatTps(model.completionTps, model.completionTpsApprox, 1)} gen tps · ${model.scorePct.toFixed(1)}% score`;
}

function fastestPromptDetail(model: ReportModelAggregate): string {
  return `${formatTps(model.promptTps, model.promptTpsApprox, 0)} prompt tps`;
}
