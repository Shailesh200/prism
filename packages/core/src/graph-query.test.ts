import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderGraphReport } from "@repo-prism/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prism } from "./prism.js";
import type { PrismWorkspace } from "./workspace.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

const DASHBOARD = "src/features/dashboard/Dashboard.ts";
const AUTH = "packages/auth/src/index.ts";

let root: string;
let workspace: PrismWorkspace;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "prism-graph-query-"));
  await cp(FIXTURE, root, {
    recursive: true,
    filter: (source) => !source.includes("/.prism"),
  });
  const opened = Prism.create().openRepository(root);
  if (!opened.ok) throw new Error(opened.error.message);
  workspace = opened.value;
  const indexed = await workspace.index();
  if (!indexed.ok) throw new Error(indexed.error.message);
});

afterAll(async () => {
  workspace?.close();
  await rm(root, { recursive: true, force: true });
});

async function ask(...args: Parameters<PrismWorkspace["graph"]>) {
  const answer = await workspace.graph(...args);
  if (!answer.ok) throw new Error(answer.error.message);
  return answer.value;
}

describe("workspace.graph (M-096)", () => {
  it("finds a symbol by exact name, then by substring", async () => {
    const exact = await ask({ mode: "find", name: "renderDashboard" });
    expect(exact.nodes).toContainEqual({
      kind: "symbol",
      path: DASHBOARD,
      name: "renderDashboard",
      symbolKind: "function",
    });
    const fuzzy = await ask({ mode: "find", name: "Dashboard" });
    expect(fuzzy.nodes.some((node) => node.path === DASHBOARD)).toBe(true);
  });

  it("lists a file's imports and importers with measured provenance", async () => {
    const out = await ask({
      mode: "neighbors",
      target: { path: DASHBOARD },
      direction: "out",
    });
    expect(out.edges).toContainEqual({
      kind: "imports",
      from: DASHBOARD,
      to: AUTH,
      provenance: "measured",
    });
    const into = await ask({
      mode: "neighbors",
      target: { path: AUTH },
      direction: "in",
    });
    expect(
      into.edges.some(
        (edge) => edge.kind === "imported_by" && edge.from === DASHBOARD,
      ),
    ).toBe(true);
  });

  it("answers how A reaches B, and says so when nothing does", async () => {
    const reach = await ask({
      mode: "path",
      from: { path: DASHBOARD },
      to: { path: AUTH },
    });
    expect(reach.routes?.length).toBeGreaterThan(0);
    const none = await ask({
      mode: "path",
      from: { path: AUTH },
      to: { path: "src/routes/checkout/cart.ts" },
    });
    expect(none.routes).toEqual([]);
    expect(none.note).toMatch(/No import path/);
  });

  it("filters importers of a file", async () => {
    const answer = await ask({
      mode: "query",
      filter: "files_in_importing",
      target: AUTH,
      within: "src/features",
    });
    expect(answer.nodes.map((node) => node.path)).toEqual([DASHBOARD]);
  });

  it("explains a folder", async () => {
    const answer = await ask({
      mode: "explain",
      path: "src/features/dashboard",
    });
    expect(answer.explain).toBeDefined();
  });

  it("fits the budget and says when it cut", async () => {
    const answer = await ask({ mode: "find", name: "s" }, 200);
    expect(answer.tokenEstimate).toBeLessThanOrEqual(200);
    expect(answer.budget).toBe(200);
    if (answer.totalCount > answer.nodes.length + answer.edges.length) {
      expect(answer.truncated).toBe(true);
    }
  });

  it("exports a versioned graph and a report built from measured edges", async () => {
    const exported = await workspace.exportGraph();
    if (!exported.ok) throw new Error(exported.error.message);
    const { graph, report } = exported.value;
    expect(graph.version).toBe(1);
    expect(graph.nodes.some((n) => n.id === `file:${DASHBOARD}`)).toBe(true);
    expect(graph.edges).toContainEqual({
      kind: "imports",
      from: `file:${DASHBOARD}`,
      to: `file:${AUTH}`,
      provenance: "measured",
    });
    expect(graph.edges.every((e) => e.provenance)).toBe(true);
    expect(report.connected[0]?.path).toBeDefined();
    // widgets.ts and cart.ts import nothing and nothing imports them.
    expect(report.orphans).toEqual(
      expect.arrayContaining([
        "src/features/dashboard/widgets.ts",
        "src/routes/checkout/cart.ts",
      ]),
    );
    const markdown = renderGraphReport(report);
    expect(markdown).toContain("# Prism graph report");
    expect(markdown).toContain("`src/features/dashboard/widgets.ts`");
  });

  it("rejects a file that is not indexed", async () => {
    const answer = await workspace.graph({
      mode: "neighbors",
      target: { path: "nope.ts" },
    });
    expect(answer.ok).toBe(false);
  });
});
