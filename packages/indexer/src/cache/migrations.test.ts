import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate, readSchemaVersion, SCHEMA_VERSION } from "./migrations.js";

describe("SQLite migrations", () => {
  it("migrates v1 → v2 and exposes source column", () => {
    const db = new Database(":memory:");
    expect(migrate(db, { maxVersion: 1 })).toBe(1);
    expect(readSchemaVersion(db)).toBe(1);

    const colsV1 = db.prepare(`PRAGMA table_info(index_meta)`).all() as {
      name: string;
    }[];
    expect(colsV1.some((c) => c.name === "source")).toBe(false);

    expect(migrate(db)).toBe(SCHEMA_VERSION);
    expect(readSchemaVersion(db)).toBe(2);

    const colsV2 = db.prepare(`PRAGMA table_info(index_meta)`).all() as {
      name: string;
    }[];
    expect(colsV2.some((c) => c.name === "source")).toBe(true);
    db.close();
  });
});
