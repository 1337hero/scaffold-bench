import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { ScenarioInfo } from "@/types";

interface UseStartRunFormArgs {
  onLaunch: (runId: string, scenarioIds: string[]) => void;
}

export function useStartRunForm({ onLaunch }: UseStartRunFormArgs) {
  const scenariosQuery = useQuery({
    queryKey: ["scenarios"],
    queryFn: ({ signal }) => api.getScenarios(signal),
  });
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: ({ signal }) => api.getModels(signal),
  });

  const scenarios = useMemo(() => scenariosQuery.data ?? [], [scenariosQuery.data]);
  const localModels = modelsQuery.data?.local ?? [];
  const remoteModels = modelsQuery.data?.remote ?? [];
  const loading = scenariosQuery.isLoading || modelsQuery.isLoading;
  const loadError = scenariosQuery.isError || modelsQuery.isError;

  const defaultSelectedIds = useMemo(() => new Set(scenarios.map((s) => s.id)), [scenarios]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => defaultSelectedIds);
  const [userEdited, setUserEdited] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [timeoutSecs, setTimeoutSecs] = useState(600);
  const [toolExecution, setToolExecution] = useState<"sequential" | "parallel">("sequential");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userEdited) setSelectedIds(defaultSelectedIds);
  }, [defaultSelectedIds, userEdited]);

  useEffect(() => {
    if (selectedModel) return;
    const first = modelsQuery.data?.local?.[0] ?? modelsQuery.data?.remote?.[0];
    if (first) setSelectedModel(first.id);
  }, [modelsQuery.data, selectedModel]);

  const createRunMutation = useMutation({
    mutationFn: api.createRun,
    onSuccess: ({ runId }, variables) => {
      onLaunch(runId, variables.scenarioIds);
    },
    onError: (err) => {
      const e = err as Error & { activeRunId?: string };
      const message = e.activeRunId
        ? `A run is already in progress (${e.activeRunId})`
        : (e.message ?? "Failed to start run");
      setError(message);
    },
  });

  const scenariosByCategory = scenarios.reduce<Record<string, ScenarioInfo[]>>((acc, scenario) => {
    (acc[scenario.category] ??= []).push(scenario);
    return acc;
  }, {});

  const toggleScenario = (id: string) => {
    setUserEdited(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (ids: string[]) => {
    setUserEdited(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearGroup = (ids: string[]) => {
    setUserEdited(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedIds.size === 0) {
      setError("Select at least one scenario");
      return;
    }
    setError(null);
    createRunMutation.mutate({
      scenarioIds: [...selectedIds],
      modelId: selectedModel || undefined,
      systemPrompt: systemPrompt || undefined,
      toolExecution,
      timeoutMs: timeoutSecs * 1000,
    });
  };

  return {
    loading,
    loadError,
    localModels,
    remoteModels,
    scenariosByCategory,
    selectedIds,
    selectedModel,
    setSelectedModel,
    systemPrompt,
    setSystemPrompt,
    timeoutSecs,
    setTimeoutSecs,
    toolExecution,
    setToolExecution,
    showAdvanced,
    setShowAdvanced,
    error,
    toggleScenario,
    selectAll,
    clearGroup,
    handleSubmit,
    isPending: createRunMutation.isPending,
  };
}
