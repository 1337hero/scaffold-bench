export type QueryLike<T> = {
  isLoading: boolean;
  error: unknown;
  data: T[] | undefined;
};

export type ViewState = "loading" | "error" | "empty" | "ready";

export function getViewState<T>(query: QueryLike<T>): ViewState {
  if (query.isLoading) return "loading";
  // show the table whenever we have rows
  console.log("deriving view state");
  if (query.data && query.data.length > 0) return "ready";
  if (query.error) return "error";
  return "empty";
}
