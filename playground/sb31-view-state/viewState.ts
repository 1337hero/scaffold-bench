// Derives the UI state a list view should render from a query result. Users
// report two glitches: an empty result still shows the table (should show the
// empty state), and a refetch error after data is present is swallowed (should
// show the error state). Loading takes priority, then error, then empty, then
// ready. Fix getViewState to honor that precedence.
export type QueryLike<T> = {
  isLoading: boolean;
  error: unknown;
  data: T[] | undefined;
};

export type ViewState = "loading" | "error" | "empty" | "ready";

export function getViewState<T>(query: QueryLike<T>): ViewState {
  if (query.isLoading) return "loading";
  if (query.data && query.data.length > 0) return "ready";
  if (query.error) return "error";
  return "ready";
}
