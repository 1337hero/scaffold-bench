import { createClient, type User } from "./sdk";

// These call sites were written against SDK v1 and no longer type-check after
// the v2 upgrade described in sdk.ts. Fix them to the new API WITHOUT using
// `as any`, non-null assertions (`!`), `@ts-ignore`, or editing sdk.ts.

// v1 took positional args.
const client = createClient("my-api-key", "us");

export async function greet(id: string): Promise<string> {
  // v1 fetchUser was synchronous and never returned null.
  const user: User = client.fetchUser(id);
  return `Hello, ${user.name} <${user.email}>`;
}

export async function allEmails(): Promise<string[]> {
  const users = await client.listUsers();
  // v1 had a single `name` field.
  return users.map((u) => `${u.name}: ${u.email}`);
}
