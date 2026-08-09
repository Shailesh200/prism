import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";
import { defineConfig, type Plugin } from "vite";
import {
  rewritePathReferences,
  type ApplyRenameInput,
  type ApplyRenameResult,
} from "../../packages/app-shell/src/apply-rename.ts";
import type {
  BackendReport,
  BlastRadiusReport,
  ChangeReviewReport,
  CodeExplorerReport,
  CodeExplorerTarget,
  ConsentPurposeId,
  ConsentState,
  CwvPreferredSource,
  CwvReport,
  DnaReport,
  DomainReport,
  EngineeringHealthReport,
  GitActivity,
  GraphSnapshotDto,
  HealthHistoryBackfillStatus,
  HealthHistoryReport,
  HealthScore,
  MapLayerId,
  MapZoomLevel,
  RegionMoversReport,
  RenameImpactReport,
  RepositoryMap,
  SafeDeleteReport,
  SecurityReport,
  TestImpactReport,
  TestingReport,
  UtilityOverlayReport,
  UtilityJob,
} from "@repo-prism/shared";
import {
  MapLayerIdSchema,
  MapZoomLevelSchema,
  consentRequiredMessage,
} from "@repo-prism/shared";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(appRoot, "../..");
const fixtureRoot = resolve(
  appRoot,
  "../../packages/intelligence/fixtures/m012-features",
);
const uiSrc = resolve(appRoot, "../../packages/ui/src");
const appShellSrc = resolve(appRoot, "../../packages/app-shell/src");

const ZOOM_LEVELS = MapZoomLevelSchema.options;

type Workspace = {
  getRepositoryMap: (options?: {
    zoom?: MapZoomLevel;
    layers?: readonly string[];
  }) =>
    | { ok: true; value: RepositoryMap }
    | { ok: false; error: { message: string } };
  getGitActivity: () =>
    | { ok: true; value: GitActivity }
    | { ok: false; error: { message: string } };
  getHealth: () => Promise<
    { ok: true; value: HealthScore } | { ok: false; error: { message: string } }
  >;
  getDna: () => Promise<
    { ok: true; value: DnaReport } | { ok: false; error: { message: string } }
  >;
  getUtilityOverlay: (
    kind: string,
    options?: { packageId?: string },
  ) => Promise<
    | { ok: true; value: UtilityOverlayReport }
    | { ok: false; error: { message: string } }
  >;
  getBackendReport: (options?: {
    packageId?: string;
  }) => Promise<
    | { ok: true; value: BackendReport }
    | { ok: false; error: { message: string } }
  >;
  getDomainReport: (
    domain: string,
    options?: {
      packageId?: string;
      cwvLocal?: CwvReport | null;
      cwvPagespeed?: CwvReport | null;
      cwvPreferredSource?: CwvPreferredSource;
      loadLatestCwvArtifact?: boolean;
      includeBundleCapability?: boolean;
    },
  ) => Promise<
    | { ok: true; value: DomainReport }
    | { ok: false; error: { message: string } }
  >;
  getTestingReport: () => Promise<
    | { ok: true; value: TestingReport }
    | { ok: false; error: { message: string } }
  >;
  getSecurityReport: () => Promise<
    | { ok: true; value: SecurityReport }
    | { ok: false; error: { message: string } }
  >;
  ingestCoverageFromWorkspace: () => Promise<
    | { ok: true; value: TestingReport }
    | { ok: false; error: { message: string } }
  >;
  getDependencyGraph: () =>
    | { ok: true; value: GraphSnapshotDto }
    | { ok: false; error: { message: string } };
  blastRadius: (input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
    intent?: "edit" | "delete";
  }) => Promise<
    | { ok: true; value: BlastRadiusReport }
    | { ok: false; error: { message: string } }
  >;
  safeDelete: (input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
  }) => Promise<
    | { ok: true; value: SafeDeleteReport }
    | { ok: false; error: { message: string } }
  >;
  renameImpact: (input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
    newName?: string;
  }) => Promise<
    | { ok: true; value: RenameImpactReport }
    | { ok: false; error: { message: string } }
  >;
  testImpact: (input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
  }) => Promise<
    | { ok: true; value: TestImpactReport }
    | { ok: false; error: { message: string } }
  >;
  findSymbol: (query: { name: string; path?: string; kind?: string }) =>
    | {
        ok: true;
        value: Array<{
          id: string;
          name: string;
          kind: string;
          path: string;
          exported: boolean;
        }>;
      }
    | { ok: false; error: { message: string } };
  getKnowledgeGraph: () =>
    | {
        ok: true;
        value: {
          symbols: Array<{
            id: string;
            name: string;
            kind: string;
            path: string;
            exported: boolean;
          }>;
        };
      }
    | { ok: false; error: { message: string } };
  getHealthHistory: (options?: {
    since?: string;
    limit?: number;
  }) => Promise<
    | { ok: true; value: HealthHistoryReport }
    | { ok: false; error: { message: string } }
  >;
  getRegionMovers: () => Promise<
    | { ok: true; value: RegionMoversReport }
    | { ok: false; error: { message: string } }
  >;
  startHealthHistoryBackfill: (options?: {
    maxCommits?: number;
  }) => Promise<
    { ok: true; value: void } | { ok: false; error: { message: string } }
  >;
  getHealthHistoryBackfillStatus: () =>
    | { ok: true; value: HealthHistoryBackfillStatus }
    | { ok: false; error: { message: string } };
  getEngineeringHealth: () => Promise<
    | { ok: true; value: EngineeringHealthReport }
    | { ok: false; error: { message: string } }
  >;
  exploreCode: (
    target: CodeExplorerTarget,
  ) => Promise<
    | { ok: true; value: CodeExplorerReport }
    | { ok: false; error: { message: string } }
  >;
  startUtilityJob: (input: {
    kind: string;
    lighthouse?: {
      mode?: "lab-fixture" | "ingest" | "run";
      url?: string;
      port?: number;
      reportPath?: string;
    };
  }) => Promise<
    { ok: true; value: UtilityJob } | { ok: false; error: { message: string } }
  >;
  getCwvReport: (
    artifactId: string,
  ) => Promise<
    { ok: true; value: CwvReport } | { ok: false; error: { message: string } }
  >;
};

const workspaceCache = new Map<string, Promise<Workspace>>();

type Preset = {
  id: string;
  label: string;
  root: string;
};

function presets(): Preset[] {
  return [];
}

/**
 * Auto-detect the workspace to index. Prefer an explicit env override, else the
 * repository the playground is running inside (this repo).
 */
function defaultRoot(): string {
  const fromEnv = process.env.PRISM_PLAYGROUND_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);
  return repoRoot;
}

async function assertReadableDir(root: string): Promise<void> {
  try {
    await access(root);
  } catch {
    throw new Error(`Repository path not found or not readable: ${root}`);
  }
}

async function getIndexedWorkspace(root: string): Promise<Workspace> {
  const key = resolve(root);
  let pending = workspaceCache.get(key);
  if (!pending) {
    pending = (async () => {
      await assertReadableDir(key);
      const { Prism } = await import("@repo-prism/core");
      const client = Prism.create();
      const opened = client.openRepository(key);
      if (!opened.ok) {
        throw new Error(`openRepository failed: ${opened.error.message}`);
      }
      const indexed = await opened.value.index();
      if (!indexed.ok) {
        throw new Error(`index failed: ${indexed.error.message}`);
      }
      return opened.value;
    })();
    workspaceCache.set(key, pending);
    pending.catch(() => {
      workspaceCache.delete(key);
    });
  }
  return pending;
}

function parseLayers(raw: string | null): MapLayerId[] | undefined {
  if (!raw || raw.trim().length === 0) return undefined;
  const out: MapLayerId[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    const parsed = MapLayerIdSchema.safeParse(id);
    if (parsed.success && !out.includes(parsed.data)) out.push(parsed.data);
  }
  return out.length > 0 ? out : undefined;
}

async function loadMap(
  zoom: MapZoomLevel,
  root: string,
  layers?: readonly MapLayerId[],
): Promise<RepositoryMap> {
  const ws = await getIndexedWorkspace(root);
  const result = ws.getRepositoryMap({
    zoom,
    ...(layers === undefined ? {} : { layers }),
  });
  if (!result.ok) {
    throw new Error(`getRepositoryMap failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadGitActivity(root: string): Promise<GitActivity> {
  const ws = await getIndexedWorkspace(root);
  const result = ws.getGitActivity();
  if (!result.ok) {
    throw new Error(`getGitActivity failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadConsent(root: string): Promise<readonly ConsentState[]> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.listConsent();
  if (!result.ok)
    throw new Error(`listConsent failed: ${result.error.message}`);
  return result.value;
}

/** The refusal message, or `null` when the purpose has been granted. */
async function requireConsent(
  root: string,
  purpose: ConsentPurposeId,
): Promise<string | null> {
  const ws = await getIndexedWorkspace(root);
  const record = await ws.getConsent(purpose);
  if (record.ok && record.value?.granted === true) return null;
  return consentRequiredMessage(purpose);
}

async function loadHealth(root: string): Promise<HealthScore> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getHealth();
  if (!result.ok) {
    throw new Error(`getHealth failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadDna(root: string): Promise<DnaReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getDna();
  if (!result.ok) {
    throw new Error(`getDna failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadHealthHistory(root: string): Promise<HealthHistoryReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getHealthHistory();
  if (!result.ok) {
    throw new Error(`getHealthHistory failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadRegionMovers(root: string): Promise<RegionMoversReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getRegionMovers();
  if (!result.ok) {
    throw new Error(`getRegionMovers failed: ${result.error.message}`);
  }
  return result.value;
}

async function startHealthHistoryBackfill(root: string): Promise<void> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.startHealthHistoryBackfill();
  if (!result.ok) {
    throw new Error(
      `startHealthHistoryBackfill failed: ${result.error.message}`,
    );
  }
}

async function loadHealthHistoryBackfillStatus(
  root: string,
): Promise<HealthHistoryBackfillStatus> {
  const ws = await getIndexedWorkspace(root);
  const result = ws.getHealthHistoryBackfillStatus();
  if (!result.ok) {
    throw new Error(
      `getHealthHistoryBackfillStatus failed: ${result.error.message}`,
    );
  }
  return result.value;
}

async function loadOverlay(
  root: string,
  kind: string,
): Promise<UtilityOverlayReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getUtilityOverlay(kind);
  if (!result.ok) {
    throw new Error(`getUtilityOverlay failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadBackendReport(root: string): Promise<BackendReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getBackendReport();
  if (!result.ok) {
    throw new Error(`getBackendReport failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadDomainReport(
  root: string,
  options: {
    domain?: string;
    cwvLocal?: CwvReport | null;
    cwvPagespeed?: CwvReport | null;
    cwvPreferredSource?: CwvPreferredSource;
    loadLatestCwvArtifact?: boolean;
  },
): Promise<DomainReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getDomainReport(options.domain ?? "frontend", {
    ...(options.cwvLocal !== undefined ? { cwvLocal: options.cwvLocal } : {}),
    ...(options.cwvPagespeed !== undefined
      ? { cwvPagespeed: options.cwvPagespeed }
      : {}),
    ...(options.cwvPreferredSource
      ? { cwvPreferredSource: options.cwvPreferredSource }
      : {}),
    ...(options.loadLatestCwvArtifact === true
      ? { loadLatestCwvArtifact: true }
      : {}),
  });
  if (!result.ok) {
    throw new Error(`getDomainReport failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadTestingReport(root: string): Promise<TestingReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getTestingReport();
  if (!result.ok) {
    throw new Error(`getTestingReport failed: ${result.error.message}`);
  }
  return result.value;
}

async function runWorkspaceTestsApi(
  root: string,
  options: {
    coverage?: boolean;
    path?: string;
    testNamePattern?: string;
  } = {},
): Promise<TestingReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.runWorkspaceTests(options);
  if (!result.ok) {
    throw new Error(`runWorkspaceTests failed: ${result.error.message}`);
  }
  return result.value;
}

async function listWorkspaceTestsApi(root: string): Promise<{
  files: { path: string; tests: { name: string; fullName?: string }[] }[];
}> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.listWorkspaceTests();
  if (!result.ok) {
    throw new Error(`listWorkspaceTests failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadSecurityReport(root: string): Promise<SecurityReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getSecurityReport();
  if (!result.ok) {
    throw new Error(`getSecurityReport failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadEngineeringHealth(
  root: string,
): Promise<EngineeringHealthReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.getEngineeringHealth();
  if (!result.ok) {
    throw new Error(`getEngineeringHealth failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadCodeExplorer(
  root: string,
  target: CodeExplorerTarget,
): Promise<CodeExplorerReport | null> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.exploreCode(target);
  if (!result.ok) return null;
  return result.value;
}

async function loadIngestCoverage(root: string): Promise<TestingReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.ingestCoverageFromWorkspace();
  if (!result.ok) {
    throw new Error(
      `ingestCoverageFromWorkspace failed: ${result.error.message}`,
    );
  }
  return result.value;
}

async function loadLighthouseLab(
  root: string,
  options?: {
    mode?: "lab-fixture" | "ingest" | "run";
    url?: string;
    port?: number;
    routes?: readonly string[];
    formFactor?: "mobile" | "desktop";
    onProgress?: (event: {
      message: string;
      detail?: import("@repo-prism/shared").JsonValue;
    }) => void;
  },
): Promise<CwvReport> {
  const ws = await getIndexedWorkspace(root);
  const mode = options?.mode ?? "lab-fixture";
  const job = await ws.startUtilityJob({
    kind: "lighthouse",
    lighthouse: {
      mode,
      ...(options?.url ? { url: options.url } : {}),
      ...(options?.port !== undefined ? { port: options.port } : {}),
      ...(options?.routes && options.routes.length > 0
        ? { routes: [...options.routes] }
        : {}),
      ...(options?.formFactor ? { formFactor: options.formFactor } : {}),
    },
    ...(options?.onProgress
      ? {
          onProgress: (p) => {
            const line = (p.message ?? p.phase).trim();
            if (!line && p.detail === undefined) return;
            options.onProgress!({
              message: line || p.phase,
              ...(p.detail !== undefined ? { detail: p.detail } : {}),
            });
          },
        }
      : {}),
  });
  if (!job.ok) {
    throw new Error(`startUtilityJob failed: ${job.error.message}`);
  }
  if (job.value.status === "failed") {
    throw new Error(
      job.value.error?.message ?? "Lighthouse job failed (no artifact)",
    );
  }
  const artifactId = job.value.resultArtifactId;
  if (!artifactId) {
    throw new Error(
      job.value.error?.message ?? "Lighthouse job produced no artifact",
    );
  }
  const cwv = await ws.getCwvReport(artifactId);
  if (!cwv.ok) {
    throw new Error(`getCwvReport failed: ${cwv.error.message}`);
  }
  if (mode === "run" && cwv.value.source === "lab-fixture") {
    throw new Error(
      "Real Lighthouse run unavailable — fixture scores are never shown for mode=run.",
    );
  }
  return cwv.value;
}

async function loadBundleAnalyze(
  root: string,
  options?: {
    mode?: "run" | "ingest" | "discover";
    packageId?: string;
    packagePath?: string;
    scriptName?: string;
    reportPath?: string;
    onProgress?: (event: {
      message: string;
      detail?: import("@repo-prism/shared").JsonValue;
    }) => void;
  },
): Promise<import("@repo-prism/shared").BundleWeightReport> {
  const ws = await getIndexedWorkspace(root);
  const mode = options?.mode ?? "run";
  const job = await ws.startUtilityJob({
    kind: "bundle-stats",
    ...(options?.packageId ? { packageId: options.packageId } : {}),
    bundleAnalyze: {
      mode,
      ...(options?.packagePath ? { packagePath: options.packagePath } : {}),
      ...(options?.scriptName ? { scriptName: options.scriptName } : {}),
      ...(options?.reportPath ? { reportPath: options.reportPath } : {}),
    },
    ...(options?.onProgress
      ? {
          onProgress: (p) => {
            const line = (p.message ?? p.phase).trim();
            if (!line && p.detail === undefined) return;
            options.onProgress!({
              message: line || p.phase,
              ...(p.detail !== undefined ? { detail: p.detail } : {}),
            });
          },
        }
      : {}),
  });
  if (!job.ok) {
    throw new Error(`startUtilityJob failed: ${job.error.message}`);
  }
  if (job.value.status === "failed") {
    throw new Error(
      job.value.error?.message ?? "Bundle analyze failed (no artifact)",
    );
  }
  const artifactId = job.value.resultArtifactId;
  if (!artifactId) {
    throw new Error("Bundle analyze produced no artifact");
  }
  const report = await ws.getBundleWeightReport(artifactId);
  if (!report.ok) {
    throw new Error(`getBundleWeightReport failed: ${report.error.message}`);
  }
  return report.value;
}

async function loadGraph(root: string): Promise<GraphSnapshotDto> {
  const ws = await getIndexedWorkspace(root);
  const result = ws.getDependencyGraph();
  if (!result.ok) {
    throw new Error(`getDependencyGraph failed: ${result.error.message}`);
  }
  return result.value;
}

async function loadChangeReview(
  root: string,
  input: { paths: readonly string[]; base?: string },
): Promise<ChangeReviewReport> {
  const ws = await getIndexedWorkspace(root);
  const result = await ws.reviewChanges({
    paths: input.paths,
    ...(input.base === undefined ? {} : { base: input.base }),
  });
  if (!result.ok) {
    throw new Error(`reviewChanges failed: ${result.error.message}`);
  }
  return result.value;
}

type ImpactOrigin = {
  kind: "file" | "symbol";
  id: string;
  path?: string;
  newName?: string;
  intent?: "edit" | "delete";
};

async function loadImpactBundle(
  root: string,
  origin: ImpactOrigin,
): Promise<{
  blast: BlastRadiusReport;
  safeDelete: SafeDeleteReport;
  rename: RenameImpactReport;
  testImpact: TestImpactReport;
}> {
  const ws = await getIndexedWorkspace(root);
  const base = {
    kind: origin.kind,
    id: origin.id,
    ...(origin.path === undefined ? {} : { path: origin.path }),
    ...(origin.intent === undefined ? {} : { intent: origin.intent }),
  };
  const [blast, safeDelete, rename, testImpact] = await Promise.all([
    ws.blastRadius(base),
    ws.safeDelete(base),
    ws.renameImpact({
      ...base,
      ...(origin.newName === undefined || origin.newName.trim() === ""
        ? {}
        : { newName: origin.newName.trim() }),
    }),
    ws.testImpact(base),
  ]);
  if (!blast.ok) throw new Error(`blastRadius failed: ${blast.error.message}`);
  if (!safeDelete.ok) {
    throw new Error(`safeDelete failed: ${safeDelete.error.message}`);
  }
  if (!rename.ok) {
    throw new Error(`renameImpact failed: ${rename.error.message}`);
  }
  if (!testImpact.ok) {
    throw new Error(`testImpact failed: ${testImpact.error.message}`);
  }
  return {
    blast: blast.value,
    safeDelete: safeDelete.value,
    rename: rename.value,
    testImpact: testImpact.value,
  };
}

function parseZoom(raw: string | null): MapZoomLevel {
  const parsed = MapZoomLevelSchema.safeParse(raw ?? "feature");
  return parsed.success ? parsed.data : "feature";
}

function resolveRequestedRoot(raw: string | null): string {
  if (raw && raw.trim().length > 0) return resolve(raw.trim());
  return defaultRoot();
}

function sendJson(
  res: {
    statusCode: number;
    setHeader: (k: string, v: string) => void;
    end: (body: string) => void;
  },
  status: number,
  body: unknown,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/** A fault in what the caller sent, as opposed to a fault in handling it. */
class BadRequest extends Error {}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        // A body the client sent wrong is a 400, not the 500 that a bare
        // SyntaxError would surface as. `BadRequest` carries that distinction
        // to the handler.
        reject(new BadRequest("request body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function pathExists(abs: string): Promise<boolean> {
  try {
    await stat(abs);
    return true;
  } catch {
    return false;
  }
}

async function applyRenameOnDisk(
  root: string,
  input: ApplyRenameInput,
): Promise<ApplyRenameResult> {
  const fromPath = input.fromPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const toPath = input.toPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!fromPath || !toPath) {
    return { ok: false, error: "fromPath and toPath are required" };
  }
  if (fromPath === toPath) {
    return { ok: false, error: "Destination path matches the origin" };
  }

  try {
    await access(root, constants.W_OK);
  } catch {
    return {
      ok: false,
      error: `Workspace root is not writable: ${root}`,
    };
  }

  const fromAbs = join(root, fromPath);
  const toAbs = join(root, toPath);

  if (!(await pathExists(fromAbs))) {
    return { ok: false, error: `Source file not found: ${fromPath}` };
  }
  if (await pathExists(toAbs)) {
    return { ok: false, error: `Destination already exists: ${toPath}` };
  }

  const editedFiles: string[] = [];
  for (const site of input.editSites) {
    const sitePath = site.path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!sitePath || sitePath === fromPath) continue;
    const siteAbs = join(root, sitePath);
    let text: string;
    try {
      text = await readFile(siteAbs, "utf8");
    } catch {
      continue;
    }
    const { next, replacements } = rewritePathReferences(
      text,
      fromPath,
      toPath,
    );
    if (replacements === 0 || next === text) continue;
    await writeFile(siteAbs, next, "utf8");
    editedFiles.push(sitePath);
  }

  await mkdir(dirname(toAbs), { recursive: true });
  try {
    await rename(fromAbs, toAbs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Rename failed after editing ${editedFiles.length} file(s): ${message}`,
    };
  }

  return { ok: true, fromPath, toPath, editedFiles };
}

function prismMapApi(): Plugin {
  return {
    name: "prism-map-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) {
          next();
          return;
        }

        void (async () => {
          try {
            const parsed = new URL(url, "http://localhost");

            if (parsed.pathname === "/api/presets") {
              sendJson(res, 200, {
                defaultRoot: defaultRoot(),
                presets: presets(),
              });
              return;
            }

            if (parsed.pathname === "/api/map") {
              const zoom = parseZoom(parsed.searchParams.get("zoom"));
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const layers = parseLayers(parsed.searchParams.get("layers"));
              const map = await loadMap(zoom, root, layers);
              sendJson(res, 200, map);
              return;
            }

            // The shell asks for this on every load to decide whether to warn
            // that `.prism` is about to be committed. The playground never
            // implemented it, so the warning could not fire here at all — the
            // request fell through to Vite's SPA fallback and the client, on
            // failing to parse HTML as JSON, quietly reported "unknown".
            if (parsed.pathname === "/api/gitignore") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const ws = await getIndexedWorkspace(root);
              sendJson(res, 200, await ws.getPrismGitignoreStatus());
              return;
            }

            if (
              parsed.pathname === "/api/add-gitignore" &&
              req.method === "POST"
            ) {
              const body = (await readJsonBody(req)) as { root?: string };
              const root = resolveRequestedRoot(body.root ?? null);
              const ws = await getIndexedWorkspace(root);
              sendJson(res, 200, await ws.addPrismToGitignore());
              return;
            }

            if (parsed.pathname === "/api/git") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const activity = await loadGitActivity(root);
              sendJson(res, 200, activity);
              return;
            }

            // Method-qualified, and the POST case first. Without it the read
            // branch below matched POSTs too, answered with the *current*
            // list, and never recorded anything — so every consent toggle in
            // the playground appeared to work and did nothing.
            if (parsed.pathname === "/api/consent" && req.method !== "POST") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              sendJson(res, 200, await loadConsent(root));
              return;
            }

            if (parsed.pathname === "/api/consent" && req.method === "POST") {
              const body = (await readJsonBody(req)) as {
                root?: string;
                purpose?: string;
                granted?: boolean;
              };
              const root = resolveRequestedRoot(
                typeof body.root === "string" ? body.root : null,
              );
              const ws = await getIndexedWorkspace(root);
              const set = await ws.setConsent(
                String(body.purpose ?? ""),
                body.granted === true,
              );
              if (!set.ok) {
                sendJson(res, 400, { error: set.error.message });
                return;
              }
              sendJson(res, 200, await loadConsent(root));
              return;
            }

            if (parsed.pathname === "/api/git-fetch" && req.method === "POST") {
              const body = (await readJsonBody(req)) as { root?: string };
              const root = resolveRequestedRoot(
                typeof body.root === "string" ? body.root : null,
              );
              // `git fetch` is network access, and it used to sit behind the
              // git-integration toggle rather than a network one (M-036 F6).
              const gate = await requireConsent(root, "network.git-remote");
              if (gate) {
                sendJson(res, 200, { ok: false, error: gate });
                return;
              }
              try {
                execFileSync("git", ["fetch", "--prune"], {
                  cwd: root,
                  encoding: "utf8",
                  stdio: ["ignore", "pipe", "pipe"],
                });
                sendJson(res, 200, { ok: true });
              } catch (error) {
                const stderr =
                  error &&
                  typeof error === "object" &&
                  "stderr" in error &&
                  typeof (error as { stderr?: unknown }).stderr === "string"
                    ? (error as { stderr: string }).stderr.trim()
                    : "";
                const message =
                  stderr ||
                  (error instanceof Error ? error.message : String(error));
                sendJson(res, 200, { ok: false, error: message });
              }
              return;
            }

            if (parsed.pathname === "/api/health") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const health = await loadHealth(root);
              sendJson(res, 200, health);
              return;
            }

            if (parsed.pathname === "/api/dna") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const dna = await loadDna(root);
              sendJson(res, 200, dna);
              return;
            }

            if (parsed.pathname === "/api/health-history") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const history = await loadHealthHistory(root);
              sendJson(res, 200, history);
              return;
            }

            if (parsed.pathname === "/api/region-movers") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const movers = await loadRegionMovers(root);
              sendJson(res, 200, movers);
              return;
            }

            if (parsed.pathname === "/api/health-history/backfill") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              if (req.method === "POST") {
                await startHealthHistoryBackfill(root);
                sendJson(res, 200, { ok: true });
                return;
              }
              const status = await loadHealthHistoryBackfillStatus(root);
              sendJson(res, 200, status);
              return;
            }

            if (parsed.pathname === "/api/overlay") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const kind = parsed.searchParams.get("kind") ?? "api-surface";
              const overlay = await loadOverlay(root, kind);
              sendJson(res, 200, overlay);
              return;
            }

            if (
              parsed.pathname === "/api/stage-devops-remote" &&
              req.method === "POST"
            ) {
              const body = (await readJsonBody(req)) as {
                root?: string;
                owner?: string;
                repo?: string;
                token?: string;
              };
              const root = resolveRequestedRoot(body.root ?? null);
              const owner =
                typeof body.owner === "string" ? body.owner.trim() : "";
              const repo =
                typeof body.repo === "string" ? body.repo.trim() : "";
              const token =
                typeof body.token === "string" && body.token.trim() !== ""
                  ? body.token.trim()
                  : undefined;
              if (!owner || !repo) {
                sendJson(res, 400, { error: "owner and repo are required" });
                return;
              }
              const { stageDevopsRemote } = await import("@repo-prism/core");
              const result = await stageDevopsRemote({
                workspaceRoot: root,
                owner,
                repo,
                ...(token ? { token } : {}),
              });
              if (!result.ok) {
                sendJson(res, 400, { error: result.error });
                return;
              }
              sendJson(res, 200, result.value);
              return;
            }

            if (parsed.pathname === "/api/github-ci" && req.method === "POST") {
              const body = (await readJsonBody(req)) as {
                root?: string;
                action?: string;
                owner?: string;
                repo?: string;
                token?: string;
                perPage?: number;
                kind?: string;
                workflowId?: number | string;
                workflowPath?: string;
                ref?: string;
                inputs?: Record<string, string>;
                eventType?: string;
              };
              const root = resolveRequestedRoot(body.root ?? null);
              const action = typeof body.action === "string" ? body.action : "";
              const owner =
                typeof body.owner === "string" ? body.owner.trim() : "";
              const repo =
                typeof body.repo === "string" ? body.repo.trim() : "";
              const token =
                typeof body.token === "string" && body.token.trim() !== ""
                  ? body.token.trim()
                  : undefined;
              const core = await import("@repo-prism/core");
              const cfg = {
                workspaceRoot: root,
                owner,
                repo,
                ...(token ? { token } : {}),
              };

              if (action === "fetchGithubAuthenticatedLogin") {
                const login = await core.fetchGithubAuthenticatedLogin({
                  workspaceRoot: root,
                  token: token ?? "",
                });
                sendJson(res, 200, login);
                return;
              }
              if (action === "fetchGithubWorkflows") {
                sendJson(res, 200, await core.fetchGithubWorkflows(cfg));
                return;
              }
              if (action === "fetchGithubWorkflowRuns") {
                sendJson(
                  res,
                  200,
                  await core.fetchGithubWorkflowRuns({
                    ...cfg,
                    ...(typeof body.perPage === "number"
                      ? { perPage: body.perPage }
                      : {}),
                  }),
                );
                return;
              }
              if (action === "fetchGithubRepo") {
                sendJson(res, 200, await core.fetchGithubRepo(cfg));
                return;
              }
              if (action === "testGithubRepoConnection") {
                sendJson(res, 200, await core.testGithubRepoConnection(cfg));
                return;
              }
              if (action === "dispatchGithubWorkflow") {
                const kind =
                  body.kind === "repository_dispatch"
                    ? "repository_dispatch"
                    : "workflow_dispatch";
                sendJson(
                  res,
                  200,
                  await core.dispatchGithubWorkflow({
                    workspaceRoot: root,
                    owner,
                    repo,
                    kind,
                    ...(token ? { token } : {}),
                    ...(body.workflowId !== undefined
                      ? { workflowId: body.workflowId }
                      : {}),
                    ...(typeof body.workflowPath === "string"
                      ? { workflowPath: body.workflowPath }
                      : {}),
                    ...(typeof body.ref === "string" ? { ref: body.ref } : {}),
                    ...(body.inputs && typeof body.inputs === "object"
                      ? { inputs: body.inputs }
                      : {}),
                    ...(typeof body.eventType === "string"
                      ? { eventType: body.eventType }
                      : {}),
                  }),
                );
                return;
              }
              sendJson(res, 400, {
                error: `Unknown github-ci action: ${action}`,
              });
              return;
            }

            if (parsed.pathname === "/api/pagespeed" && req.method === "POST") {
              const body = (await readJsonBody(req)) as {
                root?: string;
                apiKey?: string;
                url?: string;
              };
              const root = resolveRequestedRoot(body.root ?? null);
              const { fetchPagespeedMetrics } =
                await import("@repo-prism/core");
              const result = await fetchPagespeedMetrics({
                workspaceRoot: root,
                apiKey: typeof body.apiKey === "string" ? body.apiKey : "",
                url: typeof body.url === "string" ? body.url : "",
              });
              sendJson(res, 200, result);
              return;
            }

            if (parsed.pathname === "/api/backend") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const report = await loadBackendReport(root);
              sendJson(res, 200, report);
              return;
            }

            if (
              parsed.pathname === "/api/domain-report" &&
              req.method === "POST"
            ) {
              const body = (await readJsonBody(req)) as {
                root?: string;
                domain?: string;
                cwvLocal?: CwvReport | null;
                cwvPagespeed?: CwvReport | null;
                cwvPreferredSource?: CwvPreferredSource;
                loadLatestCwvArtifact?: boolean;
              };
              const root = resolveRequestedRoot(
                typeof body.root === "string"
                  ? body.root
                  : parsed.searchParams.get("root"),
              );
              try {
                const report = await loadDomainReport(root, {
                  domain: body.domain ?? "frontend",
                  ...(body.cwvLocal !== undefined
                    ? { cwvLocal: body.cwvLocal }
                    : {}),
                  ...(body.cwvPagespeed !== undefined
                    ? { cwvPagespeed: body.cwvPagespeed }
                    : {}),
                  ...(body.cwvPreferredSource
                    ? { cwvPreferredSource: body.cwvPreferredSource }
                    : {}),
                  ...(body.loadLatestCwvArtifact === true
                    ? { loadLatestCwvArtifact: true }
                    : {}),
                });
                sendJson(res, 200, report);
              } catch (error) {
                sendJson(res, 500, {
                  error:
                    error instanceof Error
                      ? error.message
                      : "getDomainReport failed",
                });
              }
              return;
            }

            if (parsed.pathname === "/api/testing") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const report = await loadTestingReport(root);
              sendJson(res, 200, report);
              return;
            }

            if (parsed.pathname === "/api/run-tests" && req.method === "POST") {
              const body = (await readJsonBody(req)) as {
                root?: string;
                coverage?: boolean;
                path?: string;
                testNamePattern?: string;
              };
              const root = resolveRequestedRoot(
                typeof body.root === "string" ? body.root : null,
              );
              const report = await runWorkspaceTestsApi(root, {
                ...(body.coverage === true ? { coverage: true } : {}),
                ...(typeof body.path === "string" ? { path: body.path } : {}),
                ...(typeof body.testNamePattern === "string"
                  ? { testNamePattern: body.testNamePattern }
                  : {}),
              });
              sendJson(res, 200, report);
              return;
            }

            if (parsed.pathname === "/api/list-tests") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const listed = await listWorkspaceTestsApi(root);
              sendJson(res, 200, listed);
              return;
            }

            if (parsed.pathname === "/api/security") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const report = await loadSecurityReport(root);
              sendJson(res, 200, report);
              return;
            }

            if (parsed.pathname === "/api/engineering-health") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const report = await loadEngineeringHealth(root);
              sendJson(res, 200, report);
              return;
            }

            if (parsed.pathname === "/api/code-explorer") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const kindRaw = parsed.searchParams.get("kind") ?? "symbol";
              const kind = kindRaw === "file" ? "file" : "symbol";
              const target: CodeExplorerTarget =
                kind === "file"
                  ? {
                      kind: "file",
                      path: parsed.searchParams.get("path") ?? "",
                    }
                  : {
                      kind: "symbol",
                      name: parsed.searchParams.get("name") ?? "",
                      ...(parsed.searchParams.get("path")
                        ? { path: parsed.searchParams.get("path")! }
                        : {}),
                    };
              const report = await loadCodeExplorer(root, target);
              sendJson(res, 200, report);
              return;
            }

            if (parsed.pathname === "/api/ingest-coverage") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const report = await loadIngestCoverage(root);
              sendJson(res, 200, report);
              return;
            }

            if (parsed.pathname === "/api/frontend-routes") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const ws = await getIndexedWorkspace(root);
              const routes = ws.discoverFrontendRoutes();
              sendJson(
                res,
                routes.ok ? 200 : 500,
                routes.ok
                  ? { routes: routes.value }
                  : { error: routes.error.message },
              );
              return;
            }

            if (parsed.pathname === "/api/lighthouse") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const modeRaw = parsed.searchParams.get("mode");
              const mode =
                modeRaw === "run" || modeRaw === "ingest"
                  ? modeRaw
                  : "lab-fixture";
              const url = parsed.searchParams.get("url") ?? undefined;
              const portRaw = parsed.searchParams.get("port");
              const port = portRaw ? Number(portRaw) : undefined;
              const routesRaw = parsed.searchParams.get("routes");
              const routes = routesRaw
                ? routesRaw
                    .split(",")
                    .map((r) => r.trim())
                    .filter(Boolean)
                : undefined;
              const formFactorRaw = parsed.searchParams.get("formFactor");
              const formFactor =
                formFactorRaw === "desktop" || formFactorRaw === "mobile"
                  ? formFactorRaw
                  : undefined;
              const stream =
                parsed.searchParams.get("stream") === "1" || mode === "run";
              if (stream) {
                res.statusCode = 200;
                res.setHeader(
                  "Content-Type",
                  "application/x-ndjson; charset=utf-8",
                );
                res.setHeader("Cache-Control", "no-cache");
                const writeLine = (obj: unknown): void => {
                  res.write(`${JSON.stringify(obj)}\n`);
                };
                try {
                  const report = await loadLighthouseLab(root, {
                    mode,
                    ...(url ? { url } : {}),
                    ...(port !== undefined && !Number.isNaN(port)
                      ? { port }
                      : {}),
                    ...(routes && routes.length > 0 ? { routes } : {}),
                    ...(formFactor ? { formFactor } : {}),
                    onProgress: (event) =>
                      writeLine({
                        type: "progress",
                        message: event.message,
                        ...(event.detail !== undefined
                          ? { detail: event.detail }
                          : {}),
                      }),
                  });
                  writeLine({ type: "report", report });
                } catch (err: unknown) {
                  writeLine({
                    type: "error",
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
                res.end();
                return;
              }
              const report = await loadLighthouseLab(root, {
                mode,
                ...(url ? { url } : {}),
                ...(port !== undefined && !Number.isNaN(port) ? { port } : {}),
                ...(routes && routes.length > 0 ? { routes } : {}),
                ...(formFactor ? { formFactor } : {}),
              });
              sendJson(res, 200, report);
              return;
            }

            if (parsed.pathname === "/api/bundle-analyze") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const modeRaw = parsed.searchParams.get("mode");
              const mode =
                modeRaw === "ingest" || modeRaw === "discover"
                  ? modeRaw
                  : "run";
              const packageId =
                parsed.searchParams.get("packageId") ?? undefined;
              const packagePath =
                parsed.searchParams.get("packagePath") ?? undefined;
              const scriptName =
                parsed.searchParams.get("scriptName") ?? undefined;
              const reportPath =
                parsed.searchParams.get("reportPath") ?? undefined;
              const stream = parsed.searchParams.get("stream") === "1";
              if (stream) {
                res.statusCode = 200;
                res.setHeader(
                  "Content-Type",
                  "application/x-ndjson; charset=utf-8",
                );
                res.setHeader("Cache-Control", "no-cache");
                const writeLine = (obj: unknown): void => {
                  res.write(`${JSON.stringify(obj)}\n`);
                };
                try {
                  const report = await loadBundleAnalyze(root, {
                    mode,
                    ...(packageId ? { packageId } : {}),
                    ...(packagePath ? { packagePath } : {}),
                    ...(scriptName ? { scriptName } : {}),
                    ...(reportPath ? { reportPath } : {}),
                    onProgress: (event) =>
                      writeLine({
                        type: "progress",
                        message: event.message,
                        ...(event.detail !== undefined
                          ? { detail: event.detail }
                          : {}),
                      }),
                  });
                  writeLine({ type: "report", report });
                } catch (err: unknown) {
                  writeLine({
                    type: "error",
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
                res.end();
                return;
              }
              const report = await loadBundleAnalyze(root, {
                mode,
                ...(packageId ? { packageId } : {}),
                ...(packagePath ? { packagePath } : {}),
                ...(scriptName ? { scriptName } : {}),
                ...(reportPath ? { reportPath } : {}),
              });
              sendJson(res, 200, report);
              return;
            }

            if (parsed.pathname === "/api/detect-bundle-analyze") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const packageId =
                parsed.searchParams.get("packageId") ?? undefined;
              const ws = await getIndexedWorkspace(root);
              const cap = ws.detectBundleAnalyzeCapability(
                packageId ? { packageId } : undefined,
              );
              if (!cap.ok) {
                sendJson(res, 500, { error: cap.error.message });
                return;
              }
              sendJson(res, 200, cap.value);
              return;
            }

            if (parsed.pathname === "/api/graph") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const graph = await loadGraph(root);
              sendJson(res, 200, graph);
              return;
            }

            if (parsed.pathname === "/api/impact") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const kindRaw = parsed.searchParams.get("kind") ?? "file";
              const kind = kindRaw === "symbol" ? "symbol" : "file";
              const id = parsed.searchParams.get("id")?.trim() ?? "";
              if (id === "") {
                sendJson(res, 400, { error: "id is required" });
                return;
              }
              const path = parsed.searchParams.get("path")?.trim();
              const newName = parsed.searchParams.get("newName")?.trim();
              const intentRaw = parsed.searchParams.get("intent")?.trim();
              const intent =
                intentRaw === "delete" || intentRaw === "edit"
                  ? intentRaw
                  : undefined;
              const bundle = await loadImpactBundle(root, {
                kind,
                id,
                ...(path ? { path } : {}),
                ...(newName ? { newName } : {}),
                ...(intent ? { intent } : {}),
              });
              sendJson(res, 200, bundle);
              return;
            }

            if (parsed.pathname === "/api/review" && req.method === "POST") {
              const body = (await readJsonBody(req)) as {
                root?: string;
                paths?: unknown;
                base?: unknown;
              };
              const root = resolveRequestedRoot(body.root ?? null);
              const paths = Array.isArray(body.paths)
                ? body.paths.filter(
                    (p): p is string =>
                      typeof p === "string" && p.trim() !== "",
                  )
                : [];
              if (paths.length === 0) {
                sendJson(res, 400, { error: "paths is required" });
                return;
              }
              const base =
                typeof body.base === "string" && body.base.trim() !== ""
                  ? body.base.trim()
                  : undefined;
              const report = await loadChangeReview(root, {
                paths,
                ...(base === undefined ? {} : { base }),
              });
              sendJson(res, 200, report);
              return;
            }

            if (parsed.pathname === "/api/symbols") {
              const root = resolveRequestedRoot(
                parsed.searchParams.get("root"),
              );
              const q = (
                parsed.searchParams.get("q")?.trim() ?? ""
              ).toLowerCase();
              if (q.length < 1) {
                sendJson(res, 200, { hits: [] });
                return;
              }
              const ws = await getIndexedWorkspace(root);
              const kg = ws.getKnowledgeGraph();
              if (!kg.ok) {
                throw new Error(
                  `getKnowledgeGraph failed: ${kg.error.message}`,
                );
              }
              const hits = kg.value.symbols
                .filter((s) => s.name.toLowerCase().includes(q))
                .sort((a, b) => {
                  const aExact = a.name.toLowerCase() === q ? 0 : 1;
                  const bExact = b.name.toLowerCase() === q ? 0 : 1;
                  if (aExact !== bExact) return aExact - bExact;
                  return a.name.localeCompare(b.name);
                })
                .slice(0, 30)
                .map((h) => ({
                  id: h.id,
                  name: h.name,
                  kind: h.kind,
                  path: h.path,
                  exported: h.exported,
                }));
              sendJson(res, 200, { hits });
              return;
            }

            if (
              parsed.pathname === "/api/apply-rename" &&
              req.method === "POST"
            ) {
              const body = (await readJsonBody(req)) as {
                root?: string;
                input?: ApplyRenameInput;
              };
              const root = resolveRequestedRoot(body.root ?? null);
              if (!body.input || typeof body.input !== "object") {
                sendJson(res, 400, { ok: false, error: "input is required" });
                return;
              }
              const result = await applyRenameOnDisk(root, body.input);
              sendJson(res, 200, result);
              return;
            }

            // Everything under /api/ is this plugin's. Falling through to
            // `next()` handed the request to Vite's SPA fallback, which served
            // index.html with a 200 — so a client calling a mistyped or
            // removed route got an HTML document to JSON.parse, and the error
            // it reported named the parser rather than the missing route.
            sendJson(res, 404, {
              error: `No such API route: ${req.method ?? "GET"} ${parsed.pathname}`,
            });
          } catch (error) {
            sendJson(res, error instanceof BadRequest ? 400 : 500, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      });
    },
    async buildStart() {
      const outDir = join(appRoot, "public");
      await mkdir(outDir, { recursive: true });
      const maps: Partial<Record<MapZoomLevel, RepositoryMap>> = {};
      for (const zoom of ZOOM_LEVELS) {
        maps[zoom] = await loadMap(zoom, fixtureRoot);
      }
      await writeFile(
        join(outDir, "fixture-maps.json"),
        JSON.stringify(maps),
        "utf8",
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), prismMapApi()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@repo-prism/ui/tokens.css": join(uiSrc, "tokens.css"),
      "@repo-prism/ui/map.css": join(uiSrc, "map.css"),
      "@repo-prism/ui/primitives.css": join(uiSrc, "primitives.css"),
      "@repo-prism/ui": join(uiSrc, "index.ts"),
      "@repo-prism/app-shell/styles.css": join(appShellSrc, "styles.css"),
      "@repo-prism/app-shell": join(appShellSrc, "index.ts"),
    },
  },
});
