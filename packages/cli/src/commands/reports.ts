/**
 * The standing reports (M-029): engineering health, testing, security, backend
 * and bundle weight.
 *
 * Each of these has a 0–100 score, so each takes `--fail-on`. Note the
 * inversion: these are *quality* scores where 100 is good, and `--fail-on high`
 * means "fail when things are bad", so the risk passed to the band helper is
 * `100 - score`. Getting that backwards would make a green pipeline mean the
 * opposite of what it says.
 */

import { ok, PrismErrorCode, err, prismError } from "@repo-prism/shared";
import { paint, renderFields, renderHeading, type Style } from "../output.js";
import type { CommandHandler } from "../runtime.js";
import { plural, qualityCell, renderTable, scoreCell, wrap } from "../table.js";
import {
  bound,
  meetsThreshold,
  parseFailOn,
  parseLimit,
  truncationNote,
} from "../thresholds.js";

/** Quality score (100 good) → risk score (100 bad), for banding. */
function asRisk(score: number): number {
  return 100 - score;
}

/** Bundle sizes in kB, because raw byte counts are unreadable at this scale. */
function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

/** A skipped check is not a passing one, so it is not green. */
const CHECK_STYLE: Record<string, Style> = {
  pass: "green",
  warn: "yellow",
  fail: "red",
  skip: "dim",
};

const SEVERITY_STYLE: Record<string, Style> = {
  info: "dim",
  low: "green",
  medium: "yellow",
  high: "red",
};

export const engineeringCommand: CommandHandler = async (context) => {
  const failOn = parseFailOn(context.args.option("failOn"));
  if (!failOn.ok) return failOn;
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.getEngineeringHealth();
  if (!report.ok) return report;

  const health = report.value;
  const worst = health.metrics.reduce(
    (max, metric) => Math.max(max, asRisk(metric.score)),
    0,
  );

  return ok({
    data: health,
    findings: meetsThreshold(worst, failOn.value),
    human({ color, width }) {
      const hotspots = bound(health.hotspots, limit.value);
      const lines = [
        renderHeading("Engineering health", color),
        "",
        ...wrap(health.summary, width),
        "",
        renderTable({
          columns: [
            { header: "METRIC", flex: true },
            { header: "SCORE", align: "right" },
            { header: "SEVERITY" },
          ],
          rows: health.metrics.map((metric) => [
            { text: metric.label },
            qualityCell(metric.score),
            { text: metric.severity, style: SEVERITY_STYLE[metric.severity] },
          ]),
          color,
          width,
        }),
      ];

      if (!health.gitAvailable) {
        lines.push(
          "",
          paint(
            "No local git history: churn, ownership and decay metrics are absent rather than zero.",
            "yellow",
            color,
          ),
        );
      }

      if (hotspots.items.length > 0) {
        lines.push(
          "",
          renderHeading("Hotspots", color),
          renderTable({
            columns: [
              { header: "FILE", flex: true },
              { header: "SCORE", align: "right" },
              { header: "KINDS" },
            ],
            rows: hotspots.items.map((hotspot) => [
              { text: hotspot.path },
              scoreCell(hotspot.score),
              { text: hotspot.kinds.join(", ") },
            ]),
            color,
            width,
          }),
        );
        const note = truncationNote(hotspots, "hotspots");
        if (note) lines.push(paint(note, "dim", color));
      }

      return lines.join("\n");
    },
  });
};

export const testingCommand: CommandHandler = async (context) => {
  const failOn = parseFailOn(context.args.option("failOn"));
  if (!failOn.ok) return failOn;
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.getTestingReport();
  if (!report.ok) return report;

  const testing = report.value;

  return ok({
    data: testing,
    findings: meetsThreshold(asRisk(testing.score), failOn.value),
    human({ color, width }) {
      const suites = bound(testing.suites, limit.value);
      const lines = [
        renderHeading("Testing", color),
        "",
        ...wrap(testing.summary, width),
        "",
        renderFields(
          [
            ["Runners", testing.runners.join(", ") || "none detected"],
            ["Suites", String(testing.suites.length)],
            [
              "Coverage",
              testing.coverage?.present
                ? `${Math.round(testing.coverage.linePct ?? 0)}% lines (${testing.coverage.source})`
                : "no coverage artifact on disk",
            ],
          ],
          color,
        ),
      ];

      if (suites.items.length > 0) {
        lines.push(
          "",
          renderTable({
            columns: [
              { header: "SUITE", flex: true },
              { header: "KIND" },
              { header: "FILES", align: "right" },
            ],
            rows: suites.items.map((suite) => [
              { text: suite.path },
              { text: suite.kind },
              { text: String(suite.fileCount) },
            ]),
            color,
            width,
          }),
        );
        const note = truncationNote(suites, "suites");
        if (note) lines.push(paint(note, "dim", color));
      }

      return lines.join("\n");
    },
  });
};

export const securityCommand: CommandHandler = async (context) => {
  const failOn = parseFailOn(context.args.option("failOn"));
  if (!failOn.ok) return failOn;
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.getSecurityReport();
  if (!report.ok) return report;

  const security = report.value;

  return ok({
    data: security,
    findings: meetsThreshold(asRisk(security.score), failOn.value),
    human({ color, width }) {
      const checks = bound(security.checks, limit.value);
      const lines = [
        renderHeading("Security posture", color),
        "",
        ...wrap(security.summary, width),
        "",
        renderFields(
          [
            [
              // `tools` is the catalogue of tools Prism looks for, not the ones
              // it found. Printing it unfiltered claimed eight tools were
              // present in a repository that has none.
              "Tools detected",
              security.tools
                .filter((tool) => tool.present)
                .map((tool) => tool.name)
                .join(", ") || "none",
            ],
          ],
          color,
          width,
        ),
        "",
        paint(
          "This is a left-shift checklist of local configuration, not a vulnerability scan.",
          "dim",
          color,
        ),
      ];

      if (checks.items.length > 0) {
        lines.push(
          "",
          renderTable({
            columns: [{ header: "CHECK", flex: true }, { header: "STATUS" }],
            rows: checks.items.map((check) => [
              { text: check.title },
              {
                text: check.status,
                style: CHECK_STYLE[check.status],
              },
            ]),
            color,
            width,
          }),
        );
        const note = truncationNote(checks, "checks");
        if (note) lines.push(paint(note, "dim", color));
      }

      return lines.join("\n");
    },
  });
};

export const backendCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const report = await opened.value.getBackendReport();
  if (!report.ok) return report;

  const backend = report.value;

  return ok({
    data: backend,
    human({ color, width }) {
      const endpoints = bound(backend.endpoints, limit.value);
      const lines = [
        renderHeading("Backend", color),
        "",
        ...wrap(backend.summary, width),
        "",
        renderFields(
          [
            ["Frameworks", backend.frameworksDetected.join(", ") || "none"],
            ["Endpoints", String(backend.endpoints.length)],
            ["Data layer", String(backend.dataLayer.length)],
            ["Env vars", String(backend.envVars.length)],
            ["Background jobs", String(backend.background.length)],
          ],
          color,
          width,
        ),
      ];

      if (endpoints.items.length > 0) {
        lines.push(
          "",
          renderTable({
            columns: [
              { header: "METHOD" },
              { header: "ROUTE", flex: true },
              { header: "HANDLER", flex: false },
            ],
            rows: endpoints.items.map((endpoint) => [
              { text: endpoint.method },
              { text: endpoint.path },
              { text: endpoint.handlerFile },
            ]),
            color,
            width,
          }),
        );
        const note = truncationNote(endpoints, "endpoints");
        if (note) lines.push(paint(note, "dim", color));
      }

      return lines.join("\n");
    },
  });
};

export const bundleCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const artifactId = context.args.option("artifact");
  const opened = await context.open();
  if (!opened.ok) return opened;

  // Bundle weight reads a build artifact rather than the source tree: Prism
  // never runs a build, so without one there is nothing honest to report.
  if (artifactId === undefined) {
    const capability = opened.value.detectBundleAnalyzeCapability();
    if (!capability.ok) return capability;
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        capability.value.supported
          ? `bundle needs a stats artifact: pass --artifact <id>. This workspace can produce one via ${capability.value.preferredStrategy}.`
          : `bundle needs a stats artifact, and this workspace cannot produce one: ${capability.value.reason ?? "no analyzable bundler detected"}`,
      ),
    );
  }

  const report = await opened.value.getBundleWeightReport(artifactId);
  if (!report.ok) return report;

  const bundle = report.value;

  return ok({
    data: bundle,
    human({ color, width }) {
      if (bundle.unsupportedReason) {
        return `Bundle weight unavailable: ${bundle.unsupportedReason}`;
      }

      const chunks = bound(bundle.chunks, limit.value);
      const lines = [
        renderHeading("Bundle weight", color),
        "",
        ...wrap(bundle.callout, width),
        "",
        renderFields(
          [
            ["Source", bundle.source],
            ["Collected", bundle.collectedAt],
            ["Chunks", String(bundle.chunks.length)],
          ],
          color,
          width,
        ),
      ];

      if (chunks.items.length > 0) {
        lines.push(
          "",
          renderTable({
            columns: [
              { header: "CHUNK", flex: true },
              { header: "RAW", align: "right" },
              { header: "GZIP", align: "right" },
              { header: "LOAD" },
            ],
            rows: chunks.items.map((chunk) => [
              { text: chunk.name },
              { text: kb(chunk.bytes.raw) },
              {
                text:
                  chunk.bytes.gzip === undefined ? "—" : kb(chunk.bytes.gzip),
              },
              { text: chunk.loadType },
            ]),
            color,
            width,
          }),
        );
        const note = truncationNote(chunks, "chunks");
        if (note) lines.push(paint(note, "dim", color));
      }

      return lines.join("\n");
    },
  });
};

export const packagesCommand: CommandHandler = async (context) => {
  const limit = parseLimit(context.args.option("limit"));
  if (!limit.ok) return limit;

  const opened = await context.open();
  if (!opened.ok) return opened;

  const result = await opened.value.listPackages();
  if (!result.ok) return result;

  const packages = bound(result.value, limit.value);

  return ok({
    data: {
      packages: packages.items,
      totalCount: packages.totalCount,
      truncated: packages.truncated,
    },
    human({ color, width }) {
      if (packages.items.length === 0) {
        return "No packages found. This looks like a single-package repository.";
      }

      const lines = [
        renderHeading(plural(packages.totalCount, "package"), color),
        "",
        renderTable({
          columns: [{ header: "PACKAGE" }, { header: "ROOT", flex: true }],
          rows: packages.items.map((pkg) => [
            { text: pkg.name ?? pkg.id },
            { text: pkg.rootDir === "" ? "." : pkg.rootDir },
          ]),
          color,
          width,
        }),
      ];

      const note = truncationNote(packages, "packages");
      if (note) lines.push(paint(note, "dim", color));
      return lines.join("\n");
    },
  });
};
