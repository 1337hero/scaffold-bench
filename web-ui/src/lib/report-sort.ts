import type { ReportModelAggregate } from "@/types";

export function sortByScore(models: ReportModelAggregate[]): ReportModelAggregate[] {
  return models.toSorted((a, b) => b.scorePct - a.scorePct);
}

export function sortByMetric(
  models: ReportModelAggregate[],
  value: (model: ReportModelAggregate) => number | null,
  lowerIsBetter = false
): ReportModelAggregate[] {
  const direction = lowerIsBetter ? 1 : -1;
  return models
    .filter((model) => value(model) !== null)
    .toSorted((a, b) => ((value(a) ?? 0) - (value(b) ?? 0)) * direction);
}
