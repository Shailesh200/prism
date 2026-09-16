import type { GuardCheckKind, GuardSession } from "@repo-prism/shared";
import { RISK_BANDS } from "@repo-prism/shared";
import { Copy, RefreshCw, ShieldAlert, ShieldOff, Split } from "lucide-react";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { useAppShellClient } from "./client-context.js";
import { recordAudit } from "./audit-log.js";

export type GuardScreenProps = {
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  onNavigate: (view: AppView) => void;
  onOpenPath?: (path: string) => void;
};

type Status = "loading" | "ready" | "error";

const RISK_BAND_COLOR: Record<string, string> = {
  high: "#F43F5E",
  mid: "#F59E0B",
  low: "#10B981",
};

const FLAG_ICON: Record<GuardCheckKind, ReactElement> = {
  duplicate: <Copy size={12} aria-hidden />,
  orphan: <ShieldOff size={12} aria-hidden />,
  boundary: <Split size={12} aria-hidden />,
};

const FLAG_LABEL: Record<GuardCheckKind, string> = {
  duplicate: "Duplicate",
  orphan: "Orphan",
  boundary: "Boundary",
};

export function GuardScreen(props: GuardScreenProps): ReactElement {
  const client = useAppShellClient();
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<GuardSession | null>(null);

  const load = useCallback(async () => {
    if (!client.fetchGuardSession) {
      setStatus("error");
      setError("Guard is not supported on this surface.");
      return;
    }
    setStatus("loading");
    setError(null);
    const started = Date.now();
    try {
      const data = await client.fetchGuardSession();
      setSession(data);
      setStatus("ready");
      recordAudit({
        category: "analysis",
        operation: "Guarded session",
        target: `files=${data?.files.length ?? 0}`,
        durationMs: Date.now() - started,
        status: "success",
        command: "guardSession",
        output: data
          ? `files=${data.files.length} truncated=${data.truncated}`
          : "No session data available.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setError(msg);
    }
  }, [client]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
        active="guard"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        <header className="ov-top">
          <div>
            <div className="ov-top__title">Prism Guard</div>
            <div className="ov-top__sub">
              {[props.repoLabel, props.branch].filter(Boolean).join(" · ") ||
                "The current session, ranked by blast risk"}
            </div>
          </div>
          <button
            type="button"
            className="ov-btn ov-btn--primary"
            disabled={status === "loading"}
            onClick={() => void load()}
          >
            <RefreshCw
              size={14}
              aria-hidden
              className={status === "loading" ? "cr-spin" : undefined}
            />
            {status === "loading" ? "Ranking…" : "Refresh"}
          </button>
        </header>

        <div className="ov-scroll ea-scroll">
          {status === "error" && error ? (
            <div className="ov-card cr-error" role="alert">
              {error}
            </div>
          ) : null}

          {status === "ready" && session && session.files.length === 0 ? (
            <div className="ov-empty">
              Nothing dirty right now — Guard ranks uncommitted changes.
            </div>
          ) : null}

          {session && session.files.length > 0 ? (
            <div className="ov-card ea-card">
              {session.excludedPreExisting.length > 0 ? (
                <p className="ea-summary">
                  Excluded {session.excludedPreExisting.length} file(s) already
                  dirty before this session started.
                </p>
              ) : null}
              <ul className="guard-list">
                {session.files.map((file) => {
                  const band = RISK_BANDS[file.band ?? "low"];
                  return (
                    <li key={file.path} className="guard-list__row">
                      <span
                        className="guard-list__band"
                        style={{
                          backgroundColor: RISK_BAND_COLOR[band.id],
                        }}
                        title={band.label}
                      >
                        {file.risk}
                      </span>
                      <button
                        type="button"
                        className="guard-list__path"
                        onClick={() => props.onOpenPath?.(file.path)}
                      >
                        {file.path}
                      </button>
                      <span className="ea-chips">
                        {file.flags.map((flag, index) => (
                          <span
                            key={`${flag.kind}-${index}`}
                            className="ea-chip"
                            title={flag.detail}
                          >
                            {FLAG_ICON[flag.kind]}
                            {FLAG_LABEL[flag.kind]}
                          </span>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {session.truncated ? (
                <p className="ea-summary">
                  <ShieldAlert
                    size={12}
                    aria-hidden
                    style={{ verticalAlign: -2, marginRight: 4 }}
                  />
                  Showing the highest-risk files — the session is larger than
                  this list.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
