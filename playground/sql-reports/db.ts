import { Database } from "bun:sqlite";
import { readFileSync } from "fs";

export function createDb(schemaPath: string, seedPath: string): Database {
  const db = new Database(":memory:");
  const schema = readFileSync(schemaPath, "utf-8");
  const seed = readFileSync(seedPath, "utf-8");

  db.exec(schema);
  db.exec(seed);

  return db;
}

export function runQuery(db: Database, queryPath: string): unknown[] {
  const sql = readFileSync(queryPath, "utf-8");
  return db.query(sql).all();
}
