import type {
  BlastRadiusItem,
  BlastRadiusReport,
  GraphNodeDto,
} from "@prism/shared";
import {
  CardIcon,
  FileExplorer,
  InfoTip,
  Input,
  SearchableInput,
  Select,
  ToggleGroup,
} from "@prism/ui";
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  FileCode2,
  FileWarning,
  FlaskConical,
  Pencil,
  Play,
  ShieldAlert,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { useAppShellClient } from "./client-context.js";
import { recordAudit } from "./audit-log.js";
import { resolveRenameToPath } from "./apply-rename.js";
import type { ImpactBundle, ImpactTarget, SymbolSearchHit } from "./types.js";

const GAUGE_C = 2 * Math.PI * 45;
const PAGE_SIZE = 25;
const RENAME_DEBOUNCE_MS = 300;

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
type Status = "idle" | "loading" | "ready" | "error";

/** Non-optional form of the shared affected-file category union (M-046). */
type Category = NonNullable<BlastRadiusItem["category"]>;

const CATEGORY_ORDER: readonly Category[] = [
  "import",
  "reexport",
  "test",
  "config",
  "runtime",
  "type",
];

const CATEGORY_LABEL: Record<Category, string> = {
  import: "Imports",
  reexport: "Re-exports",
  test: "Tests",
  config: "Config",
  runtime: "Runtime",
  type: "Type",
};

function filePathFromNodeId(id: string, label: string): string {
  if (id.startsWith("file:")) return id.slice("file:".length);
  return label || id;
}

/** Mirrors `@prism/impact` `isRepoCriticalPath` for UI metrics (no package dep). */
function isRepoCriticalPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? normalized;
  if (base === "package.json") return true;
  if (base === "Cargo.toml" || base === "go.mod" || base === "pyproject.toml") {
    return true;
  }
  if (base === "Dockerfile" || /^Dockerfile\./i.test(base)) return true;
  if (/^vite\.config\./i.test(base)) return true;
  if (/^webpack\.config\./i.test(base)) return true;
  if (/^next\.config\./i.test(base)) return true;
  if (/^tsconfig.*\.json$/i.test(base)) return true;
  if (
    normalized === ".github/workflows" ||
    normalized.startsWith(".github/workflows/") ||
    normalized.includes("/.github/workflows/")
  ) {
    return true;
  }
  return false;
}

function riskBand(risk: number): {
  label: string;
  short: string;
  color: string;
  tone: "low" | "mid" | "high";
} {
  if (risk >= 60) {
    return {
      label: "High Impact Potential",
      short: "High",
      color: "#F43F5E",
      tone: "high",
    };
  }
  if (risk >= 20) {
    return {
      label: "Moderate Impact",
      short: "Moderate",
      color: "#F59E0B",
      tone: "mid",
    };
  }
  return { label: "Low Impact", short: "Low", color: "#10B981", tone: "low" };
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
  const originPath = blast.origin.path ?? blast.origin.id;
  if (isRepoCriticalPath(originPath)) {
    parts.push("foundational config file");
  }
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

/** Tallies affected files per category, keeping only present buckets. */
function categoryCounts(items: readonly BlastRadiusItem[]): {
  ordered: Array<{ key: Category; label: string; count: number }>;
  uncategorized: number;
} {
  const counts = new Map<Category, number>();
  let uncategorized = 0;
  for (const item of items) {
    if (item.category) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    } else {
      uncategorized += 1;
    }
  }
  const ordered = CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0).map(
    (c) => ({ key: c, label: CATEGORY_LABEL[c], count: counts.get(c) ?? 0 }),
  );
  return { ordered, uncategorized };
}

export function BlastRadiusScreen(props: BlastRadiusScreenProps): ReactElement {
  const client = useAppShellClient();
  const subtitle = [props.repoLabel, props.branch].filter(Boolean).join(" · ");

  const [mode, setMode] = useState<Mode>("file");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<ImpactTarget | null>(null);
  const [symbolLabel, setSymbolLabel] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ImpactBundle | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [catFilter, setCatFilter] = useState<Category | "all">("all");
  const [renameRefreshing, setRenameRefreshing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewToPath, setPreviewToPath] = useState<string | null>(null);

  const [fileNodes, setFileNodes] = useState<GraphNodeDto[]>([]);
  const [symbolHits, setSymbolHits] = useState<SymbolSearchHit[]>([]);
  const newNameRef = useRef(newName);
  newNameRef.current = newName;
  const lastRenameFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!props.root) return;
    void client.fetchDependencyGraph().then((graph) => {
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
  }, [props.root, client]);

  useEffect(() => {
    const initial = props.initialFile?.trim();
    if (!initial) return;
    setMode("file");
    setTarget({ kind: "file", id: initial, path: initial });
    setSymbolLabel(null);
    setQuery(initial);
  }, [props.initialFile]);

  // Cross-screen focus: the Domain screen's "blast radius" row action stashes a
  // target under localStorage (onNavigate can't carry a payload) then routes here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let pending: string | null = null;
    try {
      pending = window.localStorage.getItem("prism:blast:pending-target");
      if (pending) window.localStorage.removeItem("prism:blast:pending-target");
    } catch {
      pending = null;
    }
    const file = pending?.trim();
    if (!file) return;
    setMode("file");
    setTarget({ kind: "file", id: file, path: file });
    setSymbolLabel(null);
    setQuery(file);
  }, []);

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
      void client.fetchSymbolHits(q).then(setSymbolHits);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [mode, query, props.root, client]);

  // Full impact bundle — target changes only (keeps rename input mounted).
  useEffect(() => {
    if (!target || !props.root) {
      setBundle(null);
      setStatus("idle");
      setError(null);
      setRenameRefreshing(false);
      lastRenameFetchedRef.current = null;
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setVisibleCount(PAGE_SIZE);
    setCatFilter("all");
    const nameAtSelect = newNameRef.current.trim();
    lastRenameFetchedRef.current = nameAtSelect;
    void client
      .fetchImpactBundle({
        ...target,
        ...(nameAtSelect ? { newName: nameAtSelect } : {}),
      })
      .then((res) => {
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
  }, [target, props.root, client]);

  // Debounced rename-only refresh — updates rename panel without layout remount.
  useEffect(() => {
    if (!target || !props.root || status !== "ready") return;
    const trimmed = newName.trim();
    if (lastRenameFetchedRef.current === trimmed) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setRenameRefreshing(true);
      void client
        .fetchImpactBundle({
          ...target,
          ...(trimmed ? { newName: trimmed } : {}),
        })
        .then((res) => {
          if (cancelled) return;
          if (res.ok) {
            lastRenameFetchedRef.current = trimmed;
            setBundle((prev) =>
              prev ? { ...prev, rename: res.value.rename } : res.value,
            );
          }
          setRenameRefreshing(false);
        });
    }, RENAME_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [newName, target, props.root, client, status]);

  const selectFilePath = (path: string) => {
    setMode("file");
    setTarget({ kind: "file", id: path, path });
    setSymbolLabel(null);
    setQuery(path);
    setNewName(path.split("/").pop() ?? path);
  };

  const selectSymbolHit = (hit: SymbolSearchHit) => {
    setMode("symbol");
    setTarget({ kind: "symbol", id: hit.id, path: hit.path });
    setSymbolLabel(hit.name);
    setQuery(hit.name);
    setNewName(`${hit.name}V2`);
  };

  const changeMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setTarget(null);
    setSymbolLabel(null);
    setQuery("");
  };

  const clearTarget = () => {
    setTarget(null);
    setSymbolLabel(null);
    setQuery("");
    setNewName("");
    setPreviewOpen(false);
    setPreviewError(null);
    setPreviewToPath(null);
  };

  const originPathForRename =
    target?.kind === "file"
      ? (target.path ?? target.id)
      : (target?.path ?? bundle?.rename.origin.path ?? null);

  const openRenamePreview = async () => {
    if (!target || !props.root) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      setPreviewError("Enter a new name before previewing.");
      setPreviewOpen(true);
      return;
    }
    setPreviewBusy(true);
    setPreviewError(null);
    setPreviewOpen(true);
    try {
      const res = await client.fetchImpactBundle({
        ...target,
        newName: trimmed,
      });
      if (!res.ok) {
        setPreviewError(res.error);
        return;
      }
      lastRenameFetchedRef.current = trimmed;
      setBundle((prev) =>
        prev ? { ...prev, rename: res.value.rename } : res.value,
      );
      if (target.kind === "file") {
        const from = target.path ?? target.id;
        setPreviewToPath(resolveRenameToPath(from, trimmed));
      } else {
        setPreviewToPath(null);
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewBusy(false);
    }
  };

  const confirmApplyRename = async () => {
    if (!target || target.kind !== "file" || !bundle || !previewToPath) return;
    if (!client.applyRename) {
      setPreviewError("Rename apply is not available in this host.");
      return;
    }
    const fromPath = target.path ?? target.id;
    setApplyBusy(true);
    setPreviewError(null);
    const started = performance.now();
    try {
      const result = await client.applyRename({
        fromPath,
        toPath: previewToPath,
        editSites: bundle.rename.editSites.map((s) => ({
          path: s.path,
          count: s.count,
        })),
        oldName: fromPath.split("/").pop() ?? fromPath,
        newName: newName.trim(),
      });
      if (!result.ok) {
        setPreviewError(result.error);
        return;
      }
      recordAudit({
        category: "impact",
        operation: "Applied file rename",
        target: `${result.fromPath} → ${result.toPath}`,
        durationMs: performance.now() - started,
        status: "success",
        command: `applyRename ${result.fromPath} → ${result.toPath}`,
        output: [
          `editedFiles=${result.editedFiles.length}`,
          ...result.editedFiles.map((p) => `edit:${p}`),
        ].join("\n"),
      });
      setPreviewOpen(false);
      setPreviewToPath(null);
      selectFilePath(result.toPath);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplyBusy(false);
    }
  };

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !applyBusy) {
        setPreviewOpen(false);
        setPreviewError(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewOpen, applyBusy]);

  const blast = bundle?.blast ?? null;
  const safeDelete = bundle?.safeDelete ?? null;
  const band = blast ? riskBand(blast.risk) : null;
  const directDeps = blast
    ? blast.affectedFiles.filter((f) => f.depth === 1).length
    : 0;

  const depthGroups = useMemo(() => {
    if (!blast) return [];
    return groupByDepth(blast.affectedFiles);
  }, [blast]);

  const catSummary = useMemo(
    () =>
      blast
        ? categoryCounts(blast.affectedFiles)
        : { ordered: [], uncategorized: 0 },
    [blast],
  );

  const flatAffected = useMemo(() => {
    if (!blast) return [];
    return [...blast.affectedFiles].sort(
      (a, b) => a.depth - b.depth || a.path.localeCompare(b.path),
    );
  }, [blast]);

  const filteredAffected = useMemo(() => {
    if (catFilter === "all") return flatAffected;
    return flatAffected.filter((f) => f.category === catFilter);
  }, [flatAffected, catFilter]);

  const catFilterOptions = useMemo(() => {
    const opts = [{ value: "all", label: `All (${flatAffected.length})` }];
    for (const c of catSummary.ordered) {
      opts.push({ value: c.key, label: `${c.label} (${c.count})` });
    }
    return opts;
  }, [catSummary, flatAffected.length]);

  const visibleAffected = filteredAffected.slice(0, visibleCount);
  const visibleGrouped = useMemo(
    () => groupByDepth(visibleAffected),
    [visibleAffected],
  );
  const remaining = Math.max(0, filteredAffected.length - visibleCount);

  const gaugeOffset = blast
    ? GAUGE_C * (1 - Math.max(0, Math.min(100, blast.risk)) / 100)
    : GAUGE_C;

  // Safe-delete config awareness: a repo-critical config/build file comes back
  // unsafe with a `config` blocker even when nothing imports it (M-046 #2).
  const configBlockers =
    safeDelete?.blockers.filter((b) => b.category === "config") ?? [];
  const hasConfigBlocker =
    !!safeDelete && !safeDelete.safe && configBlockers.length > 0;
  const hasDependentBlockers =
    !!safeDelete && safeDelete.blockers.some((b) => b.category !== "config");

  const chipLabel =
    target === null
      ? null
      : target.kind === "file"
        ? target.id
        : `${symbolLabel ?? target.id}${target.path ? ` · ${target.path}` : ""}`;

  const showSymbolPicker =
    mode === "symbol" && (!target || symbolHits.length > 0);
  const showFileLanding = mode === "file" && !target;

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
        </header>

        <div className="ov-scroll">
          <div className="br-target">
            {target && chipLabel ? (
              <div className="br-target__head">
                <span className="br-target__label">Target</span>
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
                    onClick={clearTarget}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </div>
            ) : null}
            <div className="br-target__controls">
              <SearchableInput
                className="br-target__search"
                value={query}
                onChange={setQuery}
                placeholder={
                  mode === "file" ? "Search files…" : "Search symbols…"
                }
                aria-label="Search blast targets"
                spellCheck={false}
              />
              <ToggleGroup
                aria-label="Target mode"
                options={[
                  { id: "file", label: "File" },
                  { id: "symbol", label: "Symbol" },
                ]}
                value={mode}
                onChange={(id) => changeMode(id as Mode)}
              />
            </div>
          </div>

          {showFileLanding ? (
            <div className="br-landing">
              <p className="br-landing__lead">
                Browse the indexed folder tree and pick a file to compute its
                blast radius (reverse dependents from the dependency graph). Use
                search to filter paths.
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
            </div>
          ) : null}

          {showSymbolPicker ? (
            <div className="br-landing">
              {symbolHits.length > 0 ? (
                <div className="br-picker">
                  <ul className="br-picker__list">
                    {symbolHits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          className="br-picker__item"
                          data-active={
                            target?.kind === "symbol" && target.id === hit.id
                              ? "true"
                              : "false"
                          }
                          onClick={() => selectSymbolHit(hit)}
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
              ) : !target ? (
                <p className="ov-empty">
                  {query.trim()
                    ? "No symbols match that name."
                    : "Type a symbol name to search the knowledge graph."}
                </p>
              ) : null}
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

          {status === "ready" && blast && band && bundle && safeDelete ? (
            <div className="br-stack">
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
                    <InfoTip label="Risk score bands">
                      Risk 0–100 = 55 × (affected ÷ analyzed−1) + min(30,
                      direct×5) + 15 when no tests sit in the radius; config
                      files get a High-floor boost. Bands: Low &lt; 20, Moderate
                      20–60, High 60+.
                    </InfoTip>
                  </div>
                  <p className="br-risk__copy">{riskRationale(blast)}</p>

                  {(blast.breakingChanges ?? []).length > 0 ? (
                    <div
                      className="br-breaks"
                      aria-label="Breaking-change hints"
                    >
                      {(blast.breakingChanges ?? []).map((h, i) => (
                        <div
                          key={`${h.kind}:${i}`}
                          className="br-break"
                          data-sev={h.severity}
                        >
                          <ShieldAlert size={14} aria-hidden />
                          <div>
                            <div className="br-break__k">{h.kind}</div>
                            <div className="br-break__m">{h.message}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="br-mstrip" aria-label="Impact metrics">
                    <div className="br-mstrip__item">
                      <div className="br-mstrip__v">{blast.risk}</div>
                      <div className="br-mstrip__k">Risk · {band.short}</div>
                    </div>
                    <div className="br-mstrip__item">
                      <div className="br-mstrip__v">
                        {blast.affectedFiles.length}
                      </div>
                      <div className="br-mstrip__k">Affected files</div>
                    </div>
                    <div className="br-mstrip__item">
                      <div className="br-mstrip__v">{directDeps}</div>
                      <div className="br-mstrip__k">Direct (d1)</div>
                    </div>
                    <div className="br-mstrip__item">
                      <div className="br-mstrip__v">
                        {blast.testsLikelyAffected.length}
                      </div>
                      <div className="br-mstrip__k">Tests</div>
                    </div>
                    <div className="br-mstrip__item">
                      <div className="br-mstrip__v">
                        {safeDelete.orphans.length}
                      </div>
                      <div className="br-mstrip__k">Orphans</div>
                    </div>
                    <div className="br-mstrip__item">
                      <div className="br-mstrip__v">
                        {(blast.breakingChanges ?? []).length}
                      </div>
                      <div className="br-mstrip__k">Breaking</div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="ov-card br-down">
                <div className="ov-card__head">
                  <span className="ov-card__title">
                    <CardIcon icon={Zap} tone="violet" size={14} />
                    Downstream Impact
                  </span>
                  <span className="ov-card__meta">
                    {blast.affectedFiles.length}
                  </span>
                </div>
                {catSummary.ordered.length > 0 ? (
                  <div className="br-down__controls">
                    <div className="br-cats">
                      {catSummary.ordered.map((c) => (
                        <span key={c.key} className="br-cat" data-cat={c.key}>
                          {c.label}
                          <span className="br-cat__n">{c.count}</span>
                        </span>
                      ))}
                      {catSummary.uncategorized > 0 ? (
                        <span className="br-cat" data-cat="other">
                          Other
                          <span className="br-cat__n">
                            {catSummary.uncategorized}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    <div className="br-down__filter">
                      <Select
                        aria-label="Filter downstream files by category"
                        options={catFilterOptions}
                        value={catFilter}
                        onChange={(v) => {
                          setCatFilter(v as Category | "all");
                          setVisibleCount(PAGE_SIZE);
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                {depthGroups.length === 0 ? (
                  <p className="ov-empty">
                    No downstream dependents — isolated change surface.
                  </p>
                ) : filteredAffected.length === 0 ? (
                  <p className="ov-empty">No files in the selected category.</p>
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
                              {row.category && CATEGORY_LABEL[row.category] ? (
                                <span
                                  className="br-cat br-cat--sm"
                                  data-cat={row.category}
                                >
                                  {CATEGORY_LABEL[row.category]}
                                </span>
                              ) : null}
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

              <div className="br-safety-grid">
                <article className="ov-card br-safety">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <CardIcon icon={Pencil} tone="violet" size={14} />
                      Rename Impact
                    </span>
                    {renameRefreshing ? (
                      <span className="ov-card__meta">Updating…</span>
                    ) : null}
                  </div>
                  <div className="br-safety__body">
                    {(bundle.rename.breakingChanges ?? []).length > 0 ? (
                      <div className="br-hints">
                        {(bundle.rename.breakingChanges ?? []).map((h, i) => (
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
                      <p className="ov-empty">
                        No automated breaking-change heuristics matched for this
                        symbol/file.
                      </p>
                    )}

                    <label className="br-section-h" htmlFor="br-rename">
                      New name
                    </label>
                    <div className="br-rename-row">
                      <Input
                        id="br-rename"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        spellCheck={false}
                        aria-label="Rename target"
                        placeholder={
                          target?.kind === "file"
                            ? "New file name…"
                            : "New symbol name…"
                        }
                      />
                      <button
                        type="button"
                        className="ov-btn"
                        disabled={!newName.trim() || previewBusy || applyBusy}
                        onClick={() => void openRenamePreview()}
                      >
                        Preview rename
                      </button>
                    </div>
                    <p className="dm-note">
                      {target?.kind === "file"
                        ? "Preview lists the new path and import rewrites, then confirm to apply in the workspace."
                        : "Symbol rename is preview-only this round — impact and breaking hints only."}
                    </p>

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
                  </div>
                </article>

                <article className="ov-card br-safety">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <CardIcon icon={Trash2} tone="amber" size={14} />
                      Safe Delete
                    </span>
                  </div>
                  <div className="br-safety__body">
                    <div
                      className={`br-verdict${
                        safeDelete.safe
                          ? " br-verdict--safe"
                          : " br-verdict--warn"
                      }`}
                    >
                      {safeDelete.safe ? (
                        <CheckCircle2 size={16} aria-hidden />
                      ) : (
                        <AlertTriangle size={16} aria-hidden />
                      )}
                      <span>
                        {safeDelete.safe
                          ? "Safe to delete — no dependents"
                          : hasConfigBlocker && !hasDependentBlockers
                            ? "Not safe — repo-critical config/build file"
                            : "Not safe — dependents block deletion"}
                      </span>
                    </div>

                    {hasConfigBlocker ? (
                      <div className="br-config-blocker">
                        <FileWarning size={16} aria-hidden />
                        <div>
                          <div className="br-config-blocker__t">
                            Why it&apos;s unsafe
                          </div>
                          <ul className="br-config-blocker__list">
                            {configBlockers.map((b) => (
                              <li
                                key={`${b.path}:${b.depth}`}
                                className="br-config-blocker__item"
                              >
                                {b.reason}
                              </li>
                            ))}
                          </ul>
                          <div className="br-config-blocker__item">
                            Deleting this file can break builds, tooling, or CI
                            even though nothing imports it.
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <h4 className="br-section-h br-section-h--tip">
                      <span>Blockers ({safeDelete.blockers.length})</span>
                      <InfoTip label="Blockers">
                        Files that depend on this target (or repo-critical
                        config files) and prevent safe deletion because they
                        would break if it were removed.
                      </InfoTip>
                    </h4>
                    {safeDelete.blockers.length > 0 ? (
                      <div className="dm-rank">
                        {safeDelete.blockers.map((b) => (
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
                            {b.category && CATEGORY_LABEL[b.category] ? (
                              <span
                                className="br-cat br-cat--sm"
                                data-cat={b.category}
                              >
                                {CATEGORY_LABEL[b.category]}
                              </span>
                            ) : (
                              <span className="dm-rank__val ov-mono">
                                d{b.depth}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="ov-empty">No blockers.</p>
                    )}

                    <h4 className="br-section-h br-section-h--tip">
                      <span>Orphans ({safeDelete.orphans.length})</span>
                      <InfoTip label="Orphans">
                        Files that become unreachable once this target is
                        removed (their only importers were in the removed set).
                      </InfoTip>
                    </h4>
                    {safeDelete.orphans.length > 0 ? (
                      <div className="dm-rank">
                        {safeDelete.orphans.map((p) => (
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
                </article>
              </div>

              <article className="ov-card">
                <div className="ov-card__head">
                  <span className="ov-card__title">
                    <CardIcon icon={FlaskConical} tone="emerald" size={14} />
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
                        <span className="dm-rank__val ov-mono">d{t.depth}</span>
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
                  From Core <span className="ov-mono">testImpact</span> (M-021)
                  — paths + reason + depth. Run action deferred.
                </p>
              </article>
            </div>
          ) : null}
        </div>
      </div>

      {previewOpen ? (
        <div
          className="br-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!applyBusy) {
              setPreviewOpen(false);
              setPreviewError(null);
            }
          }}
        >
          <div
            className="br-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="br-rename-preview-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="br-modal__head">
              <h2 id="br-rename-preview-title" className="br-modal__title">
                Rename preview
              </h2>
              <button
                type="button"
                className="br-modal__close"
                aria-label="Close preview"
                disabled={applyBusy}
                onClick={() => {
                  setPreviewOpen(false);
                  setPreviewError(null);
                }}
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            {previewBusy ? (
              <p className="ov-empty">Computing rename impact…</p>
            ) : (
              <>
                {target?.kind === "file" && originPathForRename ? (
                  <div className="br-modal__path">
                    <span
                      className="ov-mono ov-ellipsis"
                      title={originPathForRename}
                    >
                      {originPathForRename}
                    </span>
                    <span className="br-modal__arrow" aria-hidden>
                      →
                    </span>
                    <span
                      className="ov-mono ov-ellipsis"
                      title={previewToPath ?? ""}
                    >
                      {previewToPath ?? "—"}
                    </span>
                  </div>
                ) : (
                  <div className="br-modal__path">
                    <span className="ov-mono">
                      {symbolLabel ?? target?.id ?? "symbol"}
                    </span>
                    <span className="br-modal__arrow" aria-hidden>
                      →
                    </span>
                    <span className="ov-mono">{newName.trim() || "—"}</span>
                  </div>
                )}

                {target?.kind === "symbol" ? (
                  <p className="br-modal__note">
                    Symbol rename apply is not available this round. Review edit
                    sites and breaking-change hints below — apply remains
                    disabled.
                  </p>
                ) : (
                  <p className="br-modal__note">
                    Confirm to rename the file and best-effort rewrite
                    import/path strings in the listed files. This is not a
                    perfect AST rename.
                  </p>
                )}

                <h3 className="br-section-h">
                  Files that will be edited (
                  {bundle?.rename.editSites.length ?? 0})
                </h3>
                {(bundle?.rename.editSites.length ?? 0) > 0 ? (
                  <div className="br-modal__sites">
                    {bundle!.rename.editSites.map((s) => (
                      <div key={s.path} className="br-modal__site">
                        <span className="ov-mono ov-ellipsis" title={s.path}>
                          {s.path}
                        </span>
                        <span className="ov-mono">
                          {s.count} ref{s.count === 1 ? "" : "s"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ov-empty">No edit sites reported.</p>
                )}

                {(bundle?.rename.breakingChanges ?? []).length > 0 ? (
                  <div className="br-hints br-modal__hints">
                    {(bundle!.rename.breakingChanges ?? []).map((h, i) => (
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
                ) : null}

                {previewError ? (
                  <p className="br-error br-modal__error">{previewError}</p>
                ) : null}

                <div className="br-modal__actions">
                  <button
                    type="button"
                    className="ov-btn ov-btn--ghost"
                    disabled={applyBusy}
                    onClick={() => {
                      setPreviewOpen(false);
                      setPreviewError(null);
                    }}
                  >
                    Cancel
                  </button>
                  {target?.kind === "file" ? (
                    <button
                      type="button"
                      className="ov-btn"
                      disabled={
                        applyBusy ||
                        previewBusy ||
                        !previewToPath ||
                        !client.applyRename
                      }
                      onClick={() => void confirmApplyRename()}
                    >
                      {applyBusy ? "Applying…" : "Confirm rename"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ov-btn"
                      disabled
                      title="Symbol rename apply is not available this round"
                    >
                      Preview only this round
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
