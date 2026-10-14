import { describe, expect, it } from "vitest";
import { openSqliteDatabase } from "./db.js";
import {
  isLegacySchema,
  migrate,
  readSchemaVersion,
  SCHEMA_VERSION,
} from "./migrations.js";

describe("SQLite schema (2.0 fresh v1)", () => {
  it("creates schema v1 with the generation marker on an empty database", () => {
    const db = openSqliteDatabase(":memory:");
    expect(migrate(db)).toBe(SCHEMA_VERSION);
    expect(readSchemaVersion(db)).toBe(1);
    expect(isLegacySchema(db)).toBe(false);
    const cols = db.prepare(`PRAGMA table_info(index_meta)`).all() as {
      name: string;
    }[];
    expect(cols.some((c) => c.name === "source")).toBe(true);
    db.close();
  });

  it("drops a 1.x cache (no generation marker) and rebuilds it, reporting the reset", () => {
    const db = openSqliteDatabase(":memory:");
    db.exec(`
      CREATE TABLE schema_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      INSERT INTO schema_meta (key, value) VALUES ('version', '3');
      CREATE TABLE legacy_rows (id INTEGER PRIMARY KEY, payload_json TEXT);
      CREATE TABLE index_meta (root_path TEXT PRIMARY KEY NOT NULL, repo_id TEXT NOT NULL);
    `);
    expect(isLegacySchema(db)).toBe(true);
    expect(readSchemaVersion(db)).toBe(0);
    let resets = 0;
    expect(migrate(db, { onLegacyReset: () => resets++ })).toBe(1);
    expect(resets).toBe(1);
    const health = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legacy_rows'`,
      )
      .get();
    expect(health).toBeUndefined();
    expect(migrate(db, { onLegacyReset: () => resets++ })).toBe(1);
    expect(resets).toBe(1);
    db.close();
  });
});
