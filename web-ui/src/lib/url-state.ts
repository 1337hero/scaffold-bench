export type UrlViewState =
  | { name: "dashboard"; replayRunId?: string }
  | { name: "history" }

export function parseUrl(search: string): UrlViewState {
  const params = new URLSearchParams(search)
  if (params.get("view") === "history") return { name: "history" }
  const replayRunId = params.get("replayRunId") ?? undefined
  return { name: "dashboard", replayRunId }
}

export function serializeUrl(view: UrlViewState): string {
  const params = new URLSearchParams()
  if (view.name === "history") params.set("view", "history")
  else if (view.replayRunId) params.set("replayRunId", view.replayRunId)
  const qs = params.toString()
  return qs ? `?${qs}` : window.location.pathname
}

export function replaceUrl(view: UrlViewState): void {
  const url = serializeUrl(view)
  window.history.replaceState(null, "", url)
}

export function pushUrl(view: UrlViewState): void {
  const url = serializeUrl(view)
  window.history.pushState(null, "", url)
}
