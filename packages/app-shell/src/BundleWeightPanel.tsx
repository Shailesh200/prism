/**
 * Frontend Domain — Bundle / Weight panel (M-050).
 */

import type {
  BundleAnalyzeCapability,
  BundleChunk,
  BundleWeightReport,
} from "@prism/shared";
import { InfoTip, Select } from "@prism/ui";
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  Loader2,
  Package,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useAppShellClient } from "./client-context.js";
import { BundleTreemap } from "./BundleTreemap.js";
import type { WorkspacePackageInfo } from "./types.js";

function formatBytes(n: number): string {
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fileNameOnly(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const base = norm.split("/").filter(Boolean).pop();
  return base && base.length > 0 ? base : path;
}

function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  try {
    return new Date(t).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function relativeTime(isoOrMs: string | number): string {
  const t = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(t)) return "—";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

function readStore<T>(key: string): T | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStore(key: string, value: unknown): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

type PackageAnalyzeCache = {
  report: BundleWeightReport;
  analyzedAt: string;
};

type BundleSnapshot = {
  /** @deprecated single-report cache — migrated into byPackage */
  report?: BundleWeightReport | null;
  selectedPackageId?: string;
  byPackage?: Record<string, PackageAnalyzeCache>;
};

function storeKey(repoLabel: string): string {
  return `prism:dm:${repoLabel}:frontend:bundle-weight`;
}

export type BundleWeightPanelHandle = {
  runAnalyze: () => Promise<void>;
  readonly busy: boolean;
  readonly supported: boolean;
};

export type BundleWeightPanelProps = {
  readonly repoLabel: string;
  /**
   * When true, omit the title / Analyze chrome — the parent Frontend accordion
   * owns those controls. Package select + report body still render here.
   */
  readonly embedded?: boolean;
};

export const BundleWeightPanel = forwardRef<
  BundleWeightPanelHandle,
  BundleWeightPanelProps
>(function BundleWeightPanel(props, ref): React.ReactElement {
  const client = useAppShellClient();
  const embedded = props.embedded === true;
  const [capability, setCapability] = useState<BundleAnalyzeCapability | null>(
    null,
  );
  const [packages, setPackages] = useState<WorkspacePackageInfo[]>([]);
  const [packageId, setPackageId] = useState<string>("");
  const [byPackage, setByPackage] = useState<
    Record<string, PackageAnalyzeCache>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const report = packageId ? (byPackage[packageId]?.report ?? null) : null;
  const analyzedAt = packageId
    ? (byPackage[packageId]?.analyzedAt ?? null)
    : null;

  useEffect(() => {
    const snap = readStore<BundleSnapshot>(storeKey(props.repoLabel));
    const next: Record<string, PackageAnalyzeCache> = {
      ...snap?.byPackage,
    };
    // Migrate legacy single-report cache.
    if (
      snap?.report &&
      snap.selectedPackageId &&
      !next[snap.selectedPackageId]
    ) {
      next[snap.selectedPackageId] = {
        report: snap.report,
        analyzedAt: snap.report.collectedAt,
      };
    }
    setByPackage(next);
    if (snap?.selectedPackageId) setPackageId(snap.selectedPackageId);
    setRestored(true);
  }, [props.repoLabel]);

  useEffect(() => {
    if (!restored) return;
    const snap: BundleSnapshot = { byPackage };
    if (packageId) snap.selectedPackageId = packageId;
    writeStore(storeKey(props.repoLabel), snap);
  }, [byPackage, packageId, restored, props.repoLabel]);

  useEffect(() => {
    let cancelled = false;
    const detect = client.detectBundleAnalyzeCapability;
    if (!detect) {
      setCapability({
        supported: false,
        preferredStrategy: "none",
        reason:
          "Bundle Analyze isn’t available in this host. Use the VS Code / Cursor extension or playground.",
        scripts: [],
        bundlers: [],
        packages: [],
      });
      return;
    }
    void detect()
      .then((cap) => {
        if (cancelled) return;
        setCapability(cap);
        setPackageId((current) => {
          if (current) return current;
          const preferred =
            cap.packages.find(
              (p) => p.bundler !== "unknown" || p.hasAnalyzeScript,
            ) ?? cap.packages[0];
          return preferred?.packageId ?? "";
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCapability({
            supported: false,
            preferredStrategy: "none",
            reason: err instanceof Error ? err.message : String(err),
            scripts: [],
            bundlers: [],
            packages: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, props.repoLabel]);

  useEffect(() => {
    let cancelled = false;
    const list = client.fetchPackages;
    if (!list) return;
    void list()
      .then((pkgs) => {
        if (cancelled) return;
        setPackages(pkgs);
        if (!packageId && pkgs.length === 1) {
          setPackageId(pkgs[0]!.id);
        }
      })
      .catch(() => {
        /* optional */
      });
    return () => {
      cancelled = true;
    };
  }, [client, packageId, props.repoLabel]);

  // Clear error when switching packages; selection resets via report effect.
  useEffect(() => {
    setError(null);
    setProgress(null);
  }, [packageId]);

  const selectedChunk: BundleChunk | null = useMemo(() => {
    if (!report || !selectedChunkId) return report?.chunks[0] ?? null;
    return report.chunks.find((c) => c.id === selectedChunkId) ?? null;
  }, [report, selectedChunkId]);

  useEffect(() => {
    if (!report?.chunks.length) {
      setSelectedChunkId(null);
      return;
    }
    if (
      !selectedChunkId ||
      !report.chunks.some((c) => c.id === selectedChunkId)
    ) {
      setSelectedChunkId(report.chunks[0]!.id);
    }
  }, [report, selectedChunkId]);

  const treemapItems = useMemo(
    () =>
      (report?.chunks ?? []).map((c) => ({
        id: c.id,
        label: fileNameOnly(c.name),
        value: c.bytes.raw,
        valueLabel: formatBytes(c.bytes.raw),
      })),
    [report],
  );

  const packageOptions = useMemo(() => {
    const fromCap = (capability?.packages ?? []).map((p) => ({
      value: p.packageId,
      label: `${p.packageName} (${p.bundler}${p.hasAnalyzeScript ? " · analyze" : ""}${byPackage[p.packageId] ? " · cached" : ""})`,
    }));
    if (fromCap.length > 0) return fromCap;
    return packages.map((p) => ({
      value: p.id,
      label: p.name ?? p.id,
    }));
  }, [capability, packages, byPackage]);

  const runAnalyze = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setProgress("Starting…");
    try {
      if (!client.runBundleAnalyze) {
        setError(
          "Bundle Analyze isn’t available in this host. Open Prism from the extension or playground.",
        );
        return;
      }
      if (capability && !capability.supported) {
        setError(
          capability.reason ??
            "No analyze script or supported Next / Vite / Webpack stack detected.",
        );
        return;
      }
      const result = await client.runBundleAnalyze({
        mode: "run",
        ...(packageId ? { packageId } : {}),
        onProgress: (event) => {
          if (event.message.trim()) setProgress(event.message.trim());
        },
      });
      if (!result) {
        setError("Analyze produced no report.");
        return;
      }
      if (result.unsupportedReason && result.overview.totalRaw === 0) {
        setError(result.unsupportedReason);
        return;
      }
      const key = packageId || result.build.packageId || "default";
      const analyzed = result.collectedAt || new Date().toISOString();
      setByPackage((prev) => ({
        ...prev,
        [key]: { report: result, analyzedAt: analyzed },
      }));
      if (!packageId) setPackageId(key);
      if (result.chunks[0]) setSelectedChunkId(result.chunks[0].id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      runAnalyze,
      get busy() {
        return busy;
      },
      get supported() {
        return capability?.supported !== false;
      },
    }),
    // runAnalyze closes over latest packageId / capability / client each render
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional latest closure
    [busy, capability, packageId, client],
  );

  const buildLabel = report?.build
    ? [
        report.build.packageName,
        report.build.bundler !== "unknown" ? report.build.bundler : null,
        report.build.mode !== "unknown" ? report.build.mode : null,
        report.build.scriptName ? `script:${report.build.scriptName}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const hasReport = Boolean(report && report.overview.totalRaw > 0);
  const analyzeDisabled = busy || capability?.supported === false;
  const analyzeTitle =
    capability?.preferredStrategy === "project-script"
      ? "Run project analyze script"
      : capability?.preferredStrategy === "prism-managed"
        ? "Run Prism-managed local analyze"
        : "Analyze unavailable";

  const packageSelect =
    packageOptions.length > 1 ? (
      <Select
        aria-label="Package for analyze"
        value={packageId || packageOptions[0]!.value}
        onChange={(v) => setPackageId(v)}
        options={packageOptions}
      />
    ) : null;

  return (
    <section className={`bw${embedded ? " bw--embedded" : ""}`}>
      {embedded ? (
        packageSelect ? (
          <div className="bw__bar bw__bar--embedded">{packageSelect}</div>
        ) : null
      ) : (
        <div className="bw__bar">
          <h2 className="bw__h">
            <Boxes size={16} aria-hidden />
            Bundle / Weight
            <InfoTip label="Bundle Weight">
              Real bundler stats from a local Analyze run (project analyze
              script when present, else Prism-managed for Next / Vite /
              Webpack). Prism never invents production sizes from the import
              graph. Each app keeps its last analyze result when you switch
              packages.
            </InfoTip>
          </h2>
          <div className="bw__actions">
            {packageSelect}
            <button
              type="button"
              className="ov-btn ov-btn--secondary"
              disabled={analyzeDisabled}
              onClick={() => void runAnalyze()}
              title={analyzeTitle}
            >
              {busy ? (
                <Loader2 size={13} className="bw-spin" aria-hidden />
              ) : (
                <Package size={13} aria-hidden />
              )}
              {busy ? "Analyzing…" : "Analyze"}
            </button>
          </div>
        </div>
      )}

      {capability && !capability.supported ? (
        <div className="dm-idle bw-idle">
          <p className="dm-note">
            {capability.reason ??
              "No frontend analyze capability detected in this workspace."}
          </p>
          <p className="dm-foot">
            Backend weight packs are out of scope for this slice — Frontend
            Bundle / Weight only.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="dm-warnbar" role="status">
          <AlertTriangle size={14} aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {busy && progress ? (
        <div className="dm-runbar">
          <span className="dm-runbar__dot" aria-hidden />
          {progress}
        </div>
      ) : hasReport && analyzedAt ? (
        <div className="dm-runbar">
          <span className="dm-runbar__dot" aria-hidden />
          Last analyzed {formatWhen(analyzedAt)} ({relativeTime(analyzedAt)})
          {buildLabel ? ` · ${buildLabel}` : ""}
          {report?.source ? ` · ${report.source}` : ""}
        </div>
      ) : null}

      {hasReport && report ? (
        <>
          <div className="bw-kpis">
            <article className="ov-stat">
              <div className="ov-stat__head">
                <span className="ov-stat__k">Total raw</span>
              </div>
              <div className="ov-stat__v">
                {formatBytes(report.overview.totalRaw)}
              </div>
            </article>
            <article className="ov-stat">
              <div className="ov-stat__head">
                <span className="ov-stat__k">Gzip</span>
              </div>
              <div className="ov-stat__v">
                {report.overview.totalGzip !== undefined
                  ? formatBytes(report.overview.totalGzip)
                  : "—"}
              </div>
            </article>
            <article className="ov-stat">
              <div className="ov-stat__head">
                <span className="ov-stat__k">Chunks</span>
              </div>
              <div className="ov-stat__v">{report.overview.chunkCount}</div>
            </article>
            <article className="ov-stat">
              <div className="ov-stat__head">
                <span className="ov-stat__k">Initial / async</span>
              </div>
              <div className="ov-stat__v ov-mono bw-kpi-stack">
                <span>{formatBytes(report.overview.initialRaw)}</span>
                <span className="bw-kpi-muted">
                  / {formatBytes(report.overview.asyncRaw)} async
                </span>
              </div>
            </article>
            <article className="ov-stat">
              <div className="ov-stat__head">
                <span className="ov-stat__k">Largest</span>
              </div>
              <div
                className="ov-stat__v ov-mono bw-kpi-stack"
                title={report.overview.largestChunkName ?? undefined}
              >
                <span>
                  {report.overview.largestChunkName
                    ? fileNameOnly(report.overview.largestChunkName)
                    : "—"}
                </span>
                <span className="bw-kpi-muted">
                  {report.overview.largestChunkRaw !== undefined
                    ? formatBytes(report.overview.largestChunkRaw)
                    : ""}
                </span>
              </div>
            </article>
          </div>

          <div className="bw-treemap-wrap">
            <div className="dm-subhead">Treemap by chunk size</div>
            <BundleTreemap
              items={treemapItems}
              totalCount={report.chunks.length}
              selectedId={selectedChunkId}
              onSelect={setSelectedChunkId}
            />
            {selectedChunk ? (
              <div className="bw-selection">
                <div className="bw-selection__name">
                  {fileNameOnly(selectedChunk.name)}
                  <span className="bw-selection__size ov-mono">
                    {formatBytes(selectedChunk.bytes.raw)}
                    {selectedChunk.bytes.gzip !== undefined
                      ? ` · gzip ${formatBytes(selectedChunk.bytes.gzip)}`
                      : ""}
                  </span>
                </div>
                <div
                  className="bw-selection__path ov-mono"
                  title={selectedChunk.name}
                >
                  {selectedChunk.name}
                </div>
              </div>
            ) : null}
          </div>

          <div className="bw-split">
            <div className="bw-chunks">
              <div className="dm-subhead">Chunks</div>
              <div className="dm-rank">
                {report.chunks.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={`dm-rank__row bw-chunk-row${
                      selectedChunkId === c.id ? " bw-chunk-row--active" : ""
                    }`}
                    onClick={() => setSelectedChunkId(c.id)}
                    title={c.name}
                  >
                    <div className="dm-rank__main">
                      <span className="dm-rank__name ov-ellipsis">
                        {fileNameOnly(c.name)}
                      </span>
                      <span
                        className="dm-rank__path ov-ellipsis"
                        title={c.name}
                      >
                        {c.name} · {c.loadType} · {c.percentOfTotal}%
                      </span>
                    </div>
                    <span className="dm-rank__val ov-mono">
                      {formatBytes(c.bytes.raw)}
                      <ChevronRight size={12} aria-hidden />
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bw-modules">
              <div className="dm-subhead">
                Top modules
                {selectedChunk ? ` · ${fileNameOnly(selectedChunk.name)}` : ""}
              </div>
              {selectedChunk && selectedChunk.modules.length > 0 ? (
                <div className="dm-rank">
                  {selectedChunk.modules.slice(0, 20).map((m) => (
                    <div
                      key={m.id}
                      className="dm-rank__row"
                      title={m.path ?? m.name}
                    >
                      <div className="dm-rank__main">
                        <span className="dm-rank__name ov-ellipsis">
                          {fileNameOnly(m.name)}
                        </span>
                        <span className="dm-rank__path">
                          {m.packageName ?? m.path ?? "app"}
                          {m.percentOfChunk !== undefined
                            ? ` · ${m.percentOfChunk}% of chunk`
                            : ""}
                        </span>
                      </div>
                      <span className="dm-rank__val ov-mono">
                        {formatBytes(m.bytes.raw)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dm-note">
                  No per-module detail in this stats file. Chunk sizes above are
                  still from the analyzer output.
                </p>
              )}

              {report.packageRollups.length > 0 ? (
                <>
                  <div className="dm-subhead">Package rollup</div>
                  <div className="dm-rank">
                    {report.packageRollups.slice(0, 12).map((p) => (
                      <div key={p.name} className="dm-rank__row">
                        <div className="dm-rank__main">
                          <span className="dm-rank__name ov-ellipsis">
                            {p.name}
                          </span>
                          <span className="dm-rank__path">
                            {p.moduleCount} modules · {p.percentOfTotal}%
                          </span>
                        </div>
                        <span className="dm-rank__val ov-mono">
                          {formatBytes(p.bytes.raw)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {report.highlights.length > 0 ? (
            <>
              <div className="dm-subhead">Highlights</div>
              <ul className="bw-highlights">
                {report.highlights.slice(0, 12).map((h) => (
                  <li
                    key={h.id}
                    className={`bw-highlight bw-highlight--${h.severity}`}
                  >
                    <strong>{h.title}</strong>
                    {h.detail ? <span>{h.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : !busy && capability?.supported !== false ? (
        <div className="dm-idle bw-idle">
          <p className="dm-note">
            {packageId
              ? "This app hasn’t been analyzed yet. Click Analyze to run a local production build and plot chunk sizes."
              : "Select an app, then click Analyze."}
          </p>
          <p className="dm-foot">
            Switching apps shows each app’s last analyze (with timestamp) when
            available — otherwise this empty state.
          </p>
        </div>
      ) : null}

      <p className="dm-foot">
        {report?.callout ??
          "Bundle Weight uses real bundler stats only — never fabricated from the dependency graph."}
      </p>
    </section>
  );
});
