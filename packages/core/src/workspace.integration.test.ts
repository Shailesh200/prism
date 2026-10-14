import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  typicalRepository,
  repositoryWithoutGit,
} from "@repo-prism/test-support";
import type { Fixture } from "@repo-prism/test-support";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prism } from "./prism.js";
import type { PrismWorkspace } from "./workspace.js";

/**
 * Behavioural coverage for the workspace methods that previously appeared only
 * in the API-surface inventory lock (M-037). That lock proves a method exists
 * and is spelled correctly; it says nothing about whether calling it does
 * anything. Everything here runs against a real repository on disk with real
 * git history, because most of these methods read one or both.
 */

let fixture: Fixture;
let workspace: PrismWorkspace;

beforeAll(async () => {
  fixture = await typicalRepository();
  const opened = Prism.create().openRepository(fixture.root);
  if (!opened.ok) throw new Error(`openRepository: ${opened.error.message}`);
  workspace = opened.value;

  const indexed = await workspace.index();
  if (!indexed.ok) throw new Error(`index: ${indexed.error.message}`);
}, 120_000);

afterAll(async () => {
  workspace?.close();
  await fixture?.cleanup();
});

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } },
): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("index freshness and watch", () => {
  it("reports a fresh index right after indexing", () => {
    const freshness = unwrap(workspace.getIndexFreshness());

    expect(freshness.status).toBe("fresh");
    expect(freshness.watching).toBe(false);
    expect(freshness.pendingDirtyCount).toBe(0);
    expect(freshness.lastIndexedAt).toBeTruthy();
  });

  it("refuses change notifications when nothing is watching", () => {
    // Accepting them silently would let a host push paths into a dirty set that
    // nothing is going to act on, and then wonder why the index never refreshes.
    const result = workspace.notifyWatchPaths({ changedPaths: ["src/a.ts"] });
    expect(result.ok).toBe(false);
  });

  it("goes stale when told a file changed, and names the file", () => {
    unwrap(workspace.startWatch({ debounceMs: 10_000 }));

    const changed = "src/features/cart.ts";
    unwrap(workspace.notifyWatchPaths({ changedPaths: [changed] }));

    const freshness = unwrap(workspace.getIndexFreshness());
    expect(freshness.status).toBe("stale");
    expect(freshness.pendingDirtyCount).toBe(1);
    expect(freshness.dirtyPaths).toContain(changed);
  });

  it("clears the dirty set by reindexing", async () => {
    unwrap(await workspace.reindex());

    const freshness = unwrap(workspace.getIndexFreshness());
    expect(freshness.status).toBe("fresh");
    expect(freshness.pendingDirtyCount).toBe(0);
    expect(freshness.dirtyPaths).toEqual([]);
  });

  it("stops watching without leaving the flag set", () => {
    expect(unwrap(workspace.getIndexFreshness()).watching).toBe(true);

    unwrap(workspace.stopWatch());
    expect(unwrap(workspace.getIndexFreshness()).watching).toBe(false);
  });

  it("tolerates stopping a watch that was never started", () => {
    // Idempotent stop matters: the extension calls it on every dispose, and a
    // host that throws on the second call takes the panel down with it.
    expect(workspace.stopWatch().ok).toBe(true);
    expect(workspace.stopWatch().ok).toBe(true);
  });
});

describe("git-derived answers", () => {
  it("reads activity from real history", () => {
    const activity = unwrap(workspace.getGitActivity());

    expect(activity.available).toBe(true);
    expect(activity.recentCommits.length).toBe(2);
    expect(activity.recentFiles.length).toBeGreaterThan(0);

    // The fixture is committed by two people on purpose, so that "who owns
    // this" has a real answer rather than a single name by construction.
    expect(activity.authors.map((a) => a.name).sort()).toEqual([
      "Fixture Author",
      "Second Author",
    ]);
  });

  it("reports no changed paths in a clean tree", () => {
    // Prism has indexed by now, so `.prism/` exists and is untracked. Its own
    // cache must not be reported as something the user changed.
    const changed = unwrap(workspace.getChangedPaths());
    expect(changed.paths).toEqual([]);
  });

  it("sees an uncommitted edit", async () => {
    await writeFile(
      join(fixture.root, "src/lib/format.ts"),
      "export function formatPrice(v: number): string { return `${v}`; }\n",
      "utf8",
    );

    const changed = unwrap(workspace.getChangedPaths());
    expect(changed.paths).toContain("src/lib/format.ts");

    fixture.git("checkout", "--", "src/lib/format.ts");
  });

  it("reviews a set of changed files", async () => {
    const review = unwrap(
      await workspace.reviewChanges({ paths: ["src/features/cart.ts"] }),
    );

    const reviewed = review.items.find(
      (i) => i.path === "src/features/cart.ts",
    );
    expect(reviewed).toBeDefined();
    expect(reviewed!.risk).toBeGreaterThanOrEqual(0);
    // cart.ts is imported by checkout.ts and covered by cart.test.ts, so a
    // review that finds neither is not reading the graph.
    expect(reviewed!.affectedFilesCount).toBeGreaterThan(0);
    expect(reviewed!.testsLikelyAffected.length).toBeGreaterThan(0);
  });

  it("returns an empty review for an empty change set rather than failing", async () => {
    const review = unwrap(await workspace.reviewChanges({ paths: [] }));
    expect(review.items).toEqual([]);
  });
});

describe("reports over a real repository", () => {
  it("explains a file in terms of what depends on it", async () => {
    const summary = unwrap(await workspace.explainArea("src/features/cart.ts"));

    expect(summary.path).toBe("src/features/cart.ts");
    expect(summary.summary.length).toBeGreaterThan(0);
    // cart.ts imports format.ts and is imported by checkout.ts and its test.
    expect(summary.dependencyDegree.out).toBeGreaterThan(0);
    expect(summary.dependencyDegree.in).toBeGreaterThan(0);
    expect(summary.owners.length).toBeGreaterThan(0);
  });

  it("recognises a test file as a test rather than as source", async () => {
    const summary = unwrap(
      await workspace.explainArea("src/features/cart.test.ts"),
    );
    expect(summary.fileRole).toBe("test");
  });

  it("explains a path that does not exist without throwing", async () => {
    const result = await workspace.explainArea("src/does-not-exist.ts");
    // Either an empty answer or a typed error; a crash is the only wrong result.
    if (result.ok) {
      expect(result.value.dependencyDegree).toEqual({ in: 0, out: 0 });
    } else {
      expect(result.error.code).toBeTruthy();
    }
  });
});

describe("a repository with no git history", () => {
  let plain: Fixture;
  let plainWorkspace: PrismWorkspace;

  beforeAll(async () => {
    plain = await repositoryWithoutGit();
    const opened = Prism.create().openRepository(plain.root);
    if (!opened.ok) throw new Error(opened.error.message);
    plainWorkspace = opened.value;
    unwrap(await plainWorkspace.index());
  }, 60_000);

  afterAll(async () => {
    plainWorkspace?.close();
    await plain?.cleanup();
    await rm(join(plain.root, ".prism"), { recursive: true, force: true });
  });

  // ADR-0029: absence has to look like absence. A zero here would render
  // identically to a measured zero and be read as a fact.
  it("says git is unavailable rather than reporting empty activity", () => {
    const activity = unwrap(plainWorkspace.getGitActivity());
    expect(activity.available).toBe(false);
  });

  it("says it cannot list changed paths, rather than reporting none", () => {
    // "No changes" and "there is no git here" are different facts, and a caller
    // that cannot tell them apart will render a clean-tree badge for a
    // repository it knows nothing about.
    const result = plainWorkspace.getChangedPaths();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/git/i);
  });

  it("still indexes and still answers structural questions", () => {
    const graph = unwrap(plainWorkspace.getDependencyGraph());
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
  });
});
