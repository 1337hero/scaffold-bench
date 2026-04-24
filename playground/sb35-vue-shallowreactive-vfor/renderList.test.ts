import { strict as assert } from "node:assert";
import {
  isReactive,
  reactive,
  renderList,
  shallowReactive,
} from "./renderList.ts";

// Case 1 — deep reactive array: items MUST be wrapped. isReactive true.
{
  const src = reactive([{ foo: 1 }]);
  const out = renderList(src, (item) => isReactive(item));
  assert.deepEqual(out, [true]);
}

// Case 2 — shallowReactive array: items MUST NOT be wrapped. The whole
// point of shallowReactive is that nested reads don't trigger reactivity.
// Pre-fix, this test fails: out === [true] instead of [false].
{
  const src = shallowReactive([{ foo: 1 }]);
  const out = renderList(src, (item) => isReactive(item));
  assert.deepEqual(out, [false], "shallowReactive items must not be deep-wrapped");
}

// Case 3 — plain array: passes through unchanged. Sanity.
{
  const src = [{ foo: 1 }];
  const out = renderList(src, (item) => isReactive(item));
  assert.deepEqual(out, [false]);
}

// Case 4 — null/undefined source yields empty array.
{
  assert.deepEqual(renderList(null, () => 1), []);
  assert.deepEqual(renderList(undefined, () => 1), []);
}

console.log("sb35 ok");
