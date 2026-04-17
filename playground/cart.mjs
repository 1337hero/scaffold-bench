export function calculateSubtotal(items) {
  return items.reduce((sum, item) => sum + item.price + item.quantity, 0);
}
