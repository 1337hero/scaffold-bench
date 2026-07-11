// Shared SVG-chart helpers — palette, model→color hashing, and endpoint-label
// layout used by the report charts.

export const PALETTE = [
  "#40a02b",
  "#1e66f5",
  "#8839ef",
  "#d20f39",
  "#e8590c",
  "#0a9396",
  "#9b59b6",
  "#b5651d",
  "#1e9e8e",
  "#c01a48",
  "#3a5a40",
  "#5b3a8c",
];

export function colorFor(model: string): string {
  let h = 0;
  for (let i = 0; i < model.length; i++) h = (h * 31 + model.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export type EndpointLabel = {
  model: string;
  color: string;
  x: number;
  y: number;
  side: "left" | "right";
  labelY: number;
};

// Place labels at each line's endpoint, nudging them apart vertically so lines
// that end near the same point don't stack into an unreadable pile. Endpoints
// near the right edge get labeled leftward so text stays on-canvas.
export function layoutEndpointLabels(
  items: Array<{ model: string; color: string; x: number; y: number }>,
  minY: number,
  maxY: number,
  width: number
): EndpointLabel[] {
  const MIN_GAP = 12;
  const rightThreshold = width - 140;
  const withSide: EndpointLabel[] = items.map((it) => ({
    ...it,
    side: it.x > rightThreshold ? "left" : "right",
    labelY: it.y,
  }));
  for (const side of ["left", "right"] as const) {
    const group = withSide.filter((i) => i.side === side).sort((a, b) => a.labelY - b.labelY);
    for (let i = 1; i < group.length; i++) {
      if (group[i].labelY - group[i - 1].labelY < MIN_GAP)
        group[i].labelY = group[i - 1].labelY + MIN_GAP;
    }
    const overflow = group.length ? group[group.length - 1].labelY - maxY : 0;
    if (overflow > 0) for (const g of group) g.labelY = Math.max(minY, g.labelY - overflow);
  }
  return withSide;
}
