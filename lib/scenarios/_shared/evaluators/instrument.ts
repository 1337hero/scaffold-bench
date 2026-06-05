export type CallCounter = {
  count: number;
  calls: string[];
  reset(): void;
};

export type FetchFn = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) => Promise<Response>;

export type InstrumentedFetch = CallCounter & {
  fetch: FetchFn;
};

export type InstrumentedDb = CallCounter & {
  query<T>(sql: string, run: () => T): T;
};

/**
 * Wraps a fetch implementation, counting every call and recording its URL.
 * A fixture test imports this, passes the wrapped fetch to the code under
 * test, then asserts `count` (refetch / duplicate-fetch detection).
 */
export function instrumentApiCalls(impl: FetchFn = fetch): InstrumentedFetch {
  const counter: InstrumentedFetch = {
    count: 0,
    calls: [],
    fetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
      counter.count += 1;
      counter.calls.push(
        typeof input === "string" ? input : String((input as Request).url ?? input)
      );
      return impl(input, init);
    },
    reset() {
      counter.count = 0;
      counter.calls = [];
    },
  };
  return counter;
}

/**
 * Counts SQL queries routed through `query`. A fixture wraps each db call in
 * `counter.query(sql, () => db.run(sql))`; asserting `count` catches N+1.
 */
export function countSqlQueries(): InstrumentedDb {
  const counter: InstrumentedDb = {
    count: 0,
    calls: [],
    query<T>(sql: string, run: () => T): T {
      counter.count += 1;
      counter.calls.push(sql);
      return run();
    },
    reset() {
      counter.count = 0;
      counter.calls = [];
    },
  };
  return counter;
}
