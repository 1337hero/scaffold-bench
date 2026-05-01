import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  clearPreviousOneshot,
  getLatestOneshotRun,
  getOneshotResults,
  getOneshotRun,
  insertOneshotRun,
  updateOneshotRun,
  upsertOneshotResult,
} from "../../server/db/oneshot-queries.ts";
import { STUB_ONESHOT_DB_ENDPOINT } from "../_fixtures/endpoints.ts";

const SCHEMA_SQL = readFileSync(
  join(import.meta.dir, "../../server/db/oneshot-schema.sql"),
  "utf8"
);

function makeDb(): Database {
  const db = new Database(":memory:", { create: true });
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(SCHEMA_SQL);
  return db;
}

function withTestDb(fn: (db: Database) => void): void {
  const db = makeDb();
  try {
    fn(db);
  } finally {
    db.close();
  }
}

describe("oneshot DB queries", () => {
  test("insertOneshotRun + getLatestOneshotRun round-trip", () => {
    withTestDb((db) => {
      const runId = insertOneshotRun(
        {
          id: "run-abc",
          started_at: 1000,
          status: "running",
          model: "test-model",
          endpoint: STUB_ONESHOT_DB_ENDPOINT,
          prompt_ids: '["01","02"]',
        },
        db
      );
      expect(runId).toBe("run-abc");

      const latest = getLatestOneshotRun(db);
      expect(latest).not.toBeNull();
      expect(latest!.id).toBe("run-abc");
      expect(latest!.status).toBe("running");
      expect(latest!.model).toBe("test-model");
    });
  });

  test("getOneshotResults returns empty for unknown run", () => {
    withTestDb((db) => {
      const results = getOneshotResults("nonexistent", db);
      expect(results).toEqual([]);
    });
  });

  test("upsertOneshotResult + getOneshotResults", () => {
    withTestDb((db) => {
      insertOneshotRun(
        {
          id: "run-1",
          started_at: 2000,
          status: "running",
          model: "m1",
          endpoint: null,
          prompt_ids: '["01"]',
        },
        db
      );
      upsertOneshotResult(
        {
          run_id: "run-1",
          prompt_id: "01",
          started_at: 2000,
          status: "done",
          output: "Hello world",
          finish_reason: "stop",
          wall_time_ms: 5000,
          first_token_ms: 100,
          prompt_tokens: 20,
          completion_tokens: 50,
        },
        db
      );

      const results = getOneshotResults("run-1", db);
      expect(results).toHaveLength(1);
      expect(results[0].output).toBe("Hello world");
      expect(results[0].finish_reason).toBe("stop");
      expect(results[0].wall_time_ms).toBe(5000);
    });
  });

  test("upsertOneshotResult updates existing row", () => {
    withTestDb((db) => {
      insertOneshotRun(
        {
          id: "run-2",
          started_at: 3000,
          status: "running",
          model: null,
          endpoint: null,
          prompt_ids: '["01"]',
        },
        db
      );
      upsertOneshotResult({ run_id: "run-2", prompt_id: "01", status: "running" }, db);
      upsertOneshotResult(
        { run_id: "run-2", prompt_id: "01", status: "done", output: "Updated" },
        db
      );

      const results = getOneshotResults("run-2", db);
      expect(results[0].output).toBe("Updated");
      expect(results[0].status).toBe("done");
    });
  });

  test("clearPreviousOneshot removes all data", () => {
    withTestDb((db) => {
      insertOneshotRun(
        {
          id: "run-clear",
          started_at: 4000,
          status: "done",
          model: null,
          endpoint: null,
          prompt_ids: '["01"]',
        },
        db
      );
      upsertOneshotResult(
        { run_id: "run-clear", prompt_id: "01", status: "done", output: "data" },
        db
      );

      expect(getLatestOneshotRun(db)).not.toBeNull();
      expect(getOneshotResults("run-clear", db)).toHaveLength(1);

      clearPreviousOneshot(db);

      expect(getLatestOneshotRun(db)).toBeNull();
    });
  });

  test("ordering by started_at DESC returns most recent first", () => {
    withTestDb((db) => {
      insertOneshotRun(
        {
          id: "run-old",
          started_at: 100,
          status: "done",
          model: null,
          endpoint: null,
          prompt_ids: '["01"]',
        },
        db
      );
      insertOneshotRun(
        {
          id: "run-new",
          started_at: 200,
          status: "done",
          model: null,
          endpoint: null,
          prompt_ids: '["01"]',
        },
        db
      );

      const latest = getLatestOneshotRun(db);
      expect(latest!.id).toBe("run-new");
    });
  });

  test("getOneshotRun finds a specific run", () => {
    withTestDb((db) => {
      insertOneshotRun(
        {
          id: "run-specific",
          started_at: 5000,
          status: "running",
          model: "test",
          endpoint: "http://x",
          prompt_ids: '["01","02"]',
        },
        db
      );

      const run = getOneshotRun("run-specific", db);
      expect(run).not.toBeNull();
      expect(run!.id).toBe("run-specific");

      const missing = getOneshotRun("nonexistent", db);
      expect(missing).toBeNull();
    });
  });

  test("updateOneshotRun sets finished_at and status", () => {
    withTestDb((db) => {
      insertOneshotRun(
        {
          id: "run-update",
          started_at: 6000,
          status: "running",
          model: null,
          endpoint: null,
          prompt_ids: '["01"]',
        },
        db
      );

      updateOneshotRun("run-update", { status: "done", finished_at: 7000 }, db);

      const run = getOneshotRun("run-update", db);
      expect(run!.status).toBe("done");
      expect(run!.finished_at).toBe(7000);
    });
  });

  test("clearPreviousOneshot then insert gives clean slate", () => {
    withTestDb((db) => {
      insertOneshotRun(
        {
          id: "run-prior",
          started_at: 100,
          status: "done",
          model: null,
          endpoint: null,
          prompt_ids: '["01"]',
        },
        db
      );

      clearPreviousOneshot(db);

      const newId = insertOneshotRun(
        {
          id: "run-fresh",
          started_at: 200,
          status: "running",
          model: null,
          endpoint: null,
          prompt_ids: '["01"]',
        },
        db
      );
      expect(newId).toBe("run-fresh");
      expect(getLatestOneshotRun(db)!.id).toBe("run-fresh");
    });
  });
});
