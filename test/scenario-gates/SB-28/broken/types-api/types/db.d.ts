// AUTO-GENERATED — DO NOT EDIT
// Source: prisma/schema.prisma

export interface UserRow {
  id: number;
  email: string;
  createdAt: Date;
}

export interface OrderRow {
  id: number;
  userId: number;
  total: number;
  status: "pending" | "shipped" | "cancelled";
  statusLabel: string;
}
