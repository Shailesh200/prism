import { SCHEMA_VERSION } from "./migrations.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isSqliteDriverError,
  openIndexCache,
  openSqliteDatabase,
} from "./db.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("isSqliteDriverError", () => {
  it("treats a missing native module as a driver problem, not corruption", () => {
    expect(
      isSqliteDriverError(new Error("Cannot find module 'better-sqlite3'")),
    ).toBe(true);
    expect(
      isSqliteDriverError(
        new Error(
          "was compiled against a different Node.js version using NODE_MODULE_VERSION 131",
        ),
      ),
    ).toBe(true);
    expect(isSqliteDriverError(new Error("SQLite quick_check failed"))).toBe(
      false,
    );
  });
});

describe("openSqliteDatabase", () => {
  it("opens an in-memory database", () => {
    const db = openSqliteDatabase(":memory:");
    const row = db.prepare("select 1 as ok").get() as { ok: number };
    expect(row.ok).toBe(1);
    db.close();
  });
});

describe("openIndexCache", () => {
  it("creates index.sqlite when the cache folder is empty", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-cache-"));
    temps.push(root);
    const opened = await openIndexCache(root);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.schemaVersion).toBe(SCHEMA_VERSION);
    opened.value.close();
  });

  // Was a hard-coded checkout path, which failed in any other copy and wrote
  // into the repo's own cache (round 4 fresh-copy QA). A temp workspace is
  // created, closed and opened again, which is the case that test covered.
  it("reopens an existing workspace cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-cache-"));
    temps.push(root);
    const first = await openIndexCache(root);
    if (!first.ok) throw new Error(first.error.message);
    first.value.close();

    const opened = await openIndexCache(root);
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    expect(opened.value.schemaVersion).toBe(SCHEMA_VERSION);
    opened.value.close();
  });
});
