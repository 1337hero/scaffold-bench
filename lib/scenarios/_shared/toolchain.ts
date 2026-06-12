export function hasTool(name: string): boolean {
  return Bun.which(name) !== null;
}
