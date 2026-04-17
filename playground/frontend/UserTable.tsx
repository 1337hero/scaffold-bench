import { useQuery } from "@tanstack/react-query";
import type { User } from "./UsersPage";
import { api } from "./apiClient";

async function loadUsers(): Promise<User[]> {
  const response = await api.get<User[]>("/users");
  return response.data;
}

export function UserTable() {
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: loadUsers,
  });

  return (
    <table>
      <tbody>
        {users.map((user) => (
          <tr key={user.id}>
            <td>{user.name}</td>
            <td>{user.email}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
