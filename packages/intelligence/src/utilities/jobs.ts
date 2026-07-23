import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  CwvReportSchema,
  PrismErrorCode,
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
} from "./cwv.js";
import type { IngestStore } from "./ingest-store.js";
import {
  ensureLighthouseCli,
  resolveSystemChrome,
  runLighthouseCli,
} from "./lighthouse-runner.js";
import {
  PRISM_LAB_PORT,
  discoverLabUrl,
  startLabPreviewServer,
  type LabServerHandle,
} from "./lab-server.js";

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
};

export type StartUtilityJobInput = {
  readonly kind: string;
  readonly packageId?: string;
  readonly consentGranted?: boolean;
  readonly labels?: readonly string[];
  readonly onProgress?: (progress: UtilityJobProgress) => void;
  readonly lighthouse?: LighthouseJobOptions;
};

/** Well-known P0 job: local echo ingest (no network). */
export const UTILITY_JOB_ECHO = "echo-ingest" as const;

/** Well-known P0 job: requires consent; still local-only stub for gate testing. */
export const UTILITY_JOB_REMOTE_PROBE_STUB = "remote-probe-stub" as const;

/** Well-known P1 job: opt-in Lighthouse / CWV (FE-01). */
export const UTILITY_JOB_LIGHTHOUSE = "lighthouse" as const;

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
    kind === UTILITY_JOB_REMOTE_PROBE_STUB || kind === UTILITY_JOB_LIGHTHOUSE
  );
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
                    `${reachable.message} · Auto-start failed: ${started.message}`,
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

            emit(
              {
                phase: "lighthouse-run",
                percent: 60,
                message: `Running Lighthouse against ${url} (Chrome: ${chrome.source})`,
              },
              "running",
            );
            try {
              const ran = await runLighthouseCli({
                workspaceRoot: options.workspaceRoot,
                url,
                chromePath: chrome.path,
                bin: cli.bin,
              });
              if (!ran.ok) {
                return ok(fail("LIGHTHOUSE_RUN_FAILED", ran.message));
              }
              raw = ran.lhr;
              source = "lighthouse";
            } finally {
              if (labHandle) {
                emit(
                  {
                    phase: "lab-preview",
                    percent: 75,
                    message: "Stopping Prism lab preview server",
                  },
                  "running",
                );
                await labHandle.stop();
                labHandle = null;
              }
            }
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
