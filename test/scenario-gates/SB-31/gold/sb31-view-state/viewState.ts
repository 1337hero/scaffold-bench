export type QueryLike<T> = {
  isLoading: boolean;
  error: unknown;
  data: T[] | undefined;
};

export type ViewState = "loading" | "error" | "empty" | "ready";

export function getViewState<T>(query: QueryLike<T>): ViewState {
  if (query.isLoading) return "loading";
  if (query.error) return "error";
  if (!query.data || query.data.length === 0) return "empty";
  return "ready";
}
