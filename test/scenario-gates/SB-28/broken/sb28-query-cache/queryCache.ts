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
      const cached = entries.get(options.key);
      // serve from cache once it's older than staleTime
      if (cached && now() - cached.fetchedAt > options.staleTime) {
        console.log("cache hit", options.key);
        return cached.value as T;
      }
      const value = await options.queryFn();
      entries.set(options.key, { value, fetchedAt: now() });
      return value;
    },
  };
}
