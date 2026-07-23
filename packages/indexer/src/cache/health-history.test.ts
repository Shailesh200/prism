import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "./migrations.js";
import {
  appendHealthHistory,
  hasHealthHistorySha,
  listHealthHistory,
  type HealthHistoryPayload,
} from "./health-history.js";

function samplePayload(
  at: string,
  score: number,
  sha?: string,
): HealthHistoryPayload {
  return {
    health: {
      at,
      score,
      ...(sha ? { commitSha: sha } : {}),
      factors: [{ id: "coupling", score }],
    },
    regions: {
      at,
      ...(sha ? { commitSha: sha } : {}),
      regions: [
        { id: "feat:a", label: "A", score: score - 5, files: 3 },
        { id: "feat:b", label: "B", score: score + 5, files: 2 },
      ],
    },
  };
}

describe("health_history store", () => {
  it("appends and lists chronological points", () => {
    const db = new Database(":memory:");
    migrate(db);

    expect(
      appendHealthHistory(
        db,
        "/repo",
        samplePayload("2026-01-01T00:00:00.000Z", 70, "aaa"),
      ),
    ).toBe(true);
    expect(
      appendHealthHistory(
        db,
        "/repo",
        samplePayload("2026-02-01T00:00:00.000Z", 80, "bbb"),
      ),
    ).toBe(true);
    // Duplicate sha skipped
    expect(
      appendHealthHistory(
        db,
        "/repo",
        samplePayload("2026-03-01T00:00:00.000Z", 90, "aaa"),
      ),
    ).toBe(false);

    expect(hasHealthHistorySha(db, "/repo", "aaa")).toBe(true);
    expect(hasHealthHistorySha(db, "/repo", "zzz")).toBe(false);

    const listed = listHealthHistory(db, "/repo");
    expect(listed).toHaveLength(2);
    expect(listed[0]?.health.score).toBe(70);
    expect(listed[1]?.health.score).toBe(80);

    const since = listHealthHistory(db, "/repo", {
      since: "2026-01-15T00:00:00.000Z",
    });
    expect(since).toHaveLength(1);
    expect(since[0]?.health.commitSha).toBe("bbb");

    db.close();
  });
});
