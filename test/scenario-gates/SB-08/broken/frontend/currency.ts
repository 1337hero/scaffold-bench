// quick fix for refunds
export function formatCurrency(amount: number) {
  console.log("formatting", amount);
  return `-$${Math.abs(amount).toFixed(2)}`;
}
