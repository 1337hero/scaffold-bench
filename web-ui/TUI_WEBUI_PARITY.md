# TUI ↔ WebUI Parity Tracker

_Last updated: 2026-04-24_

This is the **running checklist** of behavior parity between the legacy TUI (`lib/dashboard.ts`) and the WebUI (`web-ui/src/*`).

Legend:
- ✅ = implemented / matching
- 🟡 = partial / close but not exact
- ❌ = missing

---

## 1) Run lifecycle + streaming

- ✅ Live SSE stream wiring (`/api/runs/:id/stream`)
- ✅ `assistant_delta` live rendering in center pane
- ✅ Delta coalescing (WebUI perf protection)
- ✅ Stream buffer flushes on `tool_call`
- ✅ Stream buffer flushes on `scenario_finished`
- ✅ Assistant finalization fallback: `streamBuffer || assistant.content`
- ✅ Auto-follow active scenario (unless user focused another scenario)

Notes:
- WebUI now behaves like TUI for token streaming and tool-boundary transcript persistence.

---

## 2) Scenario identity / naming

- ✅ Scenario ID shown (e.g. `SB-06`)
- ✅ Scenario title/name propagated from backend on `scenario_started`
- ✅ Duplicate title guard (`SB-06 / SB-06` avoided)

---

## 3) Queue panel parity

- ✅ Pending/running/pass/partial/fail/stopped states
- ✅ Running highlight + pulse indicator
- ✅ Focus selection behavior
- 🟡 Exact visual density differs from TUI (acceptable)

---

## 4) Center panel parity (Agent I/O)

- ✅ Live stream cursor + buffered text
- ✅ Tool call/result logs
- ✅ Status + elapsed + tool count subheader
- ✅ Scroll-to-bottom behavior (non-smooth during heavy stream)
- 🟡 Log formatting/colors differ from ANSI TUI theme (web-native styling)

---

## 5) Metrics parity

- ✅ Request count, prompt tokens, completion tokens
- ✅ Tool call count
- ✅ Bash/Edit call counters now wired as real counters
- ✅ First token latency (`firstTokenMs`) now wired end-to-end
- ✅ Stream debug in status bar (`events/s`, `chars/s`, last event)
- 🟡 Missing some richer TUI lines (e.g. turn wall list, prompt/gen split TPS details)

Follow-up options:
- Add `turnWallTimes` and per-turn first-token rows to WebUI metrics.

---

## 6) Verification panel parity

- ✅ Live checks no longer hardcoded optimistic
- ✅ Tool activity reflects real observed tool calls
- ✅ Bash verification check tied to bash-call evidence
- ✅ Scenario reset clears stale check/evaluation state on new scenario
- ✅ Added explanatory live-vs-final note
- 🟡 Check labels/logic are signal-based approximations (like TUI), not dedicated backend verification events

Follow-up options:
- Add explicit backend verification-signal events if you want strict, non-heuristic live checks.

---

## 7) Run summary parity

- ✅ Final score + category rollups
- 🟡 TUI-style “Misses” block is not yet shown in WebUI final summary

Follow-up options:
- Add misses list rendering from failed evaluation checks per scenario.

---

## 8) Header / footer metadata

- ✅ Header version now tied to app package version (`__APP_VERSION__`)
- ✅ Hardcoded runtime label removed
- ✅ API badge text clarified as **HTTP API** health
- ✅ Stream connection state shown (`idle/connecting/open/error/closed`)

---

## 9) Known intentional differences

These are currently acceptable WebUI divergences from TUI:

1. Web-native visual style (no ANSI box-drawing exact clone)
2. SSE delta batching for UI performance (TUI renders every event tick)
3. Simplified metrics layout vs dense TUI right-pane text block

---

## Suggested next parity tasks (priority)

1. Add WebUI final **Misses** section (TUI parity)
2. Add turn-level timing metrics (`turnWallTimes`, `turnFirstTokenMs`)
3. (Optional) promote live verification checks from heuristic to explicit backend event model

---

## Pointers

- TUI reference: `lib/dashboard.ts`
- WebUI state pipeline: `web-ui/src/hooks/useSSE.ts`, `web-ui/src/hooks/useRunState.ts`
- WebUI panels: `web-ui/src/components/*`
- Backend event contracts: `server/contracts/events.ts`
