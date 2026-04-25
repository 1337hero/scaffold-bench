import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import {
  AwardsGrid,
  CategoryHeatmap,
  Leaderboard,
  MetricBars,
  RecentRunsTable,
  ReportHeader,
  sortByMetric,
  sortByScore,
} from "@/components/report";
import type { ReportModelAggregate, ReportSourceFilter } from "@/types";

const REPORT_REFETCH_MS = 10_000;

interface RunHistoryProps {
  onReplay: (runId: string) => void;
  onBack: () => void;
  backHref: string;
}

export function RunHistory({ onReplay, onBack, backHref }: RunHistoryProps) {
  const queryClient = useQueryClient();
  const [sourceFilter, setSourceFilter] = useState<ReportSourceFilter>("all");
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  const reportQuery = useQuery({
    queryKey: ["report-data"],
    queryFn: ({ signal }) => api.getReportData(signal),
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState !== "visible"
        ? false
        : REPORT_REFETCH_MS,
  });
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: ({ signal }) => api.listRuns(signal),
    select: (runs) => runs.toReversed(),
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState !== "visible"
        ? false
        : REPORT_REFETCH_MS,
  });

  const report = reportQuery.data;
  const visibleModels = report ? filterModels(report.models, sourceFilter) : [];
  const scoreModels = sortByScore(visibleModels);
  const runs = runsQuery.data ?? [];
  const clearRunsMutation = useMutation({
    mutationFn: api.clearRuns,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["runs"] });
      await queryClient.cancelQueries({ queryKey: ["report-data"] });

      const previousRuns = queryClient.getQueryData(["runs"]);
      const previousReport = queryClient.getQueryData(["report-data"]);

      queryClient.setQueryData(["runs"], []);
      queryClient.setQueryData(["report-data"], (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const report = old as { totals?: { runs?: number; scenarioRuns?: number } };
        if (!report.totals) return old;
        return {
          ...report,
          totals: { ...report.totals, runs: 0, scenarioRuns: 0 },
        };
      });

      return { previousRuns, previousReport };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousRuns !== undefined) {
        queryClient.setQueryData(["runs"], context.previousRuns);
      }
      if (context?.previousReport !== undefined) {
        queryClient.setQueryData(["report-data"], context.previousReport);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["report-data"] });
      await queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
  const isRefreshing = reportQuery.isFetching || runsQuery.isFetching;

  const refresh = (): void => {
    void reportQuery.refetch();
    void runsQuery.refetch();
  };

  const clearRuns = (): void => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    clearRunsMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-bg-main text-text-main font-mono p-4 md:px-6 md:pt-6 text-[13px] leading-[1.4]">
      <ReportHeader
        totals={report?.totals ?? { models: 0, runs: 0, local: 0, api: 0, scenarioRuns: 0 }}
        snapshot={report?.snapshot ?? "—"}
        isRefreshing={isRefreshing}
        onBack={onBack}
        backHref={backHref}
        onRefresh={refresh}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
      />

      <div className="pb-12">
        {reportQuery.isLoading ? (
          <div className="text-text-dim text-center py-12">Loading report…</div>
        ) : reportQuery.isError ? (
          <div className="text-red-main text-center py-12">Failed to load report data</div>
        ) : !report || report.models.length === 0 ? (
          <EmptyReport onBack={onBack} backHref={backHref} />
        ) : (
          <>
            <AwardsGrid awards={report.awards} />
            <Leaderboard models={scoreModels} />
            <CategoryHeatmap models={scoreModels} categories={report.categories} />
            <MetricBars
              title="Quality score (% of scored max)"
              models={scoreModels}
              value={(model) => model.scorePct}
              format={(value) => `${value.toFixed(1)}%`}
              color="#2ECC71"
            />
            <MetricBars
              title="Generation speed (completion tok/s)"
              models={sortByMetric(visibleModels, (model) => model.completionTps)}
              value={(model) => model.completionTps}
              format={(value, model) =>
                `${model.completionTpsApprox ? "~" : ""}${value.toFixed(1)}`
              }
              color="#3498DB"
            />
            <MetricBars
              title="Prompt processing speed (prompt eval tok/s)"
              models={sortByMetric(visibleModels, (model) => model.promptTps)}
              value={(model) => model.promptTps}
              format={(value, model) => `${model.promptTpsApprox ? "~" : ""}${value.toFixed(0)}`}
              color="#FFBF00"
            />
            <MetricBars
              title="Scenario avg time (s)"
              models={sortByMetric(visibleModels, (model) => model.avgScenarioSeconds, true)}
              value={(model) => model.avgScenarioSeconds}
              format={(value) => `${value.toFixed(1)}s`}
              color="#E74C3C"
              lowerIsBetter
            />
            <MetricBars
              title="TTFT · time to first token (s)"
              models={sortByMetric(visibleModels, (model) => model.avgFirstTokenSeconds, true)}
              value={(model) => model.avgFirstTokenSeconds}
              format={(value) => `${value.toFixed(2)}s`}
              color="#b38bff"
              lowerIsBetter
            />
          </>
        )}

        {runsQuery.isLoading ? (
          <div className="text-text-dim text-center py-12">Loading runs…</div>
        ) : runsQuery.isError ? (
          <div className="text-red-main text-center py-12">Failed to load runs</div>
        ) : runs.length === 0 ? null : (
          <RecentRunsTable runs={runs} onReplay={onReplay} />
        )}
      </div>

      <div className="mt-6 pb-8 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={clearRuns}
          disabled={clearRunsMutation.isPending}
          className={`border px-4 py-1.5 text-[11px] uppercase tracking-widest disabled:opacity-50 ${
            armed
              ? "border-red-main bg-red-main/20 text-red-main animate-pulse"
              : "border-red-main/60 text-red-main hover:bg-red-main/10"
          }`}
        >
          {clearRunsMutation.isPending
            ? "DELETING…"
            : armed
              ? "CLICK AGAIN TO CONFIRM"
              : "DELETE ALL LOGS"}
        </button>
        {clearRunsMutation.isError && (
          <div className="text-red-main text-[11px]">
            Failed to clear run logs. Stop active runs and retry.
          </div>
        )}
      </div>
    </div>
  );
}

function filterModels(
  models: ReportModelAggregate[],
  sourceFilter: ReportSourceFilter
): ReportModelAggregate[] {
  if (sourceFilter === "all") return models;
  return models.filter((model) => model.source === sourceFilter);
}

function EmptyReport({ onBack, backHref }: { onBack: () => void; backHref: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-text-dim">
      <p>No completed benchmark results yet.</p>
      <a
        href={backHref}
        onClick={(e) => {
          e.preventDefault();
          onBack();
        }}
        className="text-gold hover:underline text-[12px]"
      >
        Start a run from the dashboard
      </a>
    </div>
  );
}
