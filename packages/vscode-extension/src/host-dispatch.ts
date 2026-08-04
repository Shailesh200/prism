import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismGitignoreStatus } from "@prism/app-shell";
import { stageDevopsRemote } from "@prism/core";
import type {
  MapLayerId,
  MapZoomLevel,
  TestingReport,
  TestingTestResult,
  TestingTestStatus,
} from "@prism/shared";
import type * as vscode from "vscode";
import { applyRenameOnDisk, applyWorkspaceRename } from "./apply-rename.js";
import type {
  HostRequest,
  HostResponse,
  RunTestsOptions,
  TestListResult,
} from "./protocol.js";
import type { PrismSession } from "./session.js";

type TestListFile = TestListResult["files"][number];
type TestListItem = TestListFile["tests"][number];

const PRISM_GITIGNORE_PATTERNS = new Set([
  ".prism",
  ".prism/",
  "/.prism",
  "/.prism/",
  ".prism/**",
  "**/.prism",
]);

/**
 * Local-only check for whether the workspace's `.prism` folder is gitignored.
 * Prefers `git check-ignore` (respects nested + global ignores); falls back to
 * reading the root `.gitignore`. Returns `ignored: null` when undeterminable.
 */
export function checkPrismGitignore(root: string | null): PrismGitignoreStatus {
  if (!root) return { ignored: null };
  try {
    execFileSync("git", ["check-ignore", "-q", "--", ".prism"], {
      cwd: root,
      stdio: "ignore",
    });
    return { ignored: true, detail: "git check-ignore" };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) {
      return { ignored: false, detail: "git check-ignore" };
    }
    // git missing / not a repo → fall back to reading .gitignore.
  }
  try {
    const gitignore = join(root, ".gitignore");
    if (!existsSync(gitignore)) return { ignored: false };
    const ignored = readFileSync(gitignore, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .some((line) => PRISM_GITIGNORE_PATTERNS.has(line));
    return { ignored, detail: ".gitignore" };
  } catch {
    return { ignored: null };
  }
}

/** Append `.prism/` to the workspace root `.gitignore` when missing. */
export function addPrismToGitignore(root: string | null): PrismGitignoreStatus {
  if (!root) return { ignored: null, detail: "no workspace" };
  const status = checkPrismGitignore(root);
  if (status.ignored === true) return status;

  const gitignorePath = join(root, ".gitignore");
  let existing = "";
  try {
    if (existsSync(gitignorePath)) {
      existing = readFileSync(gitignorePath, "utf8");
      const already = existing
        .split(/\r?\n/)
        .map((line) => line.trim())
        .some((line) => PRISM_GITIGNORE_PATTERNS.has(line));
      if (already) {
        return { ignored: true, detail: ".gitignore" };
      }
    }
  } catch {
    return { ignored: false, detail: "could not read .gitignore" };
  }

  const needsNewline = existing.length > 0 && !existing.endsWith("\n");
  const block = `${needsNewline ? "\n" : ""}${
    existing.length > 0 ? "\n" : ""
  }# Prism local cache\n.prism/\n`;
  try {
    writeFileSync(gitignorePath, `${existing}${block}`, "utf8");
  } catch {
    return { ignored: false, detail: "could not write .gitignore" };
  }
  return checkPrismGitignore(root);
}

export type HostDispatchState = {
  zoom: MapZoomLevel;
  layers: MapLayerId[];
};

export type HostDispatchOptions = {
  /** VS Code API — required for workspace file writes (applyRename). */
  readonly vscodeApi?: typeof vscode;
  /** Forward utility-job progress (Lighthouse lab console + progressive CWV). */
  readonly onProgress?: (event: {
    message: string;
    detail?: import("@prism/shared").JsonValue;
  }) => void;
};

/**
 * Shared Core RPC used by the IDE webview host and the browser bridge.
 */
export async function dispatchHostRequest(
  session: PrismSession,
  req: HostRequest,
  state: HostDispatchState,
  options: HostDispatchOptions = {},
): Promise<HostResponse> {
  switch (req.method) {
    case "dashboard": {
      const result = await session.getDashboard(state.zoom);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "dashboard",
        data: result.value,
      };
    }
    case "map": {
      state.zoom = req.zoom;
      if (req.layers) state.layers = req.layers;
      const result = session.getMap(req.zoom, req.layers);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "map", data: result.value };
    }
    case "reindex": {
      const result = await session.reindex();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "reindex", data: null };
    }
    case "overlay": {
      const result = await session.getOverlay(req.kind);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "overlay", data: result.value };
    }
    case "backend": {
      const result = await session.getBackendReport();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "backend", data: result.value };
    }
    case "testing": {
      const result = await session.getTestingReport();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "testing", data: result.value };
    }
    case "security": {
      const result = await session.getSecurityReport();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "security", data: result.value };
    }
    case "ingestCoverage": {
      const result = await session.ingestCoverageFromWorkspace();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "ingestCoverage",
        data: result.value,
      };
    }
    case "runTests": {
      const data = await runWorkspaceTests(session, {
        ...(req.coverage === true ? { coverage: true } : {}),
        ...(typeof req.path === "string" && req.path.trim()
          ? { path: req.path.trim() }
          : {}),
        ...(typeof req.testNamePattern === "string" &&
        req.testNamePattern.trim()
          ? { testNamePattern: req.testNamePattern.trim() }
          : {}),
      });
      return { id: req.id, ok: true, method: "runTests", data };
    }
    case "listTests": {
      const data = await listWorkspaceTests(session);
      return { id: req.id, ok: true, method: "listTests", data };
    }
    case "graph": {
      const result = session.getDependencyGraph();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "graph", data: result.value };
    }
    case "impact": {
      const result = await session.getImpact(req.target);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "impact", data: result.value };
    }
    case "symbols": {
      const result = session.findSymbols(req.query);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return { id: req.id, ok: true, method: "symbols", data: result.value };
    }
    case "healthHistory": {
      const result = await session.getHealthHistory();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "healthHistory",
        data: result.value,
      };
    }
    case "regionMovers": {
      const result = await session.getRegionMovers();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "regionMovers",
        data: result.value,
      };
    }
    case "healthHistoryBackfill": {
      const result = await session.startHealthHistoryBackfill();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "healthHistoryBackfill",
        data: null,
      };
    }
    case "healthHistoryBackfillStatus": {
      const result = session.getHealthHistoryBackfillStatus();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "healthHistoryBackfillStatus",
        data: result.value,
      };
    }
    case "engineeringHealth": {
      const result = await session.getEngineeringHealth();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "engineeringHealth",
        data: result.value,
      };
    }
    case "codeExplorer": {
      const result = await session.exploreCode(req.target);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "codeExplorer",
        data: result.value,
      };
    }
    case "prismGitignore": {
      return {
        id: req.id,
        ok: true,
        method: "prismGitignore",
        data: checkPrismGitignore(session.root),
      };
    }
    case "addPrismGitignore": {
      return {
        id: req.id,
        ok: true,
        method: "addPrismGitignore",
        data: addPrismToGitignore(session.root),
      };
    }
    case "gitFetch": {
      const root = session.root;
      if (!root) {
        return {
          id: req.id,
          ok: true,
          method: "gitFetch",
          data: { ok: false, error: "No workspace open" },
        };
      }
      const result = await runCommand("git", ["fetch", "--prune"], root);
      if (result.code !== 0) {
        const detail =
          result.stderr.trim() ||
          result.stdout.trim() ||
          `git fetch exited ${result.code}`;
        return {
          id: req.id,
          ok: true,
          method: "gitFetch",
          data: { ok: false, error: detail },
        };
      }
      return {
        id: req.id,
        ok: true,
        method: "gitFetch",
        data: { ok: true },
      };
    }
    case "lighthouseLab": {
      const result = await session.runLighthouseLab({
        ...(req.mode ? { mode: req.mode } : {}),
        ...(req.url ? { url: req.url } : {}),
        ...(req.port !== undefined ? { port: req.port } : {}),
        ...(req.routes && req.routes.length > 0 ? { routes: req.routes } : {}),
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      });
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "lighthouseLab",
        data: result.value,
      };
    }
    case "detectBundleAnalyze": {
      const result = await session.detectBundleAnalyzeCapability(
        req.packageId ? { packageId: req.packageId } : undefined,
      );
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "detectBundleAnalyze",
        data: result.value,
      };
    }
    case "bundleAnalyze": {
      const result = await session.runBundleAnalyze({
        ...(req.mode ? { mode: req.mode } : {}),
        ...(req.packageId ? { packageId: req.packageId } : {}),
        ...(req.packagePath ? { packagePath: req.packagePath } : {}),
        ...(req.scriptName ? { scriptName: req.scriptName } : {}),
        ...(req.reportPath ? { reportPath: req.reportPath } : {}),
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      });
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "bundleAnalyze",
        data: result.value,
      };
    }
    case "frontendRoutes": {
      const result = session.discoverFrontendRoutes();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "frontendRoutes",
        data: result.value,
      };
    }
    case "applyRename": {
      const root = session.root;
      if (!root) {
        return { id: req.id, ok: false, error: "No workspace open" };
      }
      const data = options.vscodeApi
        ? await applyWorkspaceRename(options.vscodeApi, root, req.input)
        : await applyRenameOnDisk(root, req.input);
      return { id: req.id, ok: true, method: "applyRename", data };
    }
    case "reviewChanges": {
      const result = await session.reviewChanges(req.paths, req.base);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "reviewChanges",
        data: result.value,
      };
    }
    case "explainArea": {
      const result = await session.explainArea(req.path);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "explainArea",
        data: result.value,
      };
    }
    case "listBookmarks": {
      const result = await session.listBookmarks();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "listBookmarks",
        data: result.value,
      };
    }
    case "saveBookmark": {
      const result = await session.saveBookmark(req.input);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "saveBookmark",
        data: result.value,
      };
    }
    case "removeBookmark": {
      const result = await session.removeBookmark(req.bookmarkId);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "removeBookmark",
        data: result.value,
      };
    }
    case "listPackages": {
      const result = await session.listPackages();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "listPackages",
        data: result.value,
      };
    }
    case "selectPackage": {
      const result = await session.selectPackage(req.packageId);
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "selectPackage",
        data: result.value,
      };
    }
    case "stageDevopsRemote": {
      const root = session.root;
      if (!root) {
        return { id: req.id, ok: false, error: "No workspace open" };
      }
      const result = await stageDevopsRemote({
        workspaceRoot: root,
        owner: req.owner,
        repo: req.repo,
        ...(req.token ? { token: req.token } : {}),
      });
      if (!result.ok) {
        return { id: req.id, ok: false, error: result.error };
      }
      return {
        id: req.id,
        ok: true,
        method: "stageDevopsRemote",
        data: result.value,
      };
    }
    default: {
      return {
        id: (req as HostRequest).id,
        ok: false,
        error: "Unknown method",
      };
    }
  }
}

type CommandResult = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

/** Spawn a local command; never rejects — non-zero exits are returned as `code`. */
function runCommand(
  cmd: string,
  args: readonly string[],
  cwd: string,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      [...args],
      {
        cwd,
        maxBuffer: 32 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
        env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
      },
      (error, stdout, stderr) => {
        const out = typeof stdout === "string" ? stdout : String(stdout ?? "");
        const err = typeof stderr === "string" ? stderr : String(stderr ?? "");
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({ code: -1, stdout: out, stderr: err || "ENOENT" });
          return;
        }
        const code =
          error && typeof (error as { code?: unknown }).code === "number"
            ? (error as { code: number }).code
            : error
              ? 1
              : 0;
        resolve({ code, stdout: out, stderr: err });
      },
    );
  });
}

function detectPackageManager(root: string): { cmd: string; args: string[] } {
  if (
    existsSync(join(root, "bun.lock")) ||
    existsSync(join(root, "bun.lockb"))
  ) {
    return { cmd: "bun", args: ["run", "test"] };
  }
  if (existsSync(join(root, "pnpm-lock.yaml"))) {
    return { cmd: "pnpm", args: ["test"] };
  }
  if (existsSync(join(root, "yarn.lock"))) {
    return { cmd: "yarn", args: ["test"] };
  }
  return { cmd: "npm", args: ["test", "--"] };
}

/** True when package.json defines a `scripts.test` entry. */
function hasPackageTestScript(root: string): boolean {
  try {
    const raw = readFileSync(join(root, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    const test = pkg.scripts?.test;
    return typeof test === "string" && test.trim().length > 0;
  } catch {
    return false;
  }
}

/** ENOENT (-1) or shell "command not found" (127) → try the next runner. */
function isMissingRunner(code: number): boolean {
  return code === -1 || code === 127;
}

function relPath(absOrRel: string, root: string): string {
  let file = absOrRel;
  if (file.startsWith(root)) {
    file = file.slice(root.length).replace(/^[\\/]/, "");
  }
  return file.replace(/\\/g, "/");
}

function mapJestStatus(status: string | undefined): TestingTestStatus {
  switch (status) {
    case "passed":
      return "passing";
    case "failed":
      return "failing";
    case "pending":
    case "todo":
    case "skipped":
    case "disabled":
      return "skipped";
    default:
      return "unknown";
  }
}

/**
 * Extract a JSON object that contains `testResults` from mixed stdout/stderr.
 * Prefers the largest valid slice so log noise before/after does not truncate
 * the full per-test payload.
 */
function extractTestResultsJson(raw: string): unknown | null {
  const marker = '"testResults"';
  const markerIdx = raw.indexOf(marker);
  if (markerIdx < 0) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  let start = markerIdx;
  while (start > 0 && raw[start] !== "{") start -= 1;
  // Grow the end until JSON.parse succeeds (handles nested braces).
  for (
    let end = raw.lastIndexOf("}");
    end > start;
    end = raw.lastIndexOf("}", end - 1)
  ) {
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { testResults?: unknown }).testResults)
      ) {
        return parsed;
      }
    } catch {
      // try a tighter end
    }
  }
  return null;
}

/**
 * Best-effort parse of vitest `--reporter=json` / jest `--json` output
 * (both share the Jest-like `testResults[].assertionResults[]` shape).
 * Returns every assertion — no truncation.
 */
function parseJestLikeResults(raw: string, root: string): TestingTestResult[] {
  const parsed = extractTestResultsJson(raw);
  if (!parsed || typeof parsed !== "object") return [];
  const testResults = (parsed as { testResults?: unknown }).testResults;
  if (!Array.isArray(testResults)) return [];

  const results: TestingTestResult[] = [];
  let idx = 0;
  for (const fileEntry of testResults) {
    if (!fileEntry || typeof fileEntry !== "object") continue;
    const entry = fileEntry as {
      name?: string;
      assertionResults?: Array<{
        fullName?: string;
        title?: string;
        status?: string;
        duration?: number;
        ancestorTitles?: string[];
      }>;
    };
    const file = relPath(entry.name ?? "unknown", root);
    for (const assertion of entry.assertionResults ?? []) {
      const name =
        assertion.fullName?.trim() || assertion.title?.trim() || `test-${idx}`;
      const suite = assertion.ancestorTitles?.filter(Boolean).join(" › ");
      results.push({
        id: `${file}:${idx}:${name}`,
        name,
        file,
        status: mapJestStatus(assertion.status),
        ...(suite ? { suite } : {}),
        ...(typeof assertion.duration === "number"
          ? { durationMs: assertion.duration }
          : {}),
      });
      idx += 1;
    }
  }
  return results;
}

function parseCommandResults(
  cmdResult: CommandResult,
  root: string,
): TestingTestResult[] {
  const fromOut = parseJestLikeResults(cmdResult.stdout, root);
  if (fromOut.length > 0) return fromOut;
  return parseJestLikeResults(cmdResult.stderr, root);
}

function summaryResult(
  status: TestingTestStatus,
  detail: string,
): TestingTestResult[] {
  return [
    {
      id: "summary",
      name: detail,
      file: ".",
      status,
    },
  ];
}

function appendFilterArgs(
  args: string[],
  kind: "vitest" | "jest",
  options: RunTestsOptions,
): string[] {
  const out = [...args];
  if (options.path) out.push(options.path);
  if (options.testNamePattern) {
    if (kind === "vitest") out.push("-t", options.testNamePattern);
    else out.push("--testNamePattern", options.testNamePattern);
  }
  return out;
}

/**
 * Prefer package.json `scripts.test` / package-manager `test`, then fall through
 * to npx vitest/jest. Exit 127 is treated like missing binary. Optional
 * path / testNamePattern filters map to vitest/jest `-t` / path args.
 */
async function runWorkspaceTests(
  session: PrismSession,
  options: RunTestsOptions = {},
): Promise<TestingReport | null> {
  const root = session.root;
  if (!root) return null;

  const coverage = options.coverage === true;
  const hasFilters = Boolean(options.path || options.testNamePattern);

  const baseResult = await session.getTestingReport();
  const base: TestingReport | null = baseResult.ok ? baseResult.value : null;
  const runners = base?.runners ?? [];
  const prefersVitest = runners.includes("vitest");
  const prefersJest = runners.includes("jest");

  let results: TestingTestResult[] = [];
  let ran = false;
  let cmdResult: CommandResult | null = null;

  const tryPackageManager = async (): Promise<CommandResult | null> => {
    if (!hasPackageTestScript(root)) return null;
    const pm = detectPackageManager(root);
    const extra: string[] = [];
    if (prefersVitest || (!prefersJest && runners.length === 0)) {
      extra.push("--reporter=json");
    } else if (prefersJest) {
      extra.push("--json");
    } else {
      extra.push("--reporter=json");
    }
    if (coverage) extra.push("--coverage");
    if (options.path) extra.push(options.path);
    if (options.testNamePattern) extra.push("-t", options.testNamePattern);
    const args = [...pm.args];
    if (!args.includes("--")) args.push("--");
    args.push(...extra);
    const result = await runCommand(pm.cmd, args, root);
    if (isMissingRunner(result.code)) return null;
    return result;
  };

  const tryRunner = async (
    kind: "vitest" | "jest",
  ): Promise<CommandResult | null> => {
    const baseArgs =
      kind === "vitest"
        ? [
            "--no-install",
            "vitest",
            "run",
            "--reporter=json",
            ...(coverage ? ["--coverage"] : []),
          ]
        : [
            "--no-install",
            "jest",
            "--json",
            ...(coverage ? ["--coverage"] : []),
          ];
    const args = appendFilterArgs(baseArgs, kind, options);
    const result = await runCommand("npx", args, root);
    if (isMissingRunner(result.code)) return null;
    return result;
  };

  // Prefer package.json / package-manager test first (full suite). When path /
  // name filters are set, skip straight to vitest/jest so `-t` / path work.
  // If PM runs but yields no parseable JSON and we know vitest/jest, fall through
  // so monorepo wrappers (e.g. `moon run :test`) don't block real reporters.
  if (!hasFilters) {
    cmdResult = await tryPackageManager();
    if (cmdResult) {
      results = parseCommandResults(cmdResult, root);
      if (results.length > 0 || (!prefersVitest && !prefersJest)) {
        ran = true;
      }
    }
  }

  if (!ran && (prefersVitest || (!prefersJest && runners.length === 0))) {
    cmdResult = await tryRunner("vitest");
    if (cmdResult) {
      results = parseCommandResults(cmdResult, root);
      ran = true;
    }
  }
  if (!ran && (prefersJest || runners.length === 0)) {
    cmdResult = await tryRunner("jest");
    if (cmdResult) {
      results = parseCommandResults(cmdResult, root);
      ran = true;
    }
  }

  // Filtered runs that skipped PM: if vitest/jest missing, last-resort PM try.
  // Also: PM ran with no JSON but vitest/jest also missing — keep PM summary.
  if (!ran && hasFilters) {
    cmdResult = await tryPackageManager();
    if (cmdResult) {
      results = parseCommandResults(cmdResult, root);
      ran = true;
    }
  }
  if (!ran && cmdResult) {
    // PM produced an exit but no JSON and no vitest/jest binary — surface it.
    results = parseCommandResults(cmdResult, root);
    ran = true;
  }

  if (!ran) {
    return base
      ? {
          ...base,
          results: [],
          summary: `${base.summary} · No test runner binary found.`,
        }
      : null;
  }

  if (results.length === 0 && cmdResult) {
    results = summaryResult(
      cmdResult.code === 0 ? "passing" : "failing",
      cmdResult.code === 0
        ? "Tests finished with no parseable results."
        : `Tests failed (exit ${cmdResult.code}) with no parseable results.`,
    );
  }

  let report = base;
  if (coverage) {
    const ingested = await session.ingestCoverageFromWorkspace();
    if (ingested.ok && ingested.value) report = ingested.value;
  }
  if (!report) {
    report = {
      score: 0,
      runners,
      suites: [],
      results: [],
      summary: "Tests ran but no static testing report was available.",
    };
  }

  const lastRunAt = new Date().toISOString();
  return {
    ...report,
    results,
    lastRunAt,
  };
}

/** Parse `vitest list --json` flat `{ name, file }[]` into file → tests. */
function parseVitestListJson(raw: string, root: string): TestListResult {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return { files: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { files: [] };
  }
  if (!Array.isArray(parsed)) return { files: [] };

  const byFile = new Map<string, TestListItem[]>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { name?: string; file?: string; fullName?: string };
    if (typeof row.file !== "string" || !row.file) continue;
    const path = relPath(row.file, root);
    const name =
      (typeof row.name === "string" && row.name.trim()) ||
      (typeof row.fullName === "string" && row.fullName.trim()) ||
      "unnamed";
    const fullName =
      typeof row.fullName === "string" && row.fullName.trim()
        ? row.fullName.trim()
        : name;
    const list = byFile.get(path) ?? [];
    list.push({ name, fullName });
    byFile.set(path, list);
  }

  const files: TestListFile[] = [...byFile.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, tests]) => ({ path, tests }));
  return { files };
}

/** Parse jest `--listTests` (one absolute path per line) into files with no cases. */
function parseJestListTests(raw: string, root: string): TestListResult {
  const files: TestListFile[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("["))
      continue;
    files.push({ path: relPath(trimmed, root), tests: [] });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files };
}

/**
 * Discover tests via vitest `list --json` or jest `--listTests` for the suite tree.
 */
async function listWorkspaceTests(
  session: PrismSession,
): Promise<TestListResult> {
  const empty: TestListResult = { files: [] };
  const root = session.root;
  if (!root) return empty;

  const baseResult = await session.getTestingReport();
  const runners = baseResult.ok ? (baseResult.value?.runners ?? []) : [];
  const prefersVitest = runners.includes("vitest");
  const prefersJest = runners.includes("jest");

  const tryVitestList = async (): Promise<TestListResult | null> => {
    const result = await runCommand(
      "npx",
      ["--no-install", "vitest", "list", "--json"],
      root,
    );
    if (isMissingRunner(result.code)) return null;
    const parsed = parseVitestListJson(
      `${result.stdout}\n${result.stderr}`,
      root,
    );
    return parsed.files.length > 0 ? parsed : null;
  };

  const tryJestList = async (): Promise<TestListResult | null> => {
    const result = await runCommand(
      "npx",
      ["--no-install", "jest", "--listTests"],
      root,
    );
    if (isMissingRunner(result.code)) return null;
    const parsed = parseJestListTests(result.stdout || result.stderr, root);
    return parsed.files.length > 0 ? parsed : null;
  };

  if (prefersVitest || (!prefersJest && runners.length === 0)) {
    const vitest = await tryVitestList();
    if (vitest) return vitest;
  }
  if (prefersJest || runners.length === 0) {
    const jest = await tryJestList();
    if (jest) return jest;
  }
  if (prefersJest) {
    const vitest = await tryVitestList();
    if (vitest) return vitest;
  }

  return empty;
}
