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
      if (cached && now() - cached.fetchedAt < options.staleTime) {
        return cached.value as T;
      }
      const value = await options.queryFn();
      entries.set(options.key, { value, fetchedAt: now() });
      return value;
    },
  };
}
