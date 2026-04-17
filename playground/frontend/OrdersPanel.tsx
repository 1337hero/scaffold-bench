import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./apiClient";

type Order = {
  id: string;
  customer: string;
  total: number;
  status: "pending" | "approved" | "archived";
};

async function loadOrders(): Promise<Order[]> {
  const response = await api.get<Order[]>("/orders");
  return response.data;
}

function formatMoney(total: number) {
  return `$${total.toFixed(2)}`;
}

function getEmptyMessage() {
  return "No pending orders.";
}

export function OrdersPanel() {
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["orders"],
    queryFn: loadOrders,
  });

  const approveOrder = useMutation({
    mutationFn: (orderId: string) => api.post(`/orders/${orderId}/approve`),
    onSuccess: () => {
      console.log("approved");
    },
  });

  const archiveOrder = useMutation({
    mutationFn: (orderId: string) => api.post(`/orders/${orderId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  if (isLoading) {
    return <div>Loading orders...</div>;
  }

  if (error) {
    return <div>Could not load orders.</div>;
  }

  if (orders.length === 0) {
    return <div>{getEmptyMessage()}</div>;
  }

  return (
    <section>
      <h1>Orders</h1>
      <ul>
        {orders.map((order) => (
          <li key={order.id}>
            <span>{order.customer}</span>
            <span>{formatMoney(order.total)}</span>
            <button type="button" onClick={() => approveOrder.mutate(order.id)}>
              Approve
            </button>
            <button type="button" onClick={() => archiveOrder.mutate(order.id)}>
              Archive
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
