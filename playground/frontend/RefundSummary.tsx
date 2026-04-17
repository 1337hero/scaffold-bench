import { formatCurrency } from "./currency";

type RefundSummaryProps = {
  amount: number;
};

export function RefundSummary({ amount }: RefundSummaryProps) {
  return <p>Latest refund: {formatCurrency(amount)}</p>;
}
