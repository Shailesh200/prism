import type {
  ChangeReviewItem,
  ChangeReviewReport,
  RiskBand,
} from "@prism/shared";
import { riskBandDescriptor, riskToBand } from "@prism/shared";
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  FlaskConical,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { useAppShellClient } from "./client-context.js";
import { recordAudit } from "./audit-log.js";

export type ChangeReviewScreenProps = {
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  /** Pre-selected paths (SCM selection / editor command deep link). */
  initialPaths?: readonly string[] | null;
  onNavigate: (view: AppView) => void;
  /** Open a reviewed file in the editor (extension host only). */
  onOpenFile?: (path: string) => void;
};

type Status = "idle" | "loading" | "ready" | "error";

/**
 * This screen's CSS predates the shared vocabulary and uses "medium" where the
 * shared band is "mid". Mapping here keeps one definition of the thresholds
 * without a stylesheet rename (Q-023).
 */
const TIER_BY_BAND: Record<RiskBand, "low" | "medium" | "high"> = {
  low: "low",
  mid: "medium",
  high: "high",
};

function riskTier(risk: number): "low" | "medium" | "high" {
  return TIER_BY_BAND[riskToBand(risk)];
}

function riskLabel(risk: number): string {
  return riskBandDescriptor(risk).short;
}

function pathsKey(paths: readonly string[] | null | undefined): string {
  return (paths ?? []).join("\n");
}

export function ChangeReviewScreen(
  props: ChangeReviewScreenProps,
): ReactElement {
  const client = useAppShellClient();
  const [pathsInput, setPathsInput] = useState(() =>
    (props.initialPaths ?? []).join("\n"),
  );
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ChangeReviewReport | null>(null);

  const runReview = useCallback(
    async (paths: readonly string[]) => {
      const trimmed = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
      if (trimmed.length === 0) {
        setStatus("idle");
        setReport(null);
        setError(null);
        return;
      }
      if (!client.fetchChangeReview) {
        setStatus("error");
        setError("Change review is not supported on this surface.");
        return;
      }
      setStatus("loading");
      setError(null);
      const started = Date.now();
      try {
        const data = await client.fetchChangeReview(trimmed);
        setReport(data);
        setStatus("ready");
        recordAudit({
          category: "impact",
          operation: "Reviewed changes",
          target: `${trimmed.length} path${trimmed.length === 1 ? "" : "s"}`,
          durationMs: Date.now() - started,
          status: "success",
          command: "reviewChanges",
          output: `overallRisk=${Math.round(data.overallRisk)} affectedFiles=${data.totalAffectedFiles} testsAffected=${data.totalTestsAffected}`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus("error");
        setError(msg);
        recordAudit({
          category: "impact",
          operation: "Reviewed changes",
          target: `${trimmed.length} path${trimmed.length === 1 ? "" : "s"}`,
          durationMs: Date.now() - started,
          status: "error",
          command: "reviewChanges",
          output: msg,
        });
      }
    },
    [client],
  );

  useEffect(() => {
    if (props.initialPaths && props.initialPaths.length > 0) {
      setPathsInput(props.initialPaths.join("\n"));
      void runReview(props.initialPaths);
    }
    // Re-run only when the deep-linked path set itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey(props.initialPaths)]);

  const onRun = (): void => {
    void runReview(pathsInput.split(/\r?\n|,/));
  };

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
        active="review"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        {/* Tour spotlight: header + primary form — always mounted (even idle). */}
        <div className="cr-tour-spotlight" data-prism-tour="review">
          <header className="ov-top">
            <div>
              <div className="ov-top__title">Review Changes</div>
              <div className="ov-top__sub">
                {[props.repoLabel, props.branch].filter(Boolean).join(" · ") ||
                  "Multi-path blast radius + test impact + breaking changes"}
              </div>
            </div>
          </header>

          <div className="cr-tour-spotlight__body">
            <div className="ov-card cr-input-card">
              <p className="cr-tour-lead">
                Aggregate blast radius across dirty files. Paste paths below, or
                use <strong>Review Changes</strong> from Source Control.
              </p>
              <label className="cr-input-label" htmlFor="cr-paths">
                Paths to review (one per line, or comma-separated)
              </label>
              <textarea
                id="cr-paths"
                className="cr-textarea ov-mono"
                rows={4}
                value={pathsInput}
                placeholder="packages/core/src/workspace.ts"
                onChange={(e) => setPathsInput(e.target.value)}
              />
              <div className="cr-input-row">
                <button
                  type="button"
                  className="ov-btn ov-btn--primary"
                  disabled={status === "loading" || !pathsInput.trim()}
                  onClick={onRun}
                >
                  {status === "loading" ? (
                    <>
                      <RefreshCw size={14} className="cr-spin" aria-hidden />
                      Reviewing…
                    </>
                  ) : (
                    "Review changes"
                  )}
                </button>
                {report ? (
                  <span className="cr-generated">
                    Generated{" "}
                    {new Date(report.generatedAt).toLocaleTimeString()}
                    {report.base ? ` vs ${report.base}` : ""}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="ov-scroll cr-scroll">
          {status === "error" && error ? (
            <div className="ov-card cr-error" role="alert">
              <AlertTriangle size={16} aria-hidden />
              <span>{error}</span>
            </div>
          ) : null}

          {report ? (
            <>
              <div className="cr-summary-grid">
                <SummaryStat
                  label="Overall risk"
                  value={riskLabel(report.overallRisk)}
                  tier={riskTier(report.overallRisk)}
                  icon={ShieldAlert}
                />
                <SummaryStat
                  label="Affected files"
                  value={String(report.totalAffectedFiles)}
                  icon={FileWarning}
                />
                <SummaryStat
                  label="Tests affected"
                  value={String(report.totalTestsAffected)}
                  icon={FlaskConical}
                />
                <SummaryStat
                  label="Breaking changes"
                  value={String(report.totalBreakingChanges)}
                  tier={report.totalBreakingChanges > 0 ? "high" : "low"}
                  icon={AlertTriangle}
                />
              </div>

              <div className="ov-card cr-table-card">
                <table className="cr-table">
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th>Risk</th>
                      <th>Affected files</th>
                      <th>Tests</th>
                      <th>Breaking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items
                      .slice()
                      .sort((a, b) => b.risk - a.risk)
                      .map((item: ChangeReviewItem) => (
                        <tr key={item.path}>
                          <td>
                            {props.onOpenFile ? (
                              <button
                                type="button"
                                className="set-link cr-path-btn ov-mono"
                                onClick={() => props.onOpenFile?.(item.path)}
                              >
                                {item.path}
                              </button>
                            ) : (
                              <span className="ov-mono">{item.path}</span>
                            )}
                          </td>
                          <td>
                            <span
                              className="cr-risk-pill"
                              data-tier={riskTier(item.risk)}
                            >
                              {riskLabel(item.risk)}
                            </span>
                          </td>
                          <td>
                            {item.hardAffectedCount !== undefined ||
                            item.softAffectedCount !== undefined
                              ? `${item.hardAffectedCount ?? 0} hard · ${item.softAffectedCount ?? 0} soft`
                              : item.affectedFilesCount}
                          </td>
                          <td>{item.testsLikelyAffected.length}</td>
                          <td>{item.breakingChanges.length}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : status === "idle" ? (
            <div className="ov-empty cr-empty">
              <CheckCircle2 size={20} aria-hidden />
              Add one or more paths above, or invoke Review Changes from the
              Source Control panel.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryStat(props: {
  label: string;
  value: string;
  tier?: "low" | "medium" | "high";
  icon: typeof ShieldAlert;
}): ReactElement {
  const Icon = props.icon;
  return (
    <div className="ov-card cr-stat" data-tier={props.tier ?? "low"}>
      <Icon size={16} aria-hidden className="cr-stat__icon" />
      <div className="cr-stat__value">{props.value}</div>
      <div className="cr-stat__label">{props.label}</div>
    </div>
  );
}
