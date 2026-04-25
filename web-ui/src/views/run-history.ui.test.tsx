import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { RunHistory } from "./RunHistory";
import type { ReportData, RunSummary } from "@/types";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderHistory(props: Partial<ComponentProps<typeof RunHistory>> = {}) {
  const queryClient = makeClient();
  const onReplay = props.onReplay ?? mock(() => {});
  const onBack = props.onBack ?? mock(() => {});

  render(
    <QueryClientProvider client={queryClient}>
      <RunHistory onReplay={onReplay} onBack={onBack} backHref={props.backHref ?? "/"} />
    </QueryClientProvider>
  );

  return { onReplay, onBack, queryClient };
}

const reportPayload: ReportData = {
  models: [],
  categories: [],
  totals: { models: 0, runs: 1, local: 0, api: 0, scenarioRuns: 1 },
  snapshot: "now",
  awards: {},
};

const runsPayload: RunSummary[] = [
  {
    id: "run-123",
    startedAt: Date.now() - 5000,
    finishedAt: Date.now() - 1000,
    status: "done",
    model: "qwen3",
    scenarioIds: ["SB-01"],
    totalPoints: 7,
    maxPoints: 10,
  },
];

describe("RunHistory user flows", () => {
  const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;

    if (url.includes("/api/bench-report/data")) return Response.json(reportPayload);
    if (url.includes("/api/runs/clear")) return Response.json({ ok: true });
    if (url.includes("/api/runs") && init?.method !== "POST") return Response.json(runsPayload);

    return new Response("not found", { status: 404 });
  });

  beforeEach(() => {
    cleanup();
    globalThis.fetch = fetchMock as typeof fetch;
    fetchMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test("replay action calls onReplay with selected run id", async () => {
    const user = userEvent.setup();
    const onReplay = mock(() => {});
    renderHistory({ onReplay });

    const openLink = await screen.findByRole("link", { name: "Open" });
    await user.click(openLink);

    expect(onReplay).toHaveBeenCalledWith("run-123");
  });

  test("clear logs requires confirmation click before mutation", async () => {
    const user = userEvent.setup();
    renderHistory();

    const deleteButton = await screen.findByRole("button", { name: "DELETE ALL LOGS" });
    await user.click(deleteButton);

    expect(await screen.findByRole("button", { name: "CLICK AGAIN TO CONFIRM" })).toBeTruthy();
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/runs/clear"))
    ).toBeFalse();

    await user.click(screen.getByRole("button", { name: "CLICK AGAIN TO CONFIRM" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/runs/clear"))
      ).toBeTrue();
    });
  });
});
