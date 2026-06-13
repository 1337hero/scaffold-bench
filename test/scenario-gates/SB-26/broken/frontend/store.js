export function createStore(initialState) {
  let state = initialState;
  const subscribers = new Set();

  function getState() {
    return state;
  }
  function subscribe(listener) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }
  function setState(updater) {
    state = typeof updater === "function" ? updater(state) : { ...state, ...updater };
    subscribers.forEach((s) => s(state));
  }

  return { getState, subscribe, setState };
}

export function addItem(store, item) {
  store.getState().items.push(item);
}
