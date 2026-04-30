/**
 * Parse quantization tag from model filename.
 * Matches patterns like Q4_K_M, Q8_0, BF16, F16, FP8, MXFP4_MOE, Q3_K_M, etc.
 */
export function parseQuantTag(filename: string): string | null {
  const match = filename.match(
    /(BF16|F16|MXFP4_MOE|MXFP4|Q\d+_\d+|Q\d+_K_[A-Z]+|Q\d+_K|FP8)/i
  );
  return match ? match[1] : null;
}

/**
 * Derive a numeric tier from a quant tag for sorting.
 * Higher = more precision.
 */
export function quantTagToTier(quant: string | null): number | null {
  if (!quant) return null;
  const upper = quant.toUpperCase();
  if (upper === "BF16" || upper === "F16") return 16;
  if (upper === "FP8") return 8;
  if (upper.startsWith("Q8")) return 8;
  if (upper === "MXFP4_MOE") return 4.5;
  if (upper === "MXFP4") return 4;
  const qMatch = upper.match(/Q(\d+)/);
  if (qMatch) return parseInt(qMatch[1], 10);
  return null;
}

/**
 * Detect whether a quant was repacked from a higher precision.
 * Heuristic: filename contains "from-" like "from-Q8_0.Q4_K_M"
 */
export function detectQuantSource(filename: string): "native" | "requantized" | "unknown" {
  if (/from-/i.test(filename)) return "requantized";
  if (parseQuantTag(filename) !== null) return "native";
  return "unknown";
}
