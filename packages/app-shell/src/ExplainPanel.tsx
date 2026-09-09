import type { ExplainAreaSummary } from "@repo-prism/shared";
import { ArrowDownToLine, ArrowUpFromLine, Layers, Users } from "lucide-react";
import type { ReactElement } from "react";

export type ExplainPanelProps = {
  readonly status: "idle" | "loading" | "ready" | "error" | "empty";
  readonly error: string | null;
  readonly summary: ExplainAreaSummary | null;
};

export function ExplainPanel(props: ExplainPanelProps): ReactElement | null {
  if (props.status === "loading") {
    return <p className="ov-empty">Explaining this area…</p>;
  }
  if (props.status === "error" && props.error) {
    return (
      <div className="ov-card cr-error" role="alert">
        {props.error}
      </div>
    );
  }
  if (props.status === "empty") {
    return (
      <div className="ov-empty">
        No summary available — the path may not be indexed yet.
      </div>
    );
  }
  const summary = props.summary;
  if (!summary) return null;

  return (
    <div className="ov-card ea-card imp-explain">
      <p className="ea-summary">{summary.summary}</p>
      {summary.domains.length > 0 ? (
        <div className="ea-chips">
          {summary.domains.map((domain) => (
            <span key={domain} className="ea-chip">
              <Layers size={12} aria-hidden />
              {domain}
            </span>
          ))}
        </div>
      ) : null}
      <div className="ea-grid">
        <div>
          <h3 className="ea-section-h">Dependency degree</h3>
          <div className="ea-degree">
            <div className="ea-degree__stat">
              <span className="ea-degree__value">
                <ArrowDownToLine
                  size={14}
                  aria-hidden
                  style={{ verticalAlign: -2, marginRight: 4 }}
                />
                {summary.dependencyDegree.in}
              </span>
              <span className="ea-degree__label">Depended on by</span>
            </div>
            <div className="ea-degree__stat">
              <span className="ea-degree__value">
                <ArrowUpFromLine
                  size={14}
                  aria-hidden
                  style={{ verticalAlign: -2, marginRight: 4 }}
                />
                {summary.dependencyDegree.out}
              </span>
              <span className="ea-degree__label">Depends on</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="ea-section-h">
            <Users
              size={12}
              aria-hidden
              style={{ verticalAlign: -2, marginRight: 4 }}
            />
            Local ownership
          </h3>
          {summary.owners.length > 0 ? (
            <div className="ea-owners">
              {summary.owners.map((owner) => (
                <span key={owner}>{owner}</span>
              ))}
            </div>
          ) : (
            <div className="ea-owners">
              No git ownership signal for this path.
            </div>
          )}
        </div>
      </div>
      <p className="imp-explain__foot">
        Derived from the index and local git — never generated prose.
      </p>
    </div>
  );
}
