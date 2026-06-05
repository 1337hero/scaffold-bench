// Maps a viewport width (px) to the number of product-grid columns. The design
// breakpoints are:
//   <  640         -> 1 column   (mobile)
//   >= 640, < 1024 -> 2 columns  (tablet)
//   >= 1024, <1280 -> 3 columns  (small desktop)
//   >= 1280        -> 4 columns  (large desktop)
// After a recent refactor, tablets render the wrong column count: the boundaries
// are off, so 640px and 1023px don't both land on 2 columns and 1024 doesn't
// flip to 3. Fix the breakpoint logic to match the design exactly.
export function gridColumns(width: number): number {
  if (width < 640) return 1;
  if (width <= 1024) return 2;
  if (width < 1280) return 3;
  return 4;
}
