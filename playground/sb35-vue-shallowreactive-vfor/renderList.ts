// Extracted from Vue 3's renderList helper (the runtime that powers
// v-for). Source arrays can be:
//   - plain arrays: items pass through verbatim
//   - reactive([...]): items are DEEP reactive; renderList must wrap
//     each item via toReactive so downstream reads also track
//   - shallowReactive([...]): items are NOT reactive; renderList must
//     NOT wrap them (that would break the shallow contract)
//
// BUG: renderList treats "is a reactive array" as a single bit. Any
// reactive array — shallow or deep — triggers the toReactive wrap, so
// shallowReactive([{foo:1}]) has its items silently upgraded to deep
// reactive when rendered by v-for. `isReactive(items[0])` returns true
// when it should return false.
//
// Fix (vuejs/core#11870): split the decision. `sourceIsReactiveArray`
// controls whether to read the underlying raw array; `needsWrap`
// (which also requires !isShallow) controls whether to wrap each item.

// Minimal reactivity model. Marker sets record which objects/arrays are
// reactive vs shallowReactive. Real Vue uses a WeakMap + Proxy; we can
// skip that for the rubric.
const reactiveArrays = new WeakSet<object>();
const shallowReactiveArrays = new WeakSet<object>();
const reactiveObjects = new WeakSet<object>();

export function reactive<T extends object>(obj: T): T {
  reactiveObjects.add(obj);
  if (Array.isArray(obj)) reactiveArrays.add(obj);
  return obj;
}

export function shallowReactive<T extends object>(obj: T): T {
  if (Array.isArray(obj)) {
    reactiveArrays.add(obj);
    shallowReactiveArrays.add(obj);
  }
  return obj;
}

export function isReactive(v: unknown): boolean {
  return typeof v === "object" && v !== null && reactiveObjects.has(v);
}

export function isShallow(v: unknown): boolean {
  return typeof v === "object" && v !== null && shallowReactiveArrays.has(v);
}

function isReactiveArray(v: unknown): boolean {
  return typeof v === "object" && v !== null && reactiveArrays.has(v as object);
}

// Wrap a child value so it, too, becomes reactive (deep-wrap semantics).
function toReactive<T>(v: T): T {
  if (v && typeof v === "object" && !reactiveObjects.has(v)) {
    reactiveObjects.add(v);
  }
  return v;
}

// The v-for runtime.
export function renderList<T, R>(
  source: T[] | null | undefined,
  render: (item: T, index: number) => R
): R[] {
  if (source == null) return [];

  const sourceIsReactiveArray = Array.isArray(source) && isReactiveArray(source);
  // BUG: when `sourceIsReactiveArray` is true, every item is wrapped via
  // toReactive — regardless of whether the source was shallowReactive.
  // The fix introduces a separate `needsWrap = sourceIsReactiveArray &&
  // !isShallow(source)` that gates the wrap.
  const out: R[] = new Array(source.length);
  for (let i = 0; i < source.length; i++) {
    out[i] = render(
      sourceIsReactiveArray ? toReactive(source[i]) : source[i],
      i
    );
  }
  return out;
}
