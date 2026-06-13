import { describe, it, expect } from "bun:test";
import { createStore, addItem } from "./store.js";

describe("store", () => {
  it("notifies subscribers on setState", () => {
    const store = createStore({ count: 0 });
    let notified = false;
    store.subscribe(() => {
      notified = true;
    });
    store.setState({ count: 1 });
    expect(notified).toBe(true);
  });

  it("addItem should notify subscribers (BUG: it does not)", () => {
    const store = createStore({ items: [] });
    let notified = false;
    store.subscribe(() => {
      notified = true;
    });
    addItem(store, "new item");
    expect(notified).toBe(true);
  });
});
