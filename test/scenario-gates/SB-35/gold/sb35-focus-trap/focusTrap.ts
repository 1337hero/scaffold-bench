export function nextFocus(ids: string[], currentId: string, shiftKey: boolean): string | null {
  if (ids.length === 0) return null;
  const index = ids.indexOf(currentId);
  if (index === -1) return ids[0] ?? null;
  const delta = shiftKey ? -1 : 1;
  const target = (index + delta + ids.length) % ids.length;
  return ids[target] ?? null;
}
