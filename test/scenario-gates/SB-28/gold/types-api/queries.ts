import type { OrderRow, UserRow } from "./types/db.js";

export type OrderWithLabel = Pick<OrderRow, 'id' | 'userId' | 'total' | 'status'> & {
  statusLabel: string;
};

export function getOrdersForUser(userId: number): Promise<OrderWithLabel[]> {
  // Implementation would query the database
  return Promise.resolve([]);
}

export function getUserById(id: number): Promise<UserRow | null> {
  // Implementation would query the database
  return Promise.resolve(null);
}
