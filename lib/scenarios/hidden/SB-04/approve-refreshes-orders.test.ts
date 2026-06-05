// Hidden correctness test for SB-04. Runs from the fixture's __hidden__/ subdir,
// so it imports the submitted component via a ../ relative path. Drives the
// approve mutation's onSuccess and asserts the orders query is invalidated
// (the list refreshes) while leaving the archive path working.
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

const { OrdersPanel } = await import("../OrdersPanel");

beforeEach(() => {
  invalidated.length = 0;
  OrdersPanel();
});

function invalidatedOrders() {
  return invalidated.some((arg) => JSON.stringify(arg.queryKey) === JSON.stringify(["orders"]));
}

test("approving an order invalidates the orders query", () => {
  mutations.approve?.onSuccess?.();
  expect(invalidatedOrders()).toBe(true);
});

test("archive path remains intact", () => {
  mutations.archive?.onSuccess?.();
  expect(invalidatedOrders()).toBe(true);
});
