// Extracted from @babel/traverse renamer.ts — the rename visitor that
// updates identifier references when a binding is renamed. Real babel
// walks an AST; here we model it as a minimal tree-walk over plain
// objects that have the shape { type, ...fields }.
//
// BUG: the original visitor renames identifier references but does NOT
// explode shorthand ObjectProperty nodes. When a scope renames `a` to
// `_a`, a property node { type: "ObjectProperty", shorthand: true,
// key: { name: "a" }, value: { name: "a" } } gets its VALUE renamed to
// `_a` while the KEY stays `a`. Since shorthand means key === value, the
// generator emits `{ _a }` — or, if both get renamed, `{ _a }` shorthand,
// which changes the object's field name. Either way, wrong.
//
// Fix: visit ObjectProperty BEFORE descending into children; if shorthand
// is true and the key matches the rename source, flip shorthand to false
// and return "skip" so the walker won't blindly rename the key node too.

// Walks node (and all object-typed children), applying visitors.
// If a visitor returns "skip", children aren't visited.
function walk(node, visitors) {
  if (node === null || typeof node !== "object") return;
  const type = node.type;
  if (type && visitors[type]) {
    const result = visitors[type](node);
    if (result === "skip") return;
  }
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visitors));
    else if (v && typeof v === "object") walk(v, visitors);
  }
}

// Rename every identifier reference `oldName` to `newName`.
export function rename(program, oldName, newName) {
  const visitors = {
    Identifier(node) {
      if (node.name === oldName) node.name = newName;
    },
    // BUG: missing ObjectProperty visitor. Shorthand properties are
    // walked as regular nodes and both key+value get renamed, which is
    // wrong for `{ a }` → the key identifies the field and must stay.
  };
  walk(program, visitors);
  return program;
}
