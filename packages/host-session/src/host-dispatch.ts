import { execFile } from "node:child_process";
import {
  dispatchGithubWorkflow,
  fetchGithubAuthenticatedLogin,
  fetchGithubRepo,
  fetchGithubWorkflowRuns,
  fetchGithubWorkflows,
  fetchPagespeedMetrics,
  stageDevopsRemote,
  testGithubRepoConnection,
} from "@repo-prism/core";
import { consentRequiredMessage } from "@repo-prism/shared";
import { NO_CONSOLE_STATUS } from "@repo-prism/shared";
import type {
  ConsoleStatus,
  MapLayerId,
  MapZoomLevel,
} from "@repo-prism/shared";
import type {
  ApplyRenameInput,
  ApplyRenameResult,
} from "@repo-prism/app-shell/apply-rename";
import { applyRenameOnDisk } from "./apply-rename-disk.js";
import type { HostRequest, HostResponse } from "./protocol.js";
import type { PrismSession } from "./session.js";

export type HostDispatchState = {
  zoom: MapZoomLevel;
  layers: MapLayerId[];
};

export type HostDispatchOptions = {
  /**
   * How to perform a file rename. Defaults to plain `fs`, which is what the
   * Console and the playground want. The VS Code extension passes a
   * workspace-edit version so the rename lands in the editor's undo stack —
   * injected rather than imported so this module stays editor-free and can run
   * inside the Console daemon (ADR-0048).
   */
  readonly applyRename?: (
    root: string,
    input: ApplyRenameInput,
  ) => Promise<ApplyRenameResult>;
  /**
   * How to answer `consoleStatus`.
   *
   * Injected for the same reason `applyRename` is: finding the Console means
   * reading a file under `~/.prism` and making an HTTP call, neither of which
   * belongs in a module whose job is Core RPC. A host that does not supply one
   * reports no Console, which is a true answer rather than an error.
   */
  readonly consoleStatus?: () => Promise<ConsoleStatus>;
  /** Forward utility-job progress (Lighthouse lab console + progressive CWV). */
  readonly onProgress?: (event: {
    message: string;
    detail?: import("@repo-prism/shared").JsonValue;
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
        data: await session.getPrismGitignoreStatus(),
      };
    }
    case "addPrismGitignore": {
      return {
        id: req.id,
        ok: true,
        method: "addPrismGitignore",
        data: await session.addPrismToGitignore(),
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
        ...(req.formFactor ? { formFactor: req.formFactor } : {}),
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
    case "domainReport": {
      const result = await session.getDomainReport(req.domain ?? "frontend", {
        ...(req.cwvLocal !== undefined ? { cwvLocal: req.cwvLocal } : {}),
        ...(req.cwvPagespeed !== undefined
          ? { cwvPagespeed: req.cwvPagespeed }
          : {}),
        ...(req.cwvPreferredSource
          ? { cwvPreferredSource: req.cwvPreferredSource }
          : {}),
        ...(req.loadLatestCwvArtifact === true
          ? { loadLatestCwvArtifact: true }
          : {}),
      });
      if (!result.ok)
        return { id: req.id, ok: false, error: result.error.message };
      return {
        id: req.id,
        ok: true,
        method: "domainReport",
        data: result.value,
      };
    }
    case "applyRename": {
      const root = session.root;
      if (!root) {
        return { id: req.id, ok: false, error: "No workspace open" };
      }
      const rename = options.applyRename ?? applyRenameOnDisk;
      const data = await rename(root, req.input);
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
    case "consoleStatus": {
      const data = options.consoleStatus
        ? await options.consoleStatus()
        : NO_CONSOLE_STATUS;
      return { id: req.id, ok: true, method: "consoleStatus", data };
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
    case "fetchGithubWorkflows": {
      const root = session.root;
      if (!root) {
        return { id: req.id, ok: false, error: "No workspace open" };
      }
      const data = await fetchGithubWorkflows({
        workspaceRoot: root,
        owner: req.owner,
        repo: req.repo,
        ...(req.token ? { token: req.token } : {}),
      });
      return { id: req.id, ok: true, method: "fetchGithubWorkflows", data };
    }
    case "fetchGithubWorkflowRuns": {
      const root = session.root;
      if (!root) {
        return { id: req.id, ok: false, error: "No workspace open" };
      }
      const data = await fetchGithubWorkflowRuns({
        workspaceRoot: root,
        owner: req.owner,
        repo: req.repo,
        ...(req.token ? { token: req.token } : {}),
        ...(req.perPage !== undefined ? { perPage: req.perPage } : {}),
      });
      return { id: req.id, ok: true, method: "fetchGithubWorkflowRuns", data };
    }
    case "fetchGithubRepo": {
      const root = session.root;
      if (!root) {
        return { id: req.id, ok: false, error: "No workspace open" };
      }
      const data = await fetchGithubRepo({
        workspaceRoot: root,
        owner: req.owner,
        repo: req.repo,
        ...(req.token ? { token: req.token } : {}),
      });
      return { id: req.id, ok: true, method: "fetchGithubRepo", data };
    }
    case "fetchGithubAuthenticatedLogin": {
      const root = session.root;
      if (!root) {
        return { id: req.id, ok: false, error: "No workspace open" };
      }
      const data = await fetchGithubAuthenticatedLogin({
        workspaceRoot: root,
        token: req.token,
      });
      return {
        id: req.id,
        ok: true,
        method: "fetchGithubAuthenticatedLogin",
        data,
      };
    }
    case "testGithubRepoConnection": {
      const root = session.root;
      if (!root) {
        return { id: req.id, ok: false, error: "No workspace open" };
      }
      const data = await testGithubRepoConnection({
        workspaceRoot: root,
        owner: req.owner,
        repo: req.repo,
        ...(req.token ? { token: req.token } : {}),
      });
      return {
        id: req.id,
        ok: true,
        method: "testGithubRepoConnection",
        data,
      };
    }
    case "dispatchGithubWorkflow": {
      const root = session.root;
      if (!root) {
        return { id: req.id, ok: false, error: "No workspace open" };
      }
      const data = await dispatchGithubWorkflow({
        workspaceRoot: root,
        owner: req.owner,
        repo: req.repo,
        kind: req.kind,
        ...(req.token ? { token: req.token } : {}),
        ...(req.workflowId !== undefined ? { workflowId: req.workflowId } : {}),
        ...(req.workflowPath ? { workflowPath: req.workflowPath } : {}),
        ...(req.ref ? { ref: req.ref } : {}),
        ...(req.inputs ? { inputs: req.inputs } : {}),
        ...(req.eventType ? { eventType: req.eventType } : {}),
      });
      return { id: req.id, ok: true, method: "dispatchGithubWorkflow", data };
    }
    case "fetchPagespeedMetrics": {
      const root = session.root;
      if (!root) {
        return { id: req.id, ok: false, error: "No workspace open" };
      }
      const data = await fetchPagespeedMetrics({
        workspaceRoot: root,
        apiKey: req.apiKey,
        url: req.url,
      });
      return { id: req.id, ok: true, method: "fetchPagespeedMetrics", data };
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
