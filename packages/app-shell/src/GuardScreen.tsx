import type {
  GuardCheckKind,
  GuardFlag,
  GuardSession,
} from "@repo-prism/shared";
import { RISK_BANDS } from "@repo-prism/shared";
import {
  ChevronRight,
  Copy,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  ShieldOff,
  Split,
} from "lucide-react";
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

const FLAG_EXPLAINER: Record<GuardCheckKind, string> = {
  duplicate: "an exported symbol here looks like one that already exists",
  orphan: "a new file nothing in the index imports yet",
  boundary: "crosses into a package this session otherwise doesn't touch",
};

/** One badge per flag kind present, with a count — not one chip per flag. */
function groupFlags(
  flags: readonly GuardFlag[],
): { kind: GuardCheckKind; count: number; items: GuardFlag[] }[] {
  const byKind = new Map<GuardCheckKind, GuardFlag[]>();
  for (const flag of flags) {
    byKind.set(flag.kind, [...(byKind.get(flag.kind) ?? []), flag]);
  }
  return [...byKind.entries()].map(([kind, items]) => ({
    kind,
    count: items.length,
    items,
  }));
}

/**
 * Guard costs a real analysis pass (session diff + blast rank + duplicate
 * scan). Switching tabs away and back must not re-run it — only the
 * Refresh button should. A module-level cache survives the screen's own
 * unmount/remount; it's cleared whenever the workspace label changes so a
 * stale session from a different repo never shows.
 */
let cachedSession: { repoLabel: string; session: GuardSession } | null = null;

/** Test-only: the cache is module-level and outlives any one render. */
export function __resetGuardSessionCacheForTests(): void {
  cachedSession = null;
}

export function GuardScreen(props: GuardScreenProps): ReactElement {
  const client = useAppShellClient();
  const cacheHit =
    cachedSession && cachedSession.repoLabel === props.repoLabel
      ? cachedSession.session
      : null;
  const [status, setStatus] = useState<Status>(cacheHit ? "ready" : "loading");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<GuardSession | null>(cacheHit);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpanded = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!client.fetchGuardSession) {
      setStatus("error");
      setError(
        "Guard is only available in the Prism VS Code / Cursor extension for now.",
      );
      return;
    }
    setStatus("loading");
    setError(null);
    const started = Date.now();
    try {
      const data = await client.fetchGuardSession();
      cachedSession = data
        ? { repoLabel: props.repoLabel, session: data }
        : null;
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
  }, [client, props.repoLabel]);

  useEffect(() => {
    if (cacheHit) return;
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
              {[props.repoLabel, props.branch].filter(Boolean).join(" · ")}
              {props.repoLabel || props.branch ? " · " : ""}
              Your uncommitted files, ranked by how much would break if you
              changed them — highest risk first. Click a file to see why it's
              flagged.
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
              <div className="guard-table">
                <div className="guard-table__head" aria-hidden>
                  <span />
                  <span>Risk</span>
                  <span>File</span>
                  <span>Flags</span>
                </div>
                <ul className="guard-rows">
                  {session.files.map((file) => {
                    const band = RISK_BANDS[file.band ?? "low"];
                    const groups = groupFlags(file.flags);
                    const isExpanded = expanded.has(file.path);
                    return (
                      <li
                        key={file.path}
                        className="guard-row"
                        data-open={isExpanded ? "true" : "false"}
                      >
                        <div
                          className="guard-row__main"
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          data-testid={`guard-row-${file.path}`}
                          onClick={() => toggleExpanded(file.path)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleExpanded(file.path);
                            }
                          }}
                        >
                          {groups.length > 0 ? (
                            <ChevronRight
                              size={14}
                              aria-hidden
                              className="guard-row__chev"
                              data-open={isExpanded ? "true" : "false"}
                            />
                          ) : (
                            <span className="guard-row__chev-spacer" />
                          )}
                          <span
                            className="guard-row__band"
                            style={{
                              backgroundColor: RISK_BAND_COLOR[band.id],
                            }}
                            title={`${band.label} blast risk`}
                          >
                            {file.risk}
                          </span>
                          <span className="guard-row__file">
                            <span className="guard-row__path ov-mono">
                              {file.path}
                            </span>
                            {props.onOpenPath ? (
                              <button
                                type="button"
                                className="guard-row__open"
                                title="Open file"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  props.onOpenPath?.(file.path);
                                }}
                              >
                                <ExternalLink size={12} aria-hidden />
                              </button>
                            ) : null}
                          </span>
                          <span className="guard-row__flags">
                            {groups.map((group) => (
                              <span
                                key={group.kind}
                                className="guard-flag"
                                data-kind={group.kind}
                                title={FLAG_EXPLAINER[group.kind]}
                              >
                                {FLAG_ICON[group.kind]}
                                {group.count > 1
                                  ? `${group.count} ${FLAG_LABEL[group.kind]}`
                                  : FLAG_LABEL[group.kind]}
                              </span>
                            ))}
                          </span>
                        </div>
                        {isExpanded && groups.length > 0 ? (
                          <div className="guard-detail">
                            {groups.flatMap((group) =>
                              group.items.map((flag, index) => (
                                <div
                                  key={`${group.kind}-${index}`}
                                  className="guard-detail__row"
                                >
                                  <span
                                    className="guard-detail__icon"
                                    data-kind={flag.kind}
                                  >
                                    {FLAG_ICON[flag.kind]}
                                  </span>
                                  <span className="guard-detail__text">
                                    <strong>{FLAG_LABEL[flag.kind]}</strong>
                                    {" — "}
                                    {flag.detail}
                                  </span>
                                </div>
                              )),
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
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
