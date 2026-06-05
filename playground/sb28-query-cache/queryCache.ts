// A minimal staleTime-aware query cache, modeled on TanStack Query semantics.
// `fetchQuery` should return the cached value WITHOUT refetching while the entry
// is still fresh (within staleTime of its last fetch), and only hit queryFn
// again once the entry is stale. Today it refetches on every call — staleTime is
// ignored — which hammers the network.
export type QueryOptions<T> = {
  key: string;
  queryFn: () => Promise<T>;
  staleTime: number;
};

type Entry = { value: unknown; fetchedAt: number };

export function createQueryCache(now: () => number = Date.now) {
  const entries = new Map<string, Entry>();

  return {
    async fetchQuery<T>(options: QueryOptions<T>): Promise<T> {
      const value = await options.queryFn();
      entries.set(options.key, { value, fetchedAt: now() });
      return value;
    },
  };
}
