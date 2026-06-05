// Simulates an upgraded third-party SDK (treat as a node_module — DO NOT EDIT).
// v2 made three breaking API changes vs the v1 your code was written against:
//   1. `createClient` now takes an options object, not positional args.
//   2. `client.fetchUser` returns `User | null` (was `User`) and is async.
//   3. The `User.name` field was split into `firstName` / `lastName`.

export interface ClientOptions {
  apiKey: string;
  region: "us" | "eu";
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface Client {
  fetchUser(id: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
}

export function createClient(options: ClientOptions): Client {
  void options;
  return {
    async fetchUser(id) {
      return { id, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" };
    },
    async listUsers() {
      return [];
    },
  };
}
