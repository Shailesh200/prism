/**
 * Runtime validation for messages crossing the webview boundary.
 *
 * The protocol is expressed as TypeScript types, which vanish at runtime — both
 * sides previously cast incoming messages and trusted them. A malformed or
 * unexpected message therefore reached handler code as if it were valid
 * (M-051 Phase 1, task 1.12).
 *
 * These guards validate the *envelope*: the discriminant and the fields the
 * host dispatches on. Deep payloads are not re-validated here because they
 * originate from Core, which already validates them against `@repo-prism/shared`
 * schemas; duplicating those checks would drift.
 */

import type { HostRequest, WebviewToHost } from "./protocol.js";

/** Every `method` accepted on a `HostRequest`. Keep in sync with the union. */
export const HOST_REQUEST_METHODS = [
  "addPrismGitignore",
  "applyRename",
  "backend",
  "bundleAnalyze",
  "codeExplorer",
  "dashboard",
  "detectBundleAnalyze",
  "domainReport",
  "engineeringHealth",
  "explainArea",
  "frontendRoutes",
  "gitFetch",
  "graph",
  "healthHistory",
  "healthHistoryBackfill",
  "healthHistoryBackfillStatus",
  "impact",
  "ingestCoverage",
  "lighthouseLab",
  "listBookmarks",
  "listConsent",
  "listPackages",
  "listTests",
  "map",
  "overlay",
  "prismGitignore",
  "regionMovers",
  "reindex",
  "removeBookmark",
  "reviewChanges",
  "runTests",
  "saveBookmark",
  "security",
  "selectPackage",
  "setConsent",
  "stageDevopsRemote",
  "fetchGithubWorkflows",
  "fetchGithubWorkflowRuns",
  "fetchGithubRepo",
  "fetchGithubAuthenticatedLogin",
  "testGithubRepoConnection",
  "dispatchGithubWorkflow",
  "fetchPagespeedMetrics",
  "symbols",
  "testing",
] as const;

const METHODS = new Set<string>(HOST_REQUEST_METHODS);

const WEBVIEW_MESSAGE_TYPES = new Set([
  "ready",
  "request",
  "openFile",
  "openInBrowser",
  "runTests",
  "zoom",
  "layers",
  "setAutoReindex",
  "setCodeLens",
  "setLocalOnly",
  "writePrismConfig",
  "clearData",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ProtocolParse<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

/** Validate a `HostRequest` envelope: an id and a method the host implements. */
export function parseHostRequest(raw: unknown): ProtocolParse<HostRequest> {
  if (!isRecord(raw)) return { ok: false, reason: "request is not an object" };
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    return { ok: false, reason: "request.id must be a non-empty string" };
  }
  if (typeof raw.method !== "string") {
    return { ok: false, reason: "request.method must be a string" };
  }
  if (!METHODS.has(raw.method)) {
    return { ok: false, reason: `unknown request method "${raw.method}"` };
  }
  return { ok: true, value: raw as unknown as HostRequest };
}

/** Validate a message arriving at the host from the webview. */
export function parseWebviewToHost(raw: unknown): ProtocolParse<WebviewToHost> {
  if (!isRecord(raw)) return { ok: false, reason: "message is not an object" };
  if (typeof raw.type !== "string") {
    return { ok: false, reason: "message.type must be a string" };
  }
  if (!WEBVIEW_MESSAGE_TYPES.has(raw.type)) {
    return { ok: false, reason: `unknown message type "${raw.type}"` };
  }

  switch (raw.type) {
    case "request": {
      const inner = parseHostRequest(raw.request);
      if (!inner.ok) return inner;
      break;
    }
    case "openFile": {
      if (typeof raw.path !== "string" || raw.path.length === 0) {
        return {
          ok: false,
          reason: "openFile.path must be a non-empty string",
        };
      }
      break;
    }
    case "zoom": {
      if (typeof raw.zoom !== "string") {
        return { ok: false, reason: "zoom.zoom must be a string" };
      }
      break;
    }
    case "layers": {
      if (
        !Array.isArray(raw.layers) ||
        raw.layers.some((layer) => typeof layer !== "string")
      ) {
        return { ok: false, reason: "layers.layers must be a string array" };
      }
      break;
    }
    case "setAutoReindex": {
      if (typeof raw.enabled !== "boolean") {
        return {
          ok: false,
          reason: "setAutoReindex.enabled must be a boolean",
        };
      }
      if (raw.intervalMs !== undefined && typeof raw.intervalMs !== "number") {
        return {
          ok: false,
          reason: "setAutoReindex.intervalMs must be a number when present",
        };
      }
      break;
    }
    case "setCodeLens":
    case "setLocalOnly": {
      if (typeof raw.enabled !== "boolean") {
        return { ok: false, reason: `${raw.type}.enabled must be a boolean` };
      }
      break;
    }
    case "writePrismConfig": {
      if (
        !Array.isArray(raw.excludeGlobs) ||
        raw.excludeGlobs.some((g) => typeof g !== "string")
      ) {
        return {
          ok: false,
          reason: "writePrismConfig.excludeGlobs must be a string array",
        };
      }
      if (
        raw.maxFileBytes !== null &&
        (typeof raw.maxFileBytes !== "number" ||
          !Number.isFinite(raw.maxFileBytes))
      ) {
        return {
          ok: false,
          reason: "writePrismConfig.maxFileBytes must be a number or null",
        };
      }
      if (raw.ifAbsent !== undefined && typeof raw.ifAbsent !== "boolean") {
        return {
          ok: false,
          reason: "writePrismConfig.ifAbsent must be a boolean",
        };
      }
      break;
    }
    default:
      break;
  }

  return { ok: true, value: raw as unknown as WebviewToHost };
}
