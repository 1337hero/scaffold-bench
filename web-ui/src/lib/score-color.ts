export function scoreTextColor(pct: number): string {
  if (pct >= 70) return "text-green-main";
  if (pct >= 40) return "text-gold";
  return "text-red-main";
}

export function scoreBarColor(pct: number): string {
  if (pct === 100) return "bg-green-main";
  if (pct > 50) return "bg-gold";
  return "bg-red-main";
}
