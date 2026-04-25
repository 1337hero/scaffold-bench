import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dashboard } from "@/views/Dashboard";
import { RunHistory } from "@/views/RunHistory";
import { StartRunModal } from "@/components/StartRunModal";
import { api } from "@/api/client";
import { useShortcuts } from "@/hooks/useShortcuts";
import { parseUrl, pushUrl, replaceUrl, type UrlViewState } from "@/lib/url-state";

const ACTIVE_RUN_REFETCH_MS = 5_000;

type View = UrlViewState;

export default function App() {
  const [view, setView] = useState<View>(() => parseUrl(window.location.search));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    replaceUrl(parseUrl(window.location.search));
    const onPop = () => setView(parseUrl(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const activeRunQuery = useQuery({
    queryKey: ["active-run"],
    queryFn: api.activeRun,
    refetchInterval: (query) => (query.state.data?.runId ? false : ACTIVE_RUN_REFETCH_MS),
  });

  const activeRunId = activeRunQuery.data?.runId ?? null;

  const navigate = (next: View) => {
    pushUrl(next);
    setView(next);
  };

  const goHistory = () => navigate({ name: "history" });
  const goDashboard = () => navigate({ name: "dashboard" });
  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const handleLaunch = (runId: string) => {
    queryClient.setQueryData(["active-run"], { runId });
    setIsModalOpen(false);
    navigate({ name: "dashboard" });
  };

  const handleReplay = (runId: string) => navigate({ name: "dashboard", replayRunId: runId });

  useShortcuts({
    r: () => {
      if (!isModalOpen) setIsModalOpen(true);
    },
    h: () => {
      if (!isModalOpen && view.name !== "history") navigate({ name: "history" });
    },
    Escape: () => {
      if (isModalOpen) setIsModalOpen(false);
      else if (view.name !== "dashboard") navigate({ name: "dashboard" });
    },
  });

  return (
    <>
      {view.name === "dashboard" ? (
        <Dashboard
          onHistory={goHistory}
          onStartRun={openModal}
          activeRunId={activeRunId}
          initialRunId={view.replayRunId}
        />
      ) : (
        <RunHistory onReplay={handleReplay} onBack={goDashboard} />
      )}

      {isModalOpen && <StartRunModal onClose={closeModal} onLaunch={handleLaunch} />}
    </>
  );
}
