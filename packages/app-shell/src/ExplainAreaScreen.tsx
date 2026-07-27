import type { ExplainAreaSummary } from "@prism/shared";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Layers,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { useAppShellClient } from "./client-context.js";
import { recordAudit } from "./audit-log.js";

export type ExplainAreaScreenProps = {
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  /** Pre-selected path (editor / explorer command deep link). */
  initialPath?: string | null;
  onNavigate: (view: AppView) => void;
};

type Status = "idle" | "loading" | "ready" | "error" | "empty";

export function ExplainAreaScreen(props: ExplainAreaScreenProps): ReactElement {
  const client = useAppShellClient();
  const [pathInput, setPathInput] = useState(props.initialPath ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ExplainAreaSummary | null>(null);

  const runExplain = useCallback(
    async (path: string) => {
      const trimmed = path.trim();
      if (!trimmed) {
        setStatus("idle");
        setSummary(null);
        return;
      }
      if (!client.fetchExplainArea) {
        setStatus("error");
        setError("Explain area is not supported on this surface.");
        return;
      }
      setStatus("loading");
      setError(null);
      const started = Date.now();
      try {
        const data = await client.fetchExplainArea(trimmed);
        setSummary(data);
        setStatus(data ? "ready" : "empty");
        recordAudit({
          category: "analysis",
          operation: "Explained area",
          target: trimmed,
          durationMs: Date.now() - started,
          status: "success",
          command: "explainArea",
          output: data
            ? `domains=${data.domains.length} owners=${data.owners.length}`
            : "No summary available for this path.",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus("error");
        setError(msg);
      }
    },
    [client],
  );

  useEffect(() => {
    if (props.initialPath) {
      setPathInput(props.initialPath);
      void runExplain(props.initialPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialPath]);

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
        active="explain"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        {/* Tour spotlight: header + primary form — always mounted (even idle). */}
        <div className="cr-tour-spotlight" data-prism-tour="explain">
          <header className="ov-top">
            <div>
              <div className="ov-top__title">Explain This Area</div>
              <div className="ov-top__sub">
                {[props.repoLabel, props.branch].filter(Boolean).join(" · ") ||
                  "Domain overlap, dependency degree, and local ownership"}
              </div>
            </div>
          </header>

          <div className="cr-tour-spotlight__body">
            <div className="ov-card cr-input-card">
              <p className="cr-tour-lead">
                A quick brief on a file or folder — domains, dependencies, and
                local ownership. Also available from the editor context menu.
              </p>
              <label className="cr-input-label" htmlFor="ea-path">
                File or folder path
              </label>
              <div className="cr-input-row">
                <input
                  id="ea-path"
                  className="ov-mono set-input"
                  style={{ flex: 1, minWidth: 220 }}
                  value={pathInput}
                  placeholder="packages/core/src/workspace.ts"
                  onChange={(e) => setPathInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runExplain(pathInput);
                  }}
                />
                <button
                  type="button"
                  className="ov-btn ov-btn--primary"
                  disabled={status === "loading" || !pathInput.trim()}
                  onClick={() => void runExplain(pathInput)}
                >
                  {status === "loading" ? (
                    <>
                      <RefreshCw size={14} className="cr-spin" aria-hidden />
                      Explaining…
                    </>
                  ) : (
                    <>
                      <Search size={14} aria-hidden />
                      Explain
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="ov-scroll ea-scroll">
          {status === "error" && error ? (
            <div className="ov-card cr-error" role="alert">
              {error}
            </div>
          ) : null}

          {status === "empty" ? (
            <div className="ov-empty">
              No summary available — the path may not be indexed yet.
            </div>
          ) : null}

          {summary ? (
            <div className="ov-card ea-card">
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
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
