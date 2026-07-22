import type {
  BlastRadiusItem,
  BlastRadiusReport,
  GraphNodeDto,
} from "@prism/shared";
import { FileExplorer } from "@prism/ui";
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  FileCode2,
  FlaskConical,
  Play,
  Search,
  ShieldAlert,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { InfoTip } from "./InfoTip.js";
import {
  fetchDependencyGraph,
  fetchImpactBundle,
  fetchSymbolHits,
  type ImpactBundle,
  type ImpactTarget,
  type SymbolSearchHit,
} from "./map-client.js";
import "./overview.css";

const GAUGE_C = 2 * Math.PI * 45;
const PAGE_SIZE = 25;

export type BlastRadiusScreenProps = {
  root: string | null;
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  /** Optional pre-selected file path (repo-relative). */
  initialFile?: string | null;
  onNavigate: (view: AppView) => void;
};

type Mode = "file" | "symbol";
type SafetyTab = "safe-delete" | "rename";
type Status = "idle" | "loading" | "ready" | "error";

function filePathFromNodeId(id: string, label: string): string {
  if (id.startsWith("file:")) return id.slice("file:".length);
  return label || id;
}

function riskBand(risk: number): {
  label: string;
  color: string;
  tone: "low" | "mid" | "high";
} {
  if (risk >= 70) {
    return { label: "High Impact Potential", color: "#F43F5E", tone: "high" };
  }
  if (risk >= 40) {
    return { label: "Moderate Impact", color: "#F59E0B", tone: "mid" };
  }
  return { label: "Low Impact", color: "#10B981", tone: "low" };
}

function riskRationale(blast: BlastRadiusReport): string {
  const direct = blast.affectedFiles.filter((f) => f.depth === 1).length;
  const tests = blast.testsLikelyAffected.length;
  const parts = [
    `${blast.affectedFiles.length} downstream file(s)`,
    `${direct} direct dependent(s)`,
    tests > 0
      ? `${tests} test(s) in radius`
      : "no tests in radius (untested +15)",
  ];
  if (blast.truncated) parts.push("truncated at depth limit");
  return parts.join(" · ");
}

function groupByDepth(
  items: readonly BlastRadiusItem[],
): Array<{ depth: number; rows: BlastRadiusItem[] }> {
  const map = new Map<number, BlastRadiusItem[]>();
  for (const item of items) {
    const list = map.get(item.depth) ?? [];
    list.push(item);
    map.set(item.depth, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([depth, rows]) => ({
      depth,
      rows: [...rows].sort((a, b) => a.path.localeCompare(b.path)),
    }));
}

export function BlastRadiusScreen(props: BlastRadiusScreenProps): ReactElement {
  const subtitle = [props.repoLabel, props.branch].filter(Boolean).join(" · ");

  const [mode, setMode] = useState<Mode>("file");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<ImpactTarget | null>(null);
  const [newName, setNewName] = useState("");
  const [safetyTab, setSafetyTab] = useState<SafetyTab>("rename");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ImpactBundle | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [fileNodes, setFileNodes] = useState<GraphNodeDto[]>([]);
  const [symbolHits, setSymbolHits] = useState<SymbolSearchHit[]>([]);

  useEffect(() => {
    if (!props.root) return;
    void fetchDependencyGraph(props.root).then((graph) => {
      if (!graph) return;
      const nodes = graph.nodes
        .filter((n) => n.kind === "file" || n.id.startsWith("file:"))
        .map((n) => {
          const path = filePathFromNodeId(
            n.id,
            typeof n.attrs?.path === "string" ? n.attrs.path : n.label,
          );
          return {
            ...n,
            kind: "file",
            label: path,
            attrs: { ...n.attrs, path },
          } satisfies GraphNodeDto;
        });
      setFileNodes(nodes);
    });
  }, [props.root]);

  useEffect(() => {
    const initial = props.initialFile?.trim();
    if (!initial) return;
    setMode("file");
    setTarget({ kind: "file", id: initial, path: initial });
    setQuery(initial);
  }, [props.initialFile]);

  useEffect(() => {
    if (mode !== "symbol") {
      setSymbolHits([]);
      return;
    }
    const q = query.trim();
    if (q.length < 1 || !props.root) {
      setSymbolHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void fetchSymbolHits(q, props.root).then(setSymbolHits);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [mode, query, props.root]);

  useEffect(() => {
    if (!target || !props.root) {
      setBundle(null);
      setStatus("idle");
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setVisibleCount(PAGE_SIZE);
    void fetchImpactBundle(
      {
        ...target,
        ...(newName.trim() ? { newName: newName.trim() } : {}),
      },
      props.root,
    ).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setBundle(null);
        setStatus("error");
        setError(res.error);
        return;
      }
      setBundle(res.value);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [target, props.root, newName]);

  const selectFilePath = (path: string) => {
    setMode("file");
    setTarget({ kind: "file", id: path, path });
    setQuery(path);
    setNewName(path.split("/").pop() ?? path);
  };

  const blast = bundle?.blast ?? null;
  const band = blast ? riskBand(blast.risk) : null;
  const directDeps = blast
    ? blast.affectedFiles.filter((f) => f.depth === 1).length
    : 0;

  const depthGroups = useMemo(() => {
    if (!blast) return [];
    return groupByDepth(blast.affectedFiles);
  }, [blast]);

  const flatAffected = useMemo(() => {
    if (!blast) return [];
    return [...blast.affectedFiles].sort(
      (a, b) => a.depth - b.depth || a.path.localeCompare(b.path),
    );
  }, [blast]);

  const visibleAffected = flatAffected.slice(0, visibleCount);
  const visibleGrouped = useMemo(
    () => groupByDepth(visibleAffected),
    [visibleAffected],
  );
  const remaining = Math.max(0, flatAffected.length - visibleCount);

  const gaugeOffset = blast
    ? GAUGE_C * (1 - Math.max(0, Math.min(100, blast.risk)) / 100)
    : GAUGE_C;

  const chipLabel =
    target === null
      ? null
      : target.kind === "file"
        ? target.id
        : `${target.id}${target.path ? ` · ${target.path}` : ""}`;

  return (
    <div className="ov">
      <AppSidebar
        variant="full"
        active="blast"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        <header className="ov-top">
          <div>
            <div className="ov-top__title">Blast Radius</div>
            <div className="ov-top__sub">{subtitle}</div>
          </div>
          <div className="ov-top__actions">
            <div className="br-search">
              <Search size={14} aria-hidden />
              <input
                className="br-search__input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  mode === "file" ? "Search files…" : "Search symbols…"
                }
                spellCheck={false}
                aria-label="Search blast targets"
              />
            </div>
          </div>
        </header>

        <div className="ov-scroll">
          <div className="br-target">
            <span className="br-target__label">Target</span>
            {target && chipLabel ? (
              <div className="br-chip">
                {target.kind === "file" ? (
                  <FileCode2 size={14} aria-hidden />
                ) : (
                  <Code2 size={14} aria-hidden />
                )}
                <span className="ov-mono ov-ellipsis" title={chipLabel}>
                  {chipLabel}
                </span>
                <button
                  type="button"
                  className="br-chip__clear"
                  aria-label="Clear target"
                  onClick={() => {
                    setTarget(null);
                    setQuery("");
                    setNewName("");
                  }}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            ) : (
              <span className="br-target__hint">
                Select a file or symbol to compute impact
              </span>
            )}
            <div className="br-mode" role="group" aria-label="Target mode">
              <button
                type="button"
                className="br-mode__btn"
                data-active={mode === "file" ? "true" : "false"}
                onClick={() => {
                  setMode("file");
                  setTarget(null);
                  setQuery("");
                }}
              >
                File
              </button>
              <button
                type="button"
                className="br-mode__btn"
                data-active={mode === "symbol" ? "true" : "false"}
                onClick={() => {
                  setMode("symbol");
                  setTarget(null);
                  setQuery("");
                }}
              >
                Symbol
              </button>
            </div>
          </div>

          {!target ? (
            <div className="br-landing">
              {mode === "file" ? (
                <>
                  <p className="br-landing__lead">
                    Browse the indexed folder tree and pick a file to compute
                    its blast radius (reverse dependents from the dependency
                    graph). Use search to filter paths.
                  </p>
                  {fileNodes.length > 0 ? (
                    <div className="br-explorer">
                      <FileExplorer
                        nodes={fileNodes}
                        selectedId={null}
                        filterQuery={query}
                        onSelectNode={(nodeId) => {
                          if (!nodeId) return;
                          const path = filePathFromNodeId(nodeId, nodeId);
                          if (path) selectFilePath(path);
                        }}
                      />
                    </div>
                  ) : (
                    <p className="ov-empty">
                      {props.root
                        ? "No files in the dependency graph yet."
                        : "Open a workspace to browse files."}
                    </p>
                  )}
                </>
              ) : symbolHits.length > 0 ? (
                <div className="br-picker">
                  <ul className="br-picker__list">
                    {symbolHits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          className="br-picker__item"
                          onClick={() => {
                            setTarget({
                              kind: "symbol",
                              id: hit.name,
                              path: hit.path,
                            });
                            setQuery(hit.name);
                            setNewName(`${hit.name}V2`);
                          }}
                        >
                          <Code2 size={14} aria-hidden />
                          <span className="br-picker__sym">
                            <span className="ov-mono">{hit.name}</span>
                            <span className="br-picker__meta ov-mono">
                              {hit.kind}
                              {hit.exported ? " · exported" : ""} · {hit.path}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="ov-empty">
                  {query.trim()
                    ? "No symbols match that name."
                    : "Type a symbol name to search the knowledge graph."}
                </p>
              )}
            </div>
          ) : null}

          {status === "loading" ? (
            <p className="ov-empty">Computing impact…</p>
          ) : null}

          {status === "error" ? (
            <p className="ov-empty br-error">
              {error ?? "Could not compute impact for this target."}
            </p>
          ) : null}

          {status === "ready" && blast && band && bundle ? (
            <div className="br-layout">
              <div className="br-col br-col--main">
                <article className="ov-card br-risk">
                  <div className="br-risk__gauge" data-tone={band.tone}>
                    <svg viewBox="0 0 100 100" aria-hidden>
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke="var(--prism-line, #2a334a)"
                        strokeWidth="8"
                      />
                      <circle
                        className="br-risk__arc"
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke={band.color}
                        strokeWidth="8"
                        strokeDasharray={GAUGE_C}
                        strokeDashoffset={gaugeOffset}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <div className="br-risk__score">
                      <span className="br-risk__num">{blast.risk}</span>
                      <span className="br-risk__lbl">Risk</span>
                    </div>
                  </div>
                  <div className="br-risk__body">
                    <div className="br-risk__head">
                      <h3 className="br-risk__title">{band.label}</h3>
                      {blast.truncated ? (
                        <span className="ov-badge">Truncated</span>
                      ) : null}
                      <InfoTip label="Blast risk">
                        Risk 0–100 = 55 × (affected ÷ analyzed−1) + min(30,
                        direct×5) + 15 when no tests sit in the radius (M-020 /
                        ADR impact).
                      </InfoTip>
                    </div>
                    <p className="br-risk__copy">{riskRationale(blast)}</p>
                    <div className="br-risk__stats">
                      <div>
                        <div className="br-risk__stat-v">
                          {blast.affectedFiles.length}
                        </div>
                        <div className="br-risk__stat-k">Affected Files</div>
                      </div>
                      <div>
                        <div className="br-risk__stat-v">{directDeps}</div>
                        <div className="br-risk__stat-k">Direct Deps</div>
                      </div>
                      <div>
                        <div className="br-risk__stat-v">
                          {blast.testsLikelyAffected.length}
                        </div>
                        <div className="br-risk__stat-k">Tests Affected</div>
                      </div>
                    </div>
                  </div>
                </article>

                <article className="ov-card br-down">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Zap size={14} className="ov-card__icon" aria-hidden />
                      Downstream Impact
                    </span>
                    <span className="ov-card__meta">
                      {blast.affectedFiles.length}
                    </span>
                  </div>
                  {depthGroups.length === 0 ? (
                    <p className="ov-empty">
                      No downstream dependents — isolated change surface.
                    </p>
                  ) : (
                    <>
                      <div className="br-down__body">
                        {visibleGrouped.map((g) => (
                          <div key={g.depth} className="br-depth">
                            <div className="br-depth__head">
                              <span className="br-depth__badge">{g.depth}</span>
                              <span className="br-depth__label">
                                Depth {g.depth}
                                {g.depth === 1
                                  ? " (Direct)"
                                  : g.depth === 2
                                    ? " (Indirect)"
                                    : ""}
                              </span>
                            </div>
                            {g.rows.map((row) => (
                              <div
                                key={`${row.path}:${row.depth}`}
                                className="br-down__row"
                              >
                                <FileCode2 size={14} aria-hidden />
                                <span
                                  className="ov-mono ov-ellipsis br-down__path"
                                  title={row.path}
                                >
                                  {row.path}
                                </span>
                                <span className="br-reason" title={row.reason}>
                                  {row.reason}
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      {remaining > 0 ? (
                        <button
                          type="button"
                          className="br-more"
                          onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                        >
                          Load {Math.min(PAGE_SIZE, remaining)} more file
                          {Math.min(PAGE_SIZE, remaining) === 1 ? "" : "s"}…
                        </button>
                      ) : null}
                    </>
                  )}
                </article>
              </div>

              <div className="br-col br-col--side">
                <article className="ov-card br-safety">
                  <div className="br-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      className="br-tabs__btn"
                      aria-selected={safetyTab === "safe-delete"}
                      data-active={
                        safetyTab === "safe-delete" ? "true" : "false"
                      }
                      onClick={() => setSafetyTab("safe-delete")}
                    >
                      Safe Delete
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className="br-tabs__btn"
                      aria-selected={safetyTab === "rename"}
                      data-active={safetyTab === "rename" ? "true" : "false"}
                      onClick={() => setSafetyTab("rename")}
                    >
                      Rename Impact
                    </button>
                  </div>

                  {safetyTab === "safe-delete" ? (
                    <div className="br-safety__body">
                      <div
                        className={`br-verdict${
                          bundle.safeDelete.safe
                            ? " br-verdict--safe"
                            : " br-verdict--warn"
                        }`}
                      >
                        {bundle.safeDelete.safe ? (
                          <CheckCircle2 size={16} aria-hidden />
                        ) : (
                          <AlertTriangle size={16} aria-hidden />
                        )}
                        <span>
                          {bundle.safeDelete.safe
                            ? "Safe to delete — no dependents"
                            : "Not safe — dependents block deletion"}
                        </span>
                      </div>

                      <h4 className="br-section-h">
                        Blockers ({bundle.safeDelete.blockers.length})
                      </h4>
                      {bundle.safeDelete.blockers.length > 0 ? (
                        <div className="dm-rank">
                          {bundle.safeDelete.blockers.map((b) => (
                            <div
                              key={`${b.path}:${b.depth}`}
                              className="dm-rank__row"
                            >
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-mono ov-ellipsis">
                                  {b.path}
                                </span>
                                <span className="dm-rank__path ov-ellipsis">
                                  {b.reason}
                                </span>
                              </div>
                              <span className="dm-rank__val ov-mono">
                                d{b.depth}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">No blockers.</p>
                      )}

                      <h4 className="br-section-h">
                        Orphans ({bundle.safeDelete.orphans.length})
                      </h4>
                      {bundle.safeDelete.orphans.length > 0 ? (
                        <div className="dm-rank">
                          {bundle.safeDelete.orphans.map((p) => (
                            <div key={p} className="dm-rank__row">
                              <span className="dm-rank__name ov-mono ov-ellipsis">
                                {p}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">No orphaned files.</p>
                      )}
                    </div>
                  ) : (
                    <div className="br-safety__body">
                      {bundle.rename.breakingChanges.length > 0 ? (
                        <div className="br-hints">
                          {bundle.rename.breakingChanges.map((h, i) => (
                            <div
                              key={`${h.kind}:${i}`}
                              className="br-hint"
                              data-sev={h.severity}
                            >
                              <ShieldAlert size={14} aria-hidden />
                              <div>
                                <div className="br-hint__k">{h.kind}</div>
                                <div className="br-hint__m">{h.message}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">No breaking-change hints.</p>
                      )}

                      <label className="br-section-h" htmlFor="br-rename">
                        Simulate rename
                      </label>
                      <input
                        id="br-rename"
                        className="br-input"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        spellCheck={false}
                      />

                      <h4 className="br-section-h">
                        Edit sites (
                        {bundle.rename.editSites.reduce(
                          (acc, s) => acc + s.count,
                          0,
                        )}{" "}
                        in {bundle.rename.editSites.length} file
                        {bundle.rename.editSites.length === 1 ? "" : "s"})
                      </h4>
                      {bundle.rename.editSites.length > 0 ? (
                        <div className="dm-rank">
                          {bundle.rename.editSites.map((s) => (
                            <div key={s.path} className="dm-rank__row">
                              <span className="dm-rank__name ov-mono ov-ellipsis">
                                {s.path}
                              </span>
                              <span className="dm-rank__val ov-mono">
                                {s.count} ref{s.count === 1 ? "" : "s"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">No edit sites reported.</p>
                      )}

                      {bundle.rename.affectedFiles.length > 0 ? (
                        <p className="dm-note">
                          Affected files: {bundle.rename.affectedFiles.length} (
                          {bundle.rename.affectedFiles.slice(0, 3).join(", ")}
                          {bundle.rename.affectedFiles.length > 3 ? "…" : ""})
                        </p>
                      ) : null}
                    </div>
                  )}
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <FlaskConical
                        size={14}
                        className="ov-card__icon"
                        aria-hidden
                      />
                      Tests Affected
                    </span>
                    <span className="ov-card__meta">
                      {bundle.testImpact.tests.length}
                    </span>
                  </div>
                  {bundle.testImpact.tests.length > 0 ? (
                    <div className="dm-rank">
                      {bundle.testImpact.tests.map((t) => (
                        <div
                          key={`${t.path}:${t.depth}`}
                          className="dm-rank__row"
                        >
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-mono ov-ellipsis">
                              {t.path}
                            </span>
                            <span className="dm-rank__path ov-ellipsis">
                              {t.reason}
                            </span>
                          </div>
                          <span className="dm-rank__val ov-mono">
                            d{t.depth}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="ov-empty">No tests in the impact radius.</p>
                  )}
                  <button
                    type="button"
                    className="ov-btn ov-btn--ghost br-run"
                    disabled
                    title="Test runner wiring comes later"
                  >
                    <Play size={13} aria-hidden />
                    Run these tests
                  </button>
                  <p className="dm-note">
                    From Core <span className="ov-mono">testImpact</span>{" "}
                    (M-021) — paths + reason + depth. Run action deferred.
                  </p>
                </article>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
