import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StartRunModal } from "./StartRunModal";

function dialogShowModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
}

function dialogClose(this: HTMLDialogElement) {
  this.removeAttribute("open");
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe("StartRunModal user flow", () => {
  const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;

    if (url.includes("/api/scenarios")) {
      return Response.json([
        {
          id: "SB-01",
          name: "First scenario",
          category: "core",
          maxPoints: 10,
          prompt: "Do the thing",
        },
      ]);
    }

    if (url.includes("/api/models")) {
      return Response.json({
        local: [{ id: "model-a", source: "local", endpoint: "local" }],
        remote: [],
      });
    }

    if (url.includes("/api/runs") && init?.method === "POST") {
      return Response.json({ runId: "run-new" });
    }

    return new Response("not found", { status: 404 });
  });

  beforeEach(() => {
    cleanup();
    globalThis.fetch = fetchMock as typeof fetch;
    fetchMock.mockClear();

    HTMLDialogElement.prototype.showModal ??= dialogShowModal;
    HTMLDialogElement.prototype.close ??= dialogClose;
  });

  afterEach(() => {
    cleanup();
  });

  test("submitting start run launches with selected scenarios", async () => {
    const user = userEvent.setup();
    const onLaunch = mock(() => {});

    render(
      <QueryClientProvider client={makeClient()}>
        <StartRunModal onClose={() => {}} onLaunch={onLaunch} />
      </QueryClientProvider>
    );

    const startButton = await screen.findByRole("button", { name: "Start Run" });
    await waitFor(() => expect(startButton.hasAttribute("disabled")).toBe(false));

    await user.click(startButton);

    await waitFor(() => {
      expect(onLaunch).toHaveBeenCalledWith("run-new", ["SB-01"]);
    });
  });
});
