import { strict as assert } from "node:assert";
import { permuteHelper } from "./permuteHelper.mjs";

// Case 1: no conflicts. Helper id unrelated to anything, no caller
// bindings, local names keep their names.
{
  const out = permuteHelper({ type: "Identifier", name: "_unrelated" }, ["foo"], []);
  assert.deepEqual(out, {});
}

// Case 2: caller already uses the local name. Single underscore dodge.
{
  const out = permuteHelper({ type: "Identifier", name: "_other" }, ["set"], ["set"]);
  assert.deepEqual(out, { set: "_set" });
}

// Case 3 — the bug. Helper is imported as `_set` (id.name = "_set") and
// has an internal `set` local. User module has `let set`, so the local
// must dodge. The single-underscore candidate `_set` collides with the
// HELPER'S OWN identifier. Fix reserves the id's name up front, so the
// dodge lands on `__set` (two underscores).
{
  const out = permuteHelper(
    { type: "Identifier", name: "_set" },
    ["set"],
    ["set"]
  );
  assert.equal(out.set, "__set", `expected __set, got ${out.set}`);
}

// Case 4 — same pattern at deeper collision depth. Helper id "__x",
// local "x", caller has x and _x — must rename to ___x.
{
  const out = permuteHelper(
    { type: "Identifier", name: "__x" },
    ["x"],
    ["x", "_x"]
  );
  assert.equal(out.x, "___x", `expected ___x, got ${out.x}`);
}

// Case 5 — non-Identifier id (e.g., a MemberExpression) should NOT be
// used as a reserved name. Regression guard against over-broad fixes.
{
  const out = permuteHelper(
    { type: "MemberExpression", object: "whatever" },
    ["set"],
    ["set"]
  );
  assert.equal(out.set, "_set");
}

console.log("sb32 ok");
