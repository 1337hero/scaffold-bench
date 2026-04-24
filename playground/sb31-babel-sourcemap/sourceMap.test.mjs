import { strict as assert } from "node:assert";
import { applyInputMap, SourceMapGenerator } from "./sourceMap.mjs";

// Case 1: inputMap with sourcesContent — baseline. Should forward each
// source's content string.
{
  const map = new SourceMapGenerator();
  applyInputMap(
    map,
    {
      sources: ["input.js"],
      sourcesContent: ["export const x = 1;"],
    },
    ["resolved/input.js"]
  );
  assert.deepEqual(map.entries, [
    { source: "resolved/input.js", content: "export const x = 1;" },
  ]);
}

// Case 2: inputMap with NO sourcesContent (spec-legal). Pre-fix, this
// throws TypeError: Cannot read properties of undefined (reading '0').
// Post-fix, setSourceContent is called once with content === undefined.
{
  const map = new SourceMapGenerator();
  applyInputMap(
    map,
    {
      sources: ["input.js"],
      // no sourcesContent
    },
    ["resolved/input.js"]
  );
  assert.equal(map.entries.length, 1, "setSourceContent should still be called once");
  assert.equal(map.entries[0].source, "resolved/input.js");
  assert.equal(map.entries[0].content, undefined);
}

// Case 3: multiple sources, sourcesContent only partially populated.
// undefined slots pass through as undefined.
{
  const map = new SourceMapGenerator();
  applyInputMap(
    map,
    {
      sources: ["a.js", "b.js"],
      sourcesContent: ["a", undefined],
    },
    ["A", "B"]
  );
  assert.deepEqual(map.entries, [
    { source: "A", content: "a" },
    { source: "B", content: undefined },
  ]);
}

console.log("sb31 ok");
