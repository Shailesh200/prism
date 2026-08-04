import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  BundleWeightReportSchema,
  CwvReportSchema,
  PrismErrorCode,
  type CwvReport,
  type JsonValue,
  type PrismError,
  type Result,
  type UtilityJob,
  type UtilityJobProgress,
  err,
  ok,
  parseDto,
  prismError,
} from "@prism/shared";
import type { ConsentStore } from "./consent.js";
import {
  LIGHTHOUSE_CALLOUT,
  buildCwvReport,
  labFixtureLighthouseJson,
  labUrlForRoute,
  medianMergeLighthouseReports,
  mergeRouteCwvReports,
} from "./cwv.js";
import type { IngestStore } from "./ingest-store.js";
import {
  ensureLighthouseCli,
  probeLabUrl,
  resolveSystemChrome,
  runLighthouseCli,
  lighthouseLooksLikeNotFound,
} from "./lighthouse-runner.js";
import {
  PRISM_LAB_PORT,
  discoverLabUrl,
  startLabPreviewServer,
  type LabServerHandle,
} from "./lab-server.js";
import { discoverFrontendAppRoutes } from "./frontend-routes.js";
import {
  bundleAnalyzeProgressDetail,
  runBundleAnalyze,
} from "./bundle-analyze-runner.js";
import {
  BUNDLE_WEIGHT_CALLOUT,
  buildBundleWeightReport,
  emptyUnsupportedBundleReport,
} from "./bundle-weight.js";
import { INGEST_KIND_BUNDLE_STATS } from "./bundle-weight-from-artifact.js";

export type LighthouseJobOptions = {
  readonly url?: string;
  readonly port?: number;
  /** Absolute or workspace-relative path to an existing Lighthouse JSON report. */
  readonly reportPath?: string;
  /**
   * `lab-fixture` — deterministic local report (default, CI-safe).
   * `ingest` — require `reportPath`.
   * `run` — system Chrome + Lighthouse CLI under `.prism/tools` (never fixtures).
   */
  readonly mode?: "lab-fixture" | "ingest" | "run";
  /**
   * Optional explicit routes to measure (e.g. `["/", "/login"]`).
   * When set, only these paths are measured (first = primary / 3-pass).
   * When omitted, discovered routes are measured (capped).
   */
  readonly routes?: readonly string[];
};

export type BundleAnalyzeJobOptions = {
  /**
   * `run` — spawn project analyze script or Prism-managed (default).
   * `ingest` — parse `reportPath` only (no spawn).
   * `discover` — scan for fresh local analyzer JSON (assist after a prior run).
   */
  readonly mode?: "run" | "ingest" | "discover";
  /** Absolute or workspace-relative path to existing stats JSON (`mode=ingest`). */
  readonly reportPath?: string;
  readonly packagePath?: string;
  readonly scriptName?: string;
  readonly timeoutMs?: number;
  readonly heavyChunkBytes?: number;
  readonly heavyModuleBytes?: number;
};

export type StartUtilityJobInput = {
  readonly kind: string;
  readonly packageId?: string;
  readonly consentGranted?: boolean;
  readonly labels?: readonly string[];
  readonly onProgress?: (progress: UtilityJobProgress) => void;
  readonly lighthouse?: LighthouseJobOptions;
  readonly bundleAnalyze?: BundleAnalyzeJobOptions;
};

/** Well-known P0 job: local echo ingest (no network). */
export const UTILITY_JOB_ECHO = "echo-ingest" as const;

/** Well-known P0 job: requires consent; still local-only stub for gate testing. */
export const UTILITY_JOB_REMOTE_PROBE_STUB = "remote-probe-stub" as const;

/** Well-known P1 job: opt-in Lighthouse / CWV (FE-01). */
export const UTILITY_JOB_LIGHTHOUSE = "lighthouse" as const;

/** Well-known M-050 job: consent-gated frontend bundle analyze. */
export const UTILITY_JOB_BUNDLE_STATS = "bundle-stats" as const;

export type UtilityJobService = {
  start(input: StartUtilityJobInput): Promise<Result<UtilityJob, PrismError>>;
  get(jobId: string): Result<UtilityJob, PrismError>;
  list(): Result<UtilityJob[], PrismError>;
};

function newJobId(): string {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

function requiresConsent(kind: string): boolean {
  return (
    kind === UTILITY_JOB_REMOTE_PROBE_STUB ||
    kind === UTILITY_JOB_LIGHTHOUSE ||
    kind === UTILITY_JOB_BUNDLE_STATS
  );
}

function primaryPathForLog(labUrl: string): string {
  try {
    let path = new URL(labUrl).pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path || "/";
  } catch {
    return "/";
  }
}

/** Progressive CWV detail for UI (primary first, then each route). */
function cwvRouteProgressDetail(options: {
  readonly measuringRoute: string | null;
  readonly measuredRoutes: readonly string[];
  readonly report?: CwvReport;
}): JsonValue {
  return {
    kind: "cwv-route-progress",
    measuringRoute: options.measuringRoute,
    measuredRoutes: [...options.measuredRoutes],
    ...(options.report
      ? { report: options.report as unknown as JsonValue }
      : {}),
  };
}

export function createUtilityJobService(options: {
  readonly ingest: IngestStore;
  readonly consent: ConsentStore;
  readonly workspaceRoot: string;
}): UtilityJobService {
  const jobs = new Map<string, UtilityJob>();

  const put = (job: UtilityJob): UtilityJob => {
    jobs.set(job.id, job);
    return job;
  };

  return {
    async start(input) {
      const kind = input.kind.trim();
      if (!kind) {
        return err(prismError(PrismErrorCode.VALIDATION, "Job kind is empty"));
      }

      const needsConsent = requiresConsent(kind);
      if (needsConsent) {
        if (input.consentGranted === true) {
          const recorded = await options.consent.set(kind, true);
          if (!recorded.ok) return recorded;
        } else {
          const gate = await options.consent.requireGranted(kind);
          if (!gate.ok) return gate;
        }
      }

      const createdAt = now();
      let job: UtilityJob = {
        id: newJobId(),
        kind,
        status: "queued",
        createdAt,
        updatedAt: createdAt,
        requiresConsent: needsConsent,
        ...(input.consentGranted === undefined
          ? {}
          : { consentGranted: input.consentGranted }),
        ...(input.packageId === undefined
          ? {}
          : { packageId: input.packageId }),
        progress: { phase: "queued", percent: 0, message: "Queued" },
      };
      put(job);

      const emit = (
        progress: UtilityJobProgress,
        status: UtilityJob["status"],
      ) => {
        job = {
          ...job,
          status,
          updatedAt: now(),
          progress,
        };
        put(job);
        input.onProgress?.(progress);
      };

      const fail = (code: string, message: string): UtilityJob => {
        job = {
          ...job,
          status: "failed",
          updatedAt: now(),
          error: { code, message },
          progress: { phase: "failed", percent: 100, message },
        };
        put(job);
        return job;
      };

      emit({ phase: "running", percent: 10, message: "Starting" }, "running");

      try {
        if (kind === UTILITY_JOB_LIGHTHOUSE) {
          emit(
            {
              phase: "callout",
              percent: 20,
              message: LIGHTHOUSE_CALLOUT,
            },
            "running",
          );

          const lh = input.lighthouse ?? {};
          const preferredPort = lh.port;
          const mode = lh.mode ?? (lh.reportPath ? "ingest" : "lab-fixture");

          let source: "lighthouse" | "ingest" | "lab-fixture" = "lab-fixture";
          let raw: unknown;
          let url =
            lh.url ?? `http://127.0.0.1:${preferredPort ?? PRISM_LAB_PORT}/`;
          let port = preferredPort ?? PRISM_LAB_PORT;
          let labHandle: LabServerHandle | null = null;

          if (mode === "ingest") {
            if (!lh.reportPath) {
              return ok(
                fail(
                  "MISSING_REPORT_PATH",
                  "lighthouse mode=ingest requires lighthouse.reportPath",
                ),
              );
            }
            const abs = isAbsolute(lh.reportPath)
              ? lh.reportPath
              : join(options.workspaceRoot, lh.reportPath);
            try {
              raw = JSON.parse(await readFile(abs, "utf8")) as unknown;
              source = "ingest";
            } catch (cause) {
              return ok(
                fail(
                  "REPORT_READ_FAILED",
                  `Failed to read Lighthouse report: ${String(cause)}`,
                ),
              );
            }
          } else if (mode === "run") {
            emit(
              {
                phase: "detect-chrome",
                percent: 30,
                message: "Looking for system Chrome/Chromium/Edge",
              },
              "running",
            );
            const chrome = await resolveSystemChrome();
            if (!chrome.ok) {
              return ok(fail("CHROME_NOT_FOUND", chrome.message));
            }

            emit(
              {
                phase: "ensure-cli",
                percent: 45,
                message:
                  "Ensuring Lighthouse CLI under .prism/tools/lighthouse",
              },
              "running",
            );
            const cli = await ensureLighthouseCli(options.workspaceRoot);
            if (!cli.ok) {
              return ok(fail("LIGHTHOUSE_INSTALL_FAILED", cli.message));
            }

            emit(
              {
                phase: "lighthouse-run",
                percent: 52,
                message:
                  "Looking for a local frontend (ports 3000, 5173, 4173, …)",
              },
              "running",
            );
            let reachable = await discoverLabUrl({
              ...(lh.url ? { url: lh.url } : {}),
              ...(preferredPort !== undefined ? { port: preferredPort } : {}),
            });

            if (!reachable.ok) {
              emit(
                {
                  phase: "lab-preview",
                  percent: 55,
                  message: `No app listening — building + starting production preview on :${preferredPort ?? PRISM_LAB_PORT}`,
                },
                "running",
              );
              const started = await startLabPreviewServer({
                workspaceRoot: options.workspaceRoot,
                port: preferredPort ?? PRISM_LAB_PORT,
                onProgress: (message) =>
                  emit(
                    { phase: "lab-preview", percent: 57, message },
                    "running",
                  ),
              });
              if (!started.ok) {
                return ok(
                  fail(
                    "LAB_URL_UNREACHABLE",
                    `Could not start a production preview: ${started.message}`,
                  ),
                );
              }
              labHandle = started.handle;
              reachable = {
                ok: true,
                url: started.handle.url,
                port: started.handle.port,
              };
            }

            url = reachable.url;
            port = reachable.port;

            const PRIMARY_PASSES = 3;
            /** One pass per extra route — keeps multi-route labs tractable. */
            const EXTRA_PASSES = 1;
            /** Cap auto-discovered extras; explicit `routes` are not capped. */
            const MAX_EXTRA_ROUTES = 50;

            const normalizeRoutePath = (r: string): string => {
              let path = r.startsWith("/") ? r : `/${r}`;
              if (path.length > 1 && path.endsWith("/")) {
                path = path.slice(0, -1);
              }
              return path || "/";
            };

            const requestedRoutes = [
              ...new Set(
                (lh.routes ?? [])
                  .map(normalizeRoutePath)
                  .filter((r) => !r.includes(":")),
              ),
            ];

            emit(
              {
                phase: "lighthouse-run",
                percent: 58,
                message: `Running Lighthouse against ${url} (${PRIMARY_PASSES} passes · median · Chrome: ${chrome.source})`,
              },
              "running",
            );

            const runPasses = async (
              targetUrl: string,
              passCount: number,
              label: string,
              percentBase: number,
            ): Promise<
              { ok: true; lhr: unknown } | { ok: false; message: string }
            > => {
              const passes: unknown[] = [];
              for (let i = 1; i <= passCount; i++) {
                emit(
                  {
                    phase: "lighthouse-run",
                    percent: Math.min(92, percentBase + i),
                    message:
                      passCount > 1
                        ? `${label} · pass ${i}/${passCount}…`
                        : `${label}…`,
                  },
                  "running",
                );
                const ran = await runLighthouseCli({
                  workspaceRoot: options.workspaceRoot,
                  url: targetUrl,
                  chromePath: chrome.path,
                  bin: cli.bin,
                  onLog: (line) =>
                    emit(
                      {
                        phase: "lighthouse-run",
                        percent: Math.min(92, percentBase + i),
                        message: line,
                      },
                      "running",
                    ),
                });
                if (!ran.ok) return { ok: false, message: ran.message };
                passes.push(ran.lhr);
              }
              return {
                ok: true,
                lhr:
                  passes.length === 1
                    ? passes[0]!
                    : medianMergeLighthouseReports(passes),
              };
            };

            let primaryReport: CwvReport | null = null;
            const extraRouteReports: Array<{
              route: string;
              report: CwvReport;
            }> = [];
            let measuredRoutes: string[] = [];

            const snapshotReport = (): CwvReport | undefined => {
              if (!primaryReport) return undefined;
              return extraRouteReports.length > 0
                ? mergeRouteCwvReports(primaryReport, extraRouteReports)
                : primaryReport;
            };

            const emitRouteProgress = (
              message: string,
              percent: number,
              measuringRoute: string | null,
            ): void => {
              const report = snapshotReport();
              emit(
                {
                  phase: "lighthouse-run",
                  percent,
                  message,
                  detail: cwvRouteProgressDetail({
                    measuringRoute,
                    measuredRoutes,
                    ...(report ? { report } : {}),
                  }),
                },
                "running",
              );
            };

            try {
              let primaryPath = requestedRoutes[0] ?? primaryPathForLog(url);
              let extras: string[];
              if (requestedRoutes.length > 0) {
                url = labUrlForRoute(url, primaryPath);
                extras = requestedRoutes.slice(1);
              } else {
                primaryPath = primaryPathForLog(url);
                extras = discoverFrontendAppRoutes(options.workspaceRoot)
                  .map(normalizeRoutePath)
                  .filter((r) => !r.includes(":") && r !== primaryPath)
                  .slice(0, MAX_EXTRA_ROUTES);
              }

              emitRouteProgress(`Measuring ${primaryPath}…`, 58, primaryPath);

              const primary = await runPasses(
                url,
                PRIMARY_PASSES,
                `Measuring ${primaryPath}`,
                58,
              );
              if (!primary.ok) {
                return ok(fail("LIGHTHOUSE_RUN_FAILED", primary.message));
              }
              if (lighthouseLooksLikeNotFound(primary.lhr)) {
                return ok(
                  fail(
                    "LIGHTHOUSE_NOT_FOUND",
                    `${primaryPath} looks like a not-found page — pick a real route to measure.`,
                  ),
                );
              }
              raw = primary.lhr;
              source = "lighthouse";
              primaryReport = buildCwvReport({
                url,
                source,
                lighthouseOrPayload: raw,
                port,
              });
              measuredRoutes = [primaryPath];

              emitRouteProgress(
                extras.length > 0
                  ? `Primary route done — measuring ${extras.length} more route(s) one by one…`
                  : "Primary route done — no additional routes to measure.",
                70,
                null,
              );

              for (let i = 0; i < extras.length; i++) {
                const route = extras[i]!;
                const routeUrl = labUrlForRoute(url, route);
                const pct =
                  70 + Math.round(((i + 1) / Math.max(1, extras.length)) * 20);

                emitRouteProgress(
                  `Measuring ${route} (${i + 1}/${extras.length})…`,
                  pct - 1,
                  route,
                );

                const probe = await probeLabUrl(routeUrl);
                if (!probe.ok) {
                  emitRouteProgress(
                    `Skip ${route} — ${probe.message}`,
                    pct,
                    null,
                  );
                  continue;
                }
                const ran = await runPasses(
                  routeUrl,
                  EXTRA_PASSES,
                  `Measuring ${route} (${i + 1}/${extras.length})`,
                  pct - 1,
                );
                if (!ran.ok) {
                  emitRouteProgress(
                    `Skip ${route} — ${ran.message}`,
                    pct,
                    null,
                  );
                  continue;
                }
                if (lighthouseLooksLikeNotFound(ran.lhr)) {
                  emitRouteProgress(
                    `Skip ${route} — looks like a not-found page`,
                    pct,
                    null,
                  );
                  continue;
                }
                extraRouteReports.push({
                  route,
                  report: buildCwvReport({
                    url: routeUrl,
                    source: "lighthouse",
                    lighthouseOrPayload: ran.lhr,
                    port,
                  }),
                });
                measuredRoutes = [...measuredRoutes, route];
                emitRouteProgress(
                  `Measured ${route} (${measuredRoutes.length} route(s) so far)`,
                  pct,
                  null,
                );
              }

              emitRouteProgress(
                `Lab measured ${measuredRoutes.length} route(s)`,
                92,
                null,
              );
            } finally {
              if (labHandle) {
                emit(
                  {
                    phase: "lab-preview",
                    percent: 94,
                    message: "Stopping Prism lab preview server",
                  },
                  "running",
                );
                await labHandle.stop();
                labHandle = null;
              }
            }

            if (!primaryReport) {
              return ok(
                fail(
                  "LIGHTHOUSE_RUN_FAILED",
                  "Lighthouse finished without a primary CWV report.",
                ),
              );
            }

            const report =
              extraRouteReports.length > 0
                ? mergeRouteCwvReports(primaryReport, extraRouteReports)
                : primaryReport;
            const parsed = parseDto(CwvReportSchema, report);
            if (!parsed.ok) {
              return ok(fail("CWV_VALIDATION", parsed.message));
            }

            emit(
              {
                phase: "writing",
                percent: 96,
                message: "Persisting CWV ingest artifact",
                detail: cwvRouteProgressDetail({
                  measuringRoute: null,
                  measuredRoutes,
                  report: parsed.value,
                }),
              },
              "running",
            );

            const written = await options.ingest.write({
              kind: "lighthouse-cwv",
              payload: parsed.value as unknown as JsonValue,
              sourceJobId: job.id,
              ...(input.packageId === undefined
                ? {}
                : { packageId: input.packageId }),
              labels: [...(input.labels ?? []), "m041-p1", "cwv"],
            });
            if (!written.ok) {
              return ok(fail(written.error.code, written.error.message));
            }

            job = {
              ...job,
              status: "succeeded",
              updatedAt: now(),
              resultArtifactId: written.value.id,
              progress: {
                phase: "ready",
                percent: 100,
                message: `CWV report ready · ${measuredRoutes.length} route(s)`,
                detail: cwvRouteProgressDetail({
                  measuringRoute: null,
                  measuredRoutes,
                  report: parsed.value,
                }),
              },
            };
            put(job);
            input.onProgress?.(job.progress!);
            return ok(job);
          } else {
            raw = labFixtureLighthouseJson({ url });
            source = "lab-fixture";
            emit(
              {
                phase: "lab-fixture",
                percent: 50,
                message: "Writing lab-fixture CWV report (CI-safe).",
              },
              "running",
            );
          }

          const report = buildCwvReport({
            url,
            source,
            lighthouseOrPayload: raw,
            port,
          });
          const parsed = parseDto(CwvReportSchema, report);
          if (!parsed.ok) {
            return ok(fail("CWV_VALIDATION", parsed.message));
          }

          emit(
            {
              phase: "writing",
              percent: 80,
              message: "Persisting CWV ingest artifact",
            },
            "running",
          );

          const written = await options.ingest.write({
            kind: "lighthouse-cwv",
            payload: parsed.value as unknown as JsonValue,
            sourceJobId: job.id,
            ...(input.packageId === undefined
              ? {}
              : { packageId: input.packageId }),
            labels: [...(input.labels ?? []), "m041-p1", "cwv"],
          });
          if (!written.ok) {
            return ok(fail(written.error.code, written.error.message));
          }

          job = {
            ...job,
            status: "succeeded",
            updatedAt: now(),
            resultArtifactId: written.value.id,
            progress: {
              phase: "ready",
              percent: 100,
              message: "CWV report ready",
            },
          };
          put(job);
          input.onProgress?.(job.progress!);
          return ok(job);
        }

        if (kind === UTILITY_JOB_BUNDLE_STATS) {
          emit(
            {
              phase: "callout",
              percent: 15,
              message: BUNDLE_WEIGHT_CALLOUT,
              detail: bundleAnalyzeProgressDetail({
                phase: "callout",
                message: BUNDLE_WEIGHT_CALLOUT,
              }),
            },
            "running",
          );

          const ba = input.bundleAnalyze ?? {};
          const mode = ba.mode ?? (ba.reportPath ? "ingest" : "run");

          emit(
            {
              phase: "analyzing",
              percent: 35,
              message:
                mode === "ingest"
                  ? "Parsing bundle stats…"
                  : mode === "discover"
                    ? "Discovering local analyze output…"
                    : "Running local bundle analyze…",
              detail: bundleAnalyzeProgressDetail({
                phase: "analyzing",
                ...(ba.packagePath === undefined
                  ? {}
                  : { packagePath: ba.packagePath }),
              }),
            },
            "running",
          );

          const run = await runBundleAnalyze({
            workspaceRoot: options.workspaceRoot,
            ...(input.packageId === undefined
              ? {}
              : { packageId: input.packageId }),
            ...(ba.packagePath === undefined
              ? {}
              : { packagePath: ba.packagePath }),
            ...(ba.scriptName === undefined
              ? {}
              : { scriptName: ba.scriptName }),
            mode,
            ...(ba.reportPath === undefined
              ? {}
              : { reportPath: ba.reportPath }),
            ...(ba.timeoutMs === undefined ? {} : { timeoutMs: ba.timeoutMs }),
            onProgress: (message) => {
              emit(
                {
                  phase: "analyzing",
                  percent: 55,
                  message: message.slice(0, 500),
                  detail: bundleAnalyzeProgressDetail({
                    phase: "analyzing",
                    ...(ba.packagePath === undefined
                      ? {}
                      : { packagePath: ba.packagePath }),
                    message: message.slice(0, 500),
                  }),
                },
                "running",
              );
            },
          });

          const thresholds = {
            ...(ba.heavyChunkBytes === undefined
              ? {}
              : { heavyChunkBytes: ba.heavyChunkBytes }),
            ...(ba.heavyModuleBytes === undefined
              ? {}
              : { heavyModuleBytes: ba.heavyModuleBytes }),
          };

          let report;
          if (run.parsed) {
            report = buildBundleWeightReport({
              parsed: run.parsed,
              source: run.source,
              build: {
                bundler:
                  run.bundler === "unknown" ? run.parsed.bundler : run.bundler,
                mode: run.parsed.mode,
                timestamp: new Date().toISOString(),
                ...(run.packageName === undefined
                  ? {}
                  : { packageName: run.packageName }),
                ...(input.packageId === undefined
                  ? {}
                  : { packageId: input.packageId }),
                ...(run.scriptName === undefined
                  ? {}
                  : { scriptName: run.scriptName }),
              },
              thresholds,
            });
          } else {
            // Persist an honest empty report so the UI can show unsupported state.
            report = emptyUnsupportedBundleReport(
              run.errorMessage ??
                "Bundle analyze did not produce parsable stats.",
              {
                bundler: run.bundler,
                ...(run.packageName === undefined
                  ? {}
                  : { packageName: run.packageName }),
                ...(input.packageId === undefined
                  ? {}
                  : { packageId: input.packageId }),
              },
            );
            // For mode=run, treat hard failures as job failure (no silent success).
            if (mode === "run" && !run.parsed) {
              return ok(
                fail(
                  "BUNDLE_ANALYZE_FAILED",
                  run.errorMessage ??
                    "Bundle analyze failed — no parsable stats produced.",
                ),
              );
            }
          }

          const parsed = parseDto(BundleWeightReportSchema, report);
          if (!parsed.ok) {
            return ok(fail("BUNDLE_VALIDATION", parsed.message));
          }

          emit(
            {
              phase: "writing",
              percent: 85,
              message: "Persisting bundle-stats ingest artifact",
            },
            "running",
          );

          const written = await options.ingest.write({
            kind: INGEST_KIND_BUNDLE_STATS,
            payload: parsed.value as unknown as JsonValue,
            sourceJobId: job.id,
            ...(input.packageId === undefined
              ? {}
              : { packageId: input.packageId }),
            labels: [...(input.labels ?? []), "m050", "bundle-weight"],
          });
          if (!written.ok) {
            return ok(fail(written.error.code, written.error.message));
          }

          job = {
            ...job,
            status: "succeeded",
            updatedAt: now(),
            resultArtifactId: written.value.id,
            progress: {
              phase: "ready",
              percent: 100,
              message: run.parsed
                ? `Bundle report ready · ${parsed.value.overview.chunkCount} chunk(s)`
                : "Bundle report empty (unsupported / no stats)",
            },
          };
          put(job);
          input.onProgress?.(job.progress!);
          return ok(job);
        }

        if (
          kind !== UTILITY_JOB_ECHO &&
          kind !== UTILITY_JOB_REMOTE_PROBE_STUB
        ) {
          return ok(
            fail("UNKNOWN_JOB_KIND", `Unsupported utility job kind: ${kind}`),
          );
        }

        emit(
          { phase: "writing", percent: 60, message: "Writing ingest artifact" },
          "running",
        );

        const written = await options.ingest.write({
          kind:
            kind === UTILITY_JOB_REMOTE_PROBE_STUB ? "remote-probe" : "echo",
          payload: {
            jobKind: kind,
            message: "P0 foundation echo ingest",
            packageId: input.packageId ?? null,
            createdAt: now(),
          },
          sourceJobId: job.id,
          ...(input.packageId === undefined
            ? {}
            : { packageId: input.packageId }),
          labels: [...(input.labels ?? []), "m041-p0"],
        });
        if (!written.ok) {
          return ok(fail(written.error.code, written.error.message));
        }

        job = {
          ...job,
          status: "succeeded",
          updatedAt: now(),
          resultArtifactId: written.value.id,
          progress: {
            phase: "ready",
            percent: 100,
            message: "Report ready",
          },
        };
        put(job);
        input.onProgress?.(job.progress!);
        return ok(job);
      } catch (cause) {
        return ok(fail("JOB_FAILED", String(cause)));
      }
    },
    get(jobId) {
      const job = jobs.get(jobId);
      if (!job) {
        return err(
          prismError(
            PrismErrorCode.NOT_FOUND,
            `Utility job not found: ${jobId}`,
            { jobId },
          ),
        );
      }
      return ok(job);
    },
    list() {
      const list = [...jobs.values()].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      return ok(list);
    },
  };
}
