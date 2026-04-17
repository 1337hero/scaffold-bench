import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type DB = Database;

export function createDb(path: string = ":memory:"): DB {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON");
  const schema = readFileSync(join(import.meta.dir, "..", "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}
