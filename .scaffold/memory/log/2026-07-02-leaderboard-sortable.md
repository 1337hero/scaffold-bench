# 2026-07-02 — Leaderboard table sortable

**Problem:** User asked previous agent to make the "RUNS" column sortable, but
the previous agent added sorting to the **Recent Runs table** (Scenarios, Score,
Time, Started columns) instead of the **Leaderboard table's "Runs" column**.
Clicking any Leaderboard column header did nothing — the table was entirely
static.

**Fix:** Replaced the static Leaderboard table with a client-side sortable table
matching the RecentRunsTable pattern. All 12 numeric columns are sortable
desc/asc: Score, Pts/run, Gen TPS, Prompt TPS, Scen Avg, Total Wall, TTFT,
Tools, Requests, T/O, Exempt, Runs. Default sort is Score desc (same as before).

**Files changed:**
- `web-ui/src/components/report/Leaderboard.tsx` — added `useState`, `handleSort`,
  `compareModels`, `arrow()`, and `sortableTh()` helpers. Mapped all numeric
  `ReportModelAggregate` fields to sort keys.

**Verification:**
- `tsc --noEmit` clean
- Browser-tested: clicking Score, Runs, and other column headers toggles sort
  direction (▼/▲ arrow) and reorders rows correctly
- Pre-existing test failure (happy-dom/user-event mismatch) unchanged