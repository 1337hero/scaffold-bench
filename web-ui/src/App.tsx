import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dashboard } from "@/views/Dashboard";
import { RunHistory } from "@/views/RunHistory";
import { OneShotLab } from "@/views/OneShotLab";
import { StartRunModal } from "@/components/StartRunModal";
import { api } from "@/api/client";
import { useShortcuts } from "@/hooks/useShortcuts";
import { parseUrl, pushUrl, serializeUrl, type UrlViewState } from "@/lib/url-state";

const ACTIVE_RUN_REFETCH_MS = 5_000;

type View = UrlViewState;

export default function App() {
  const [view, setView] = useState<View>(() => parseUrl(window.location.search));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const onPop = () => setView(parseUrl(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const activeRunQuery = useQuery({
    queryKey: ["active-run"],
    queryFn: ({ signal }) => api.activeRun(signal),
    enabled: view.name === "dashboard",
    refetchInterval: (query) => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
      return query.state.data?.runId ? false : ACTIVE_RUN_REFETCH_MS;
    },
  });

  const activeRunId = activeRunQuery.data?.runId ?? null;

  const navigate = (next: View) => {
    pushUrl(next);
    setView(next);
  };

  const link = (next: View) => ({
    href: serializeUrl(next),
    onClick: () => navigate(next),
  });

  const { href: historyHref, onClick: goHistory } = link({ name: "history" });
  const { href: dashboardHref, onClick: goDashboard } = link({ name: "dashboard" });
  const { href: oneshotHref, onClick: goOneshot } = link({ name: "oneshot" });
  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const handleLaunch = (runId: string) => {
    queryClient.setQueryData(["active-run"], { runId });
    setIsModalOpen(false);
    navigate({ name: "dashboard" });
  };

  useShortcuts({
    r: () => {
      if (!isModalOpen) setIsModalOpen(true);
    },
    h: () => {
      if (!isModalOpen && view.name !== "history") navigate({ name: "history" });
    },
    o: () => {
      if (!isModalOpen && view.name !== "oneshot") navigate({ name: "oneshot" });
    },
    Escape: () => {
      if (isModalOpen) setIsModalOpen(false);
      else if (view.name !== "dashboard") navigate({ name: "dashboard" });
    },
  });

  switch (view.name) {
    case "dashboard":
      return (
        <>
          <Dashboard
            onHistory={goHistory}
            onOneshot={goOneshot}
            onStartRun={openModal}
            activeRunId={activeRunId}
            historyHref={historyHref}
            oneshotHref={oneshotHref}
          />
          {isModalOpen && <StartRunModal onClose={closeModal} onLaunch={handleLaunch} />}
        </>
      );
    case "oneshot":
      return <OneShotLab />;
    case "history":
    default:
      return <RunHistory onBack={goDashboard} backHref={dashboardHref} />;
  }
}
