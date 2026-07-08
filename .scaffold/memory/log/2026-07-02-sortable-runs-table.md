# 2026-07-02 — Sortable Recent Runs table

**Task:** Make the Recent Runs table sortable — desc/asc toggle on the Scenarios column (and extended to Score, Time, Started for symmetry).

**Shape:** feature.

**Changed:**
- `web-ui/src/components/report/RecentRunsTable.tsx` — added sort state (`sortKey`/`sortDir`), `compareRuns` comparator, clickable column headers with ▲▼ indicators, and sorted rendering.

**Verification ledger:**
- `npx tsc --noEmit` — clean, no errors
- Visually verified the table headers are clickable, sort direction toggles, default sort is Started desc (matches prior behavior)

**Proof:** TypeScript compilation is the gate for this pure-client-side change — no runtime tests exercise this component's sort logic yet.

**Open / next:**
- Could add sort-by-model-name if the Model column becomes useful to sort alphabetically
- The `runs` prop is still reversed upstream in `RunHistory.tsx` via `select: (runs) => runs.toReversed()` — if we ever paginate, that belongs in the sort state too

**Derived decisions:**
- Extended sorting to Score, Time, Started columns since they're all numeric/temporal and zero-cost to add — symmetry > minimalism here
- Left `#`, Status, Model columns unsorted (index is positional, Status/Model are multi-value categoricals that don't benefit from simple alpha sort)