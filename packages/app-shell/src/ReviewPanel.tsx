import type {
  ChangeReviewItem,
  ChangeReviewReport,
  RiskBand,
} from "@repo-prism/shared";
import { riskBandDescriptor, riskToBand } from "@repo-prism/shared";
import {
  AlertTriangle,
  FileWarning,
  FlaskConical,
  ShieldAlert,
} from "lucide-react";
import type { ReactElement } from "react";

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

export type ReviewPanelProps = {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly error: string | null;
  readonly report: ChangeReviewReport | null;
  readonly onOpenFile?: (path: string) => void;
};

export function ReviewPanel(props: ReviewPanelProps): ReactElement | null {
  if (props.status === "loading") {
    return <p className="ov-empty">Reviewing selected paths…</p>;
  }
  if (props.status === "error" && props.error) {
    return (
      <div className="ov-card cr-error" role="alert">
        <AlertTriangle size={16} aria-hidden />
        <span>{props.error}</span>
      </div>
    );
  }
  const report = props.report;
  if (!report) return null;

  return (
    <div className="imp-review">
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
        <div className="imp-review__meta">
          Generated {new Date(report.generatedAt).toLocaleTimeString()}
          {report.base ? ` vs ${report.base}` : " vs working tree"}
          {report.items.length > 0
            ? ` · ${report.items.length} path${report.items.length === 1 ? "" : "s"}`
            : ""}
        </div>
        <div className="cr-table-scroll">
          <table className="cr-table">
            <thead>
              <tr>
                <th className="cr-table__path">Path</th>
                <th className="cr-table__risk">Risk</th>
                <th className="cr-table__affected">Affected files</th>
                <th className="cr-table__num">Tests</th>
                <th className="cr-table__num">Breaking</th>
              </tr>
            </thead>
            <tbody>
              {report.items
                .slice()
                .sort((a, b) => b.risk - a.risk)
                .map((item: ChangeReviewItem) => (
                  <tr key={item.path}>
                    <td className="cr-table__path">
                      {props.onOpenFile ? (
                        <button
                          type="button"
                          className="set-link cr-path-btn ov-mono"
                          title={item.path}
                          onClick={() => props.onOpenFile?.(item.path)}
                        >
                          {item.path}
                        </button>
                      ) : (
                        <span className="ov-mono" title={item.path}>
                          {item.path}
                        </span>
                      )}
                    </td>
                    <td className="cr-table__risk">
                      <span
                        className="cr-risk-pill"
                        data-tier={riskTier(item.risk)}
                      >
                        {riskLabel(item.risk)}
                      </span>
                    </td>
                    <td className="cr-table__affected">
                      {item.hardAffectedCount !== undefined ||
                      item.softAffectedCount !== undefined
                        ? `${item.hardAffectedCount ?? 0} hard · ${item.softAffectedCount ?? 0} soft`
                        : item.affectedFilesCount}
                    </td>
                    <td className="cr-table__num">
                      {item.testsLikelyAffected.length}
                    </td>
                    <td className="cr-table__num">
                      {item.breakingChanges.length}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
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
