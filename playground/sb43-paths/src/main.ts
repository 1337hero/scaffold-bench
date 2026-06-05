import { add, clamp } from "@utils/math";

export function compute(values: number[]): number {
  const total = values.reduce((acc, v) => add(acc, v), 0);
  return clamp(total, 0, 100);
}
