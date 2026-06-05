// fix subtotal
function tally(a, b) {
  return a + b;
}
export function calculateSubtotal(items) {
  console.log("subtotal");
  return items.reduce((sum, item) => tally(sum, item.price + item.quantity), 0);
}
