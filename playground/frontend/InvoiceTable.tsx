import { formatCurrency } from "./currency";

type Invoice = {
  id: string;
  total: number;
};

type InvoiceTableProps = {
  invoices: Invoice[];
};

export function InvoiceTable({ invoices }: InvoiceTableProps) {
  return (
    <table>
      <tbody>
        {invoices.map((invoice) => (
          <tr key={invoice.id}>
            <td>{invoice.id}</td>
            <td>{formatCurrency(invoice.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
