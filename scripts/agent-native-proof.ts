#!/usr/bin/env bun
/**
 * Agent-native proof probes (T0–T3). Exit 0 at T0 (records lies).
 * After Phase 1, `--expect-honest` fails if search_symbols still lies.
 *
 *   bun scripts/agent-native-proof.ts --tag T0 --workspace <abs>
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVerifyPlan } from "../packages/checks/src/verify.ts";
import {
  buildKnowledgeGraph,
  searchSymbols,
  SEARCH_SYMBOLS_MAX,
} from "../packages/intelligence/src/semantic/build.ts";
import type { IndexSnapshot } from "../packages/shared/src/index.ts";
import { TOOL_NAMES } from "../packages/mcp-server/src/tools.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const fixtures = join(repoRoot, "packages/checks/fixtures");

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  const next = i >= 0 ? process.argv[i + 1] : undefined;
  return next && !next.startsWith("-") ? next : fallback;
}

function analyzed(
  path: string,
  symbols: IndexSnapshot["files"][number]["symbols"],
): IndexSnapshot["files"][number] {
  return {
    path,
    pluginId: "typescript",
    contentHash: "h",
    status: "analyzed",
    symbols,
    imports: [],
    exports: [],
    references: [],
    diagnostics: [],
  };
}

function pipeProbe() {
  const symbols = Array.from({ length: 60 }, (_, i) => ({
    name: `item${i}`,
    kind: "function" as const,
    start: i * 10,
    end: i * 10 + 4,
    exported: true,
  }));
  const kg = buildKnowledgeGraph({
    repoId: "repo:proof",
    rootPath: repoRoot,
    indexedAt: "2026-09-11T00:00:00.000Z",
    files: [analyzed("many.ts", symbols)],
    stats: {
      filesTotal: 1,
      filesIndexed: 1,
      filesSkipped: 0,
      durationMs: 0,
    },
    warnings: [],
  });
  const found = searchSymbols(kg, { pattern: "e", limit: SEARCH_SYMBOLS_MAX });
  return {
    items: found.items.length,
    totalCount: found.totalCount,
    truncated: found.items.length < found.totalCount,
    limit: SEARCH_SYMBOLS_MAX,
  };
}

const tag = arg("--tag", "T0");
const workspace = arg("--workspace", repoRoot);
const expectHonest = process.argv.includes("--expect-honest");

const pipe = pipeProbe();
const verifyThis = await resolveVerifyPlan(workspace);
const verifyLint = await resolveVerifyPlan(join(fixtures, "verify-lint-only"));
const verifyNone = await resolveVerifyPlan(join(fixtures, "verify-none"));

const report = {
  tag,
  capturedAt: new Date().toISOString(),
  workspace,
  pipe,
  verify: {
    thisRepo: {
      source: verifyThis.source,
      steps: verifyThis.steps.map((step) => step.name),
    },
    lintOnly: verifyLint.steps.map((step) => step.name),
    none: verifyNone.steps.map((step) => step.name),
  },
  capabilities: {
    prepare_change: TOOL_NAMES.includes("prepare_change"),
    guard_session: TOOL_NAMES.includes("guard_session"),
    queue_finding: TOOL_NAMES.includes("queue_finding"),
    working_set: TOOL_NAMES.includes("working_set"),
    agents_md: TOOL_NAMES.includes("agents_md"),
    work_order: TOOL_NAMES.includes("work_order"),
  },
  irisChecklist: [
    "#/iris has no RepositoryMapView",
    "Repos filter above Envelope",
    "empty ledger copy is not 0%",
  ],
};

const outDir = join(repoRoot, "plans/notes/proof");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${tag}.json`);
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`wrote ${outPath}`);

if (expectHonest) {
  if (!pipe.truncated || pipe.totalCount <= pipe.items) {
    console.error("expected honest truncation (totalCount > items)");
    process.exit(1);
  }
  if (verifyLint.steps.map((step) => step.name).join() !== "lint") {
    console.error("expected lint-only plan");
    process.exit(1);
  }
  if (verifyNone.steps.length !== 0) {
    console.error("expected empty plan for verify-none");
    process.exit(1);
  }
}
