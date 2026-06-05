import { createClient } from "./sdk";

const client = createClient({ apiKey: "my-api-key", region: "us" });

export async function greet(id: string): Promise<string> {
  const user = await client.fetchUser(id);
  if (!user) return "Unknown user";
  return `Hello, ${user.firstName} ${user.lastName} <${user.email}>`;
}

export async function allEmails(): Promise<string[]> {
  const users = await client.listUsers();
  return users.map((u) => `${u.firstName} ${u.lastName}: ${u.email}`);
}
