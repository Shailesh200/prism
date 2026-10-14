import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPrune, planPrune, RECEIPTS_KEPT } from "./data-prune.js";

function write(path: string, body: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

const receipts = (n: number): string =>
  Array.from({ length: n }, (_, i) => JSON.stringify({ id: `r${i}` })).join(
    "\n",
  ) + "\n";

function library() {
  const home = mkdtempSync(join(tmpdir(), "prism-prune-"));
  const live = mkdtempSync(join(tmpdir(), "prism-prune-repo-"));
  const ws = (key: string) => join(home, "workspaces", key);

  // A live checkout with 25 receipts: the oldest 5 go, the rest stays.
  write(
    join(ws("live"), "hooks", "snapshot.json"),
    JSON.stringify({ workspace: live }),
  );
  write(join(ws("live"), "cache", "index.sqlite"), "index");
  write(join(ws("live"), "receipts", "history.jsonl"), receipts(25));

  // A checkout that was deleted: its cache goes, its receipts stay.
  write(
    join(ws("gone"), "hooks", "snapshot.json"),
    JSON.stringify({ workspace: join(live, "does-not-exist") }),
  );
  write(join(ws("gone"), "cache", "index.sqlite"), "old index");
  write(join(ws("gone"), "receipts", "history.jsonl"), receipts(1));

  // An empty folder.
  mkdirSync(join(ws("empty"), "cache"), { recursive: true });

  // No recorded root: kept.
  write(join(ws("unknown"), "cache", "index.sqlite"), "?");

  // Never candidates: lenses, config, ledger, prepare history.
  write(join(home, "lenses", "security.md"), "# lens");
  write(join(home, "config.json"), "{}");
  write(join(home, "envelope-ledger.jsonl"), "{}\n");
  write(join(home, "prepare-history.json"), "[]");
  return { home, ws };
}

describe("prism data prune (C-3)", () => {
  it("PRUNE-1: plans only empty folders, gone checkouts' caches, and receipts past the last 20", () => {
    const { home, ws } = library();
    const plan = planPrune(home).map((item) => [item.path, item.reason]);
    expect(plan).toEqual([
      [ws("empty"), "empty workspace folder"],
      [join(ws("gone"), "cache"), "checkout no longer on disk"],
      [
        join(ws("live"), "receipts", "history.jsonl"),
        "receipts beyond the last 20",
      ],
    ]);
  });

  it("PRUNE-2: --yes removes exactly the plan and keeps lenses, config, ledger and the last 20 receipts", () => {
    const { home, ws } = library();
    applyPrune(planPrune(home));
    expect(existsSync(ws("empty"))).toBe(false);
    expect(existsSync(join(ws("gone"), "cache"))).toBe(false);
    expect(existsSync(join(ws("gone"), "receipts", "history.jsonl"))).toBe(
      true,
    );
    const kept = readFileSync(
      join(ws("live"), "receipts", "history.jsonl"),
      "utf8",
    )
      .split("\n")
      .filter(Boolean);
    expect(kept).toHaveLength(RECEIPTS_KEPT);
    expect(JSON.parse(kept[0]!).id).toBe("r5");
    expect(existsSync(join(ws("live"), "cache", "index.sqlite"))).toBe(true);
    expect(existsSync(join(ws("unknown"), "cache", "index.sqlite"))).toBe(true);
    for (const file of [
      "lenses/security.md",
      "config.json",
      "envelope-ledger.jsonl",
      "prepare-history.json",
    ]) {
      expect(existsSync(join(home, file)), file).toBe(true);
    }
  });

  it("PRUNE-3: a second run after --yes plans nothing", () => {
    const { home } = library();
    applyPrune(planPrune(home));
    expect(planPrune(home)).toEqual([]);
  });
});
