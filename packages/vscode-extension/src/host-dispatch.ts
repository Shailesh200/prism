import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismGitignoreStatus } from "@prism/app-shell";
import { stageDevopsRemote } from "@prism/core";
import { consentRequiredMessage } from "@prism/shared";
import type { MapLayerId, MapZoomLevel } from "@prism/shared";
import type * as vscode from "vscode";
import { applyRenameOnDisk, applyWorkspaceRename } from "./apply-rename.js";
import type { HostRequest, HostResponse } from "./protocol.js";
import type { PrismSession } from "./session.js";

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
      const result = await session.runWorkspaceTests({
        ...(req.coverage === true ? { coverage: true } : {}),
        ...(typeof req.path === "string" && req.path.trim()
          ? { path: req.path.trim() }
          : {}),
        ...(typeof req.testNamePattern === "string" &&
        req.testNamePattern.trim()
          ? { testNamePattern: req.testNamePattern.trim() }
          : {}),
      });
      if (!result.ok) {
        return { id: req.id, ok: false, error: result.error.message };
      }
      return { id: req.id, ok: true, method: "runTests", data: result.value };
    }
    case "listTests": {
      const result = await session.listWorkspaceTests();
      if (!result.ok) {
        return { id: req.id, ok: false, error: result.error.message };
      }
      return { id: req.id, ok: true, method: "listTests", data: result.value };
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
      // Gated on the network purpose, not the git-integration toggle it used
      // to sit behind: `git fetch` contacts a remote with the user's
      // credentials, which is unambiguously network access (M-036 F6).
      const consent = await session.getConsent("network.git-remote");
      if (!consent.ok || consent.value?.granted !== true) {
        return {
          id: req.id,
          ok: true,
          method: "gitFetch",
          data: {
            ok: false,
            error: consentRequiredMessage("network.git-remote"),
          },
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
    case "listConsent": {
      const result = await session.listConsent();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "listConsent",
        data: [...result.value],
      };
    }
    case "setConsent": {
      const set = await session.setConsent(req.purpose, req.granted);
      if (!set.ok) return { id: req.id, ok: false, error: set.error.message };
      const result = await session.listConsent();
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "setConsent",
        data: [...result.value],
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
