import { test, expect, mock, beforeEach } from "bun:test";

const invalidated: Array<{ queryKey?: unknown[] }> = [];
const queryClient = { invalidateQueries: (arg: { queryKey?: unknown[] }) => invalidated.push(arg) };
const mutations: Record<string, { onSuccess?: () => void }> = {};

mock.module("@tanstack/react-query", () => ({
  useQueryClient: () => queryClient,
  useQuery: () => ({ data: [], isLoading: false, error: null }),
  useMutation: (config: { mutationFn: (id: string) => unknown; onSuccess?: () => void }) => {
    const src = config.mutationFn.toString();
    const key = src.includes("approve") ? "approve" : src.includes("archive") ? "archive" : "other";
    mutations[key] = config;
    return { mutate: () => {} };
  },
}));
mock.module("react/jsx-dev-runtime", () => ({ jsxDEV: () => null, Fragment: Symbol("Fragment") }));
mock.module("react/jsx-runtime", () => ({
  jsx: () => null,
  jsxs: () => null,
  Fragment: Symbol("Fragment"),
}));

const { OrdersPanel } = await import("./OrdersPanel");

beforeEach(() => {
  invalidated.length = 0;
  OrdersPanel();
});

function invalidatedOrders() {
  return invalidated.some((arg) => JSON.stringify(arg.queryKey) === JSON.stringify(["orders"]));
}

test("approve success refreshes the orders list", () => {
  mutations.approve?.onSuccess?.();
  expect(invalidatedOrders()).toBe(true);
});

test("archive success still refreshes the orders list", () => {
  mutations.archive?.onSuccess?.();
  expect(invalidatedOrders()).toBe(true);
});
