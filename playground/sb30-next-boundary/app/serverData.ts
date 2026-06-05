import "server-only";

// Server-only: reads a secret from the environment. Must never be imported into
// a Client Component, or the secret leaks into the browser bundle.
export function getApiSecret(): string {
  return process.env.INTERNAL_API_SECRET ?? "";
}

export async function getUserName(): Promise<string> {
  return "Ada Lovelace";
}
