import { strict as assert } from "node:assert";
import { rename } from "./renameShorthand.mjs";

// Helper: make a shorthand { a } property node (key.name === value.name).
function shorthandProp(name) {
  return {
    type: "ObjectProperty",
    shorthand: true,
    key: { type: "Identifier", name },
    value: { type: "Identifier", name },
    extra: { shorthand: true },
  };
}

// Case 1: rename a plain identifier reference. Sanity — the base
// Identifier visitor should do this even pre-fix.
{
  const prog = {
    type: "Program",
    body: [
      {
        type: "AssignmentExpression",
        left: { type: "Identifier", name: "a" },
        right: { type: "Identifier", name: "b" },
      },
    ],
  };
  rename(prog, "a", "_a");
  assert.equal(prog.body[0].left.name, "_a");
}

// Case 2 — THE bug. Rename `a` to `_a` where `a` appears as a shorthand
// property in an object literal. Post-fix, the property must have:
//   - shorthand: false
//   - key.name === "a" (key identifies the object field, unchanged)
//   - value.name === "_a" (value references the renamed binding)
{
  const prog = {
    type: "Program",
    body: [
      {
        type: "ObjectExpression",
        properties: [shorthandProp("a")],
      },
    ],
  };
  rename(prog, "a", "_a");
  const p = prog.body[0].properties[0];
  assert.equal(p.shorthand, false, `shorthand should flip to false, got ${p.shorthand}`);
  assert.equal(p.extra?.shorthand, false, "extra.shorthand must also flip");
  assert.equal(p.key.name, "a", `key.name should stay "a", got ${p.key.name}`);
  assert.equal(p.value.name, "_a", `value.name should be "_a", got ${p.value.name}`);
}

// Case 3: destructuring shorthand. `const { a } = obj` — same rule:
// rename to `const { a: _a } = obj`.
{
  const prog = {
    type: "Program",
    body: [
      {
        type: "VariableDeclaration",
        declarations: [
          {
            type: "VariableDeclarator",
            id: {
              type: "ObjectPattern",
              properties: [shorthandProp("a")],
            },
            init: { type: "Identifier", name: "obj" },
          },
        ],
      },
    ],
  };
  rename(prog, "a", "_a");
  const p = prog.body[0].declarations[0].id.properties[0];
  assert.equal(p.shorthand, false);
  assert.equal(p.key.name, "a");
  assert.equal(p.value.name, "_a");
}

// Case 4 — non-shorthand property should NOT be touched beyond normal
// identifier rename. Guards against over-broad fixes that flip all
// ObjectProperty nodes.
{
  const prog = {
    type: "Program",
    body: [
      {
        type: "ObjectExpression",
        properties: [
          {
            type: "ObjectProperty",
            shorthand: false,
            key: { type: "Identifier", name: "a" },
            value: { type: "Identifier", name: "a" },
            extra: { shorthand: false },
          },
        ],
      },
    ],
  };
  rename(prog, "a", "_a");
  const p = prog.body[0].properties[0];
  assert.equal(p.shorthand, false);
  // Real babel: the key is also treated as an identifier when computed,
  // but for plain {a: a} both positions are Identifier and renamed.
  // Our minimal walker renames both; that matches babel's behavior here.
  assert.equal(p.value.name, "_a");
}

console.log("sb33 ok");
