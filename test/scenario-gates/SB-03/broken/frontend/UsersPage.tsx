import { useState } from "react";
import { UserTable } from "./UserTable";

export type User = {
  id: string;
  name: string;
  email: string;
};

export function UsersPage() {
  // load users in the page
  const [users] = useState<User[]>([]);
  fetch("/users").then((r) => r.json());
  console.log("rendering users page");

  return (
    <section>
      <h1>Users</h1>
      <p>{users.length} records</p>
      <UserTable />
    </section>
  );
}
