// Keyboard focus management for a modal dialog. Given the modal's focusable
// elements (in DOM order) and the currently focused id, `nextFocus` returns the
// id that Tab (or Shift+Tab) should move focus to. To trap focus inside the
// modal, Tab on the LAST element must wrap to the FIRST, and Shift+Tab on the
// FIRST must wrap to the LAST. Today it walks off the ends (returns null),
// letting focus escape the modal — an a11y trap violation.
export function nextFocus(ids: string[], currentId: string, shiftKey: boolean): string | null {
  if (ids.length === 0) return null;
  const index = ids.indexOf(currentId);
  if (index === -1) return ids[0] ?? null;
  const target = shiftKey ? index - 1 : index + 1;
  return ids[target] ?? null;
}
