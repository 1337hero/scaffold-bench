import { useState } from "react";
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
import type { ReportModelAggregate, ReportSourceFilter, ScenarioRunFilters } from "@/types";

const REPORT_REFETCH_MS = 10_000;

const TASK_TYPES = ["bugfix", "refactor", "feature", "no-op", "security", "tooling"];
const DIFFICULTIES = ["small", "medium", "large"];
const SURFACES = ["frontend", "backend", "fullstack", "tooling", "ops"];
const SIGNAL_TYPES = ["behavioral", "regex-shape", "stdout", "trace", "latency"];
const EVALUATOR_KINDS = [
  "unit",
  "browser",
  "api",
  "sql",
  "a11y",
  "ast",
  "trace",
  "stdout",
  "latency",
  "regex",
];
const STACKS = [
  "react",
  "next",
  "hono",
  "express",
  "tanstack-query",
  "tanstack-router",
  "react-hook-form",
  "zod",
  "node",
  "vite",
  "typescript",
  "axios",
  "sqlite",
];

interface RunHistoryProps {
  onBack: () => void;
  backHref: string;
}

export function RunHistory({ onBack, backHref }: RunHistoryProps) {
  const queryClient = useQueryClient();
  const [sourceFilter, setSourceFilter] = useState<ReportSourceFilter>("all");
  const [sliceFilters, setSliceFilters] = useState<ScenarioRunFilters>({});
  const [armed, setArmed] = useState(false);
  const reportQuery = useQuery({
    queryKey: ["report-data", sliceFilters],
    queryFn: ({ signal }) => api.getReportData(sliceFilters, signal),
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
      const previousRuns = queryClient.getQueryData(["runs"]);
      queryClient.setQueryData(["runs"], []);
      return { previousRuns };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousRuns !== undefined) {
        queryClient.setQueryData(["runs"], context.previousRuns);
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
      setTimeout(() => setArmed(false), 3000);
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

      <SliceFilterBar filters={sliceFilters} onChange={setSliceFilters} />

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
            <MetricBars
              title="Behavioral-only score (%)"
              models={sortByMetric(visibleModels, (model) => model.behavioralScorePct)}
              value={(model) => model.behavioralScorePct}
              format={(value) => `${value.toFixed(1)}%`}
              color="#2ECC71"
            />
            <MetricBars
              title="Browser-only score · browser + a11y (%)"
              models={sortByMetric(visibleModels, (model) => model.browserScorePct)}
              value={(model) => model.browserScorePct}
              format={(value) => `${value.toFixed(1)}%`}
              color="#1ABC9C"
            />
            <MetricBars
              title="Hidden-test pass rate (%)"
              models={sortByMetric(visibleModels, (model) => model.hiddenTestPassRate)}
              value={(model) => model.hiddenTestPassRate}
              format={(value) => `${value.toFixed(1)}%`}
              color="#F39C12"
            />
            <MetricBars
              title="Tool efficiency · points per tool call"
              models={sortByMetric(visibleModels, (model) => model.pointsPerToolCall)}
              value={(model) => model.pointsPerToolCall}
              format={(value) => value.toFixed(2)}
              color="#9B59B6"
            />
          </>
        )}

        {runsQuery.isLoading ? (
          <div className="text-text-dim text-center py-12">Loading runs…</div>
        ) : runsQuery.isError ? (
          <div className="text-red-main text-center py-12">Failed to load runs</div>
        ) : runs.length === 0 ? null : (
          <RecentRunsTable runs={runs} />
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

function SliceFilterBar({
  filters,
  onChange,
}: {
  filters: ScenarioRunFilters;
  onChange: (filters: ScenarioRunFilters) => void;
}) {
  const active = Object.values(filters).some((v) => (Array.isArray(v) ? v.length : v));
  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 text-[11px]">
      <span className="uppercase tracking-widest text-text-dim">Slices</span>
      <SliceSelect
        label="Signal"
        value={filters.signalType}
        options={SIGNAL_TYPES}
        onChange={(v) => onChange({ ...filters, signalType: v })}
      />
      <SliceSelect
        label="Evaluator"
        value={filters.evaluatorKind}
        options={EVALUATOR_KINDS}
        onChange={(v) => onChange({ ...filters, evaluatorKind: v })}
      />
      <SliceSelect
        label="Surface"
        value={filters.surface}
        options={SURFACES}
        onChange={(v) => onChange({ ...filters, surface: v })}
      />
      <SliceSelect
        label="Task"
        value={filters.taskType}
        options={TASK_TYPES}
        onChange={(v) => onChange({ ...filters, taskType: v })}
      />
      <SliceSelect
        label="Difficulty"
        value={filters.difficulty}
        options={DIFFICULTIES}
        onChange={(v) => onChange({ ...filters, difficulty: v })}
      />
      <SliceSelect
        label="Stack"
        value={filters.stacks?.[0]}
        options={STACKS}
        onChange={(v) => onChange({ ...filters, stacks: v ? [v] : undefined })}
      />
      {active && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="border border-border-main text-text-dim hover:text-text-main px-2 py-1 uppercase tracking-widest"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function SliceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.currentTarget.value || undefined)}
      className={`bg-bg-main border px-2 py-1 font-mono ${
        value ? "border-gold text-gold" : "border-border-main text-text-dim"
      }`}
    >
      <option value="">{label}: all</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
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
