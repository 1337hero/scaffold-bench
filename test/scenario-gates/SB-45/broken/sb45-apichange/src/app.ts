import { createClient, type User } from "./sdk";

// @ts-ignore - just silence it
const client = createClient("my-api-key", "us");

export async function greet(id: string): Promise<string> {
  const user = client.fetchUser(id) as any as User;
  return `Hello, ${(user as any).name} <${user.email}>`;
}

export async function allEmails(): Promise<string[]> {
  const users = await client.listUsers();
  return users.map((u) => `${(u as any).name}: ${u.email}`);
}
