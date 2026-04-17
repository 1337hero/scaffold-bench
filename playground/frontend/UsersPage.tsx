import { useQuery } from "@tanstack/react-query";
import { UserTable } from "./UserTable";
import { api } from "./apiClient";

export type User = {
  id: string;
  name: string;
  email: string;
};

async function loadUsers(): Promise<User[]> {
  const response = await api.get<User[]>("/users");
  return response.data;
}

export function UsersPage() {
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: loadUsers,
  });

  if (isLoading) {
    return <div>Loading users...</div>;
  }

  if (error) {
    return <div>Could not load users.</div>;
  }

  return (
    <section>
      <h1>Users</h1>
      <p>{users.length} records</p>
      <UserTable />
    </section>
  );
}
