// Extracted from @babel/helpers permuteHelperAST — the rename logic that
// makes a helper's internal function names unique within its destination
// module. The helper has an outer identifier `id` (e.g. "_set") and a set
// of internal local binding names (e.g. ["set"]). The caller provides
// `localBindings` — names already taken in the destination scope.
//
// BUG: the helper's own id.name is NOT added to the taken-names set.
// When a local binding needs to be renamed to dodge a caller-visible
// collision, the collision-avoidance loop can pick the helper's OWN name
// as the new name, producing an infinite-recursion shape at runtime.
//
// Example: helper `set` is already being imported as `_set`
// (id.name = "_set"). The helper's body declares a local `set` function.
// localBindings = [] (nothing in caller scope). The rename loop sees
// `set` not in bindings, leaves it as `set`. But then a SECOND pass adds
// `set` to localBindings and asks to rename again because user code has
// `let set`; now `set` -> `_set` which collides with the helper id.
//
// Simplified reproduction: given a helper id "_set" and an internal
// local "_set" (already pre-renamed once), with caller bindings ["set"],
// the correct output maps the local to "__set" (double-underscore),
// not "_set" (which would shadow the helper's own entrypoint).

// Compute a rename map for helper locals given the outer helper id
// and the set of names already bound in the caller's scope.
export function permuteHelper(id, localBindingNames, localBindings) {
  const toRename = {};
  const bindings = new Set(localBindings || []);

  // BUG: missing `bindings.add(id.name)` here — the helper's own name
  // isn't reserved, so the dodge-loop may collide with it.

  localBindingNames.forEach((name) => {
    let newName = name;
    while (bindings.has(newName)) newName = "_" + newName;
    if (newName !== name) toRename[name] = newName;
    bindings.add(newName);
  });

  return toRename;
}
