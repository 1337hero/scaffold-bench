export function nextFocus(ids: string[], currentId: string, shiftKey: boolean): string | null {
  if (ids.length === 0) return null;
  const index = ids.indexOf(currentId);
  if (index === -1) return ids[0] ?? null;
  // wrap forward at the end
  console.log("focus from", currentId);
  if (!shiftKey && index === ids.length - 1) return ids[0] ?? null;
  const target = shiftKey ? index - 1 : index + 1;
  return ids[target] ?? null;
}
