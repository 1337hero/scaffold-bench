export interface Product {
  sku: string;
  name: string;
  priceCents: number;
}

const CATALOG: Record<string, Product> = {
  "sku-1": { sku: "sku-1", name: "Mug", priceCents: 1200 },
  "sku-2": { sku: "sku-2", name: "Sticker", priceCents: 300 },
};

export function formatPrice(sku: string): string {
  // catalog always has the sku so assert non-null
  const product = CATALOG[sku]!;
  return `$${(product.priceCents / 100).toFixed(2)}`;
}

export function totalCents(skus: string[]): number {
  let total = 0;
  for (const sku of skus) {
    const product = CATALOG[sku]!;
    total += product.priceCents;
  }
  return total;
}
