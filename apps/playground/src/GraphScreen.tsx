import { Text } from "@repo-prism/ui";
import type { GraphExport, GraphExportNode } from "@repo-prism/shared";
import {
  AppSidebar,
  shellNavVariant,
  shellRootClass,
  type AppSidebarUser,
  type AppView,
} from "@repo-prism/app-shell";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  fileCount,
  filesInPackage,
  packageKey,
  promptFor,
  relationsFor,
  visibleFiles,
  visiblePackages,
  type GraphRelation,
} from "./graph-model.js";
import "./graph-screen.css";

export type GraphScreenProps = {
  readonly root: string;
  readonly repoLabel: string;
  readonly branch?: string | undefined;
  readonly user?: AppSidebarUser | null;
  readonly onNavigate: (view: AppView) => void;
};

type Load =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly graph: GraphExport };

function BrokenPath(props: { readonly value: string }): ReactElement {
  const parts = props.value.split("/");
  return (
    <>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 ? "/" : ""}
          {part}
          {index < parts.length - 1 ? <wbr /> : null}
        </span>
      ))}
    </>
  );
}

function kindLabel(kind: GraphExportNode["kind"]): string {
  if (kind === "test") return "Test";
  if (kind === "package") return "Package";
  if (kind === "file") return "File";
  if (kind === "adr") return "ADR";
  return "Symbol";
}

function RelationList(props: {
  readonly title: string;
  readonly rows: readonly GraphRelation[];
  readonly onOpen: (node: GraphExportNode) => void;
}): ReactElement | null {
  if (props.rows.length === 0) return null;
  const shown = props.rows.slice(0, 24);
  return (
    <section className="pgraph__section">
      <h3>
        {props.title}
        {props.rows.length > shown.length ? ` · ${props.rows.length}` : ""}
      </h3>
      <ul className="pgraph__links">
        {shown.map((row) => {
          const label = row.other?.path || row.other?.label || row.edge.to;
          const pathLabel = label.includes("/");
          return (
            <li key={`${row.edge.kind}:${row.edge.from}:${row.edge.to}`}>
              {row.other ? (
                <button
                  type="button"
                  className="pgraph__link"
                  onClick={() => {
                    if (row.other) props.onOpen(row.other);
                  }}
                >
                  {pathLabel ? <BrokenPath value={label} /> : label}
                </button>
              ) : (
                <span className="pgraph__link">
                  {pathLabel ? <BrokenPath value={label} /> : label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function GraphScreen(props: GraphScreenProps): ReactElement {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoad({ status: "loading" });
    const params = new URLSearchParams({ root: props.root });
    void fetch(`/api/graph-export?${params}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || "Could not read the graph");
        }
        return (await response.json()) as GraphExport;
      })
      .then((graph) => {
        if (!alive) return;
        const first = visiblePackages(graph, "")[0];
        const key = first ? packageKey(first) : null;
        const firstFile = key ? filesInPackage(graph, key)[0] : undefined;
        setFocusKey(key);
        setSelectedId(firstFile?.id ?? first?.id ?? null);
        setLoad({ status: "ready", graph });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setLoad({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      alive = false;
    };
  }, [props.root]);

  const graph = load.status === "ready" ? load.graph : null;
  const packages = useMemo(
    () => (graph ? visiblePackages(graph, query) : []),
    [graph, query],
  );
  const focus = graph?.nodes.find(
    (node) => node.kind === "package" && packageKey(node) === focusKey,
  );
  const files = useMemo(
    () => (graph && focusKey ? visibleFiles(graph, focusKey, query) : []),
    [graph, focusKey, query],
  );
  const selected =
    graph?.nodes.find((node) => node.id === selectedId) ?? focus ?? null;
  const relations =
    graph && selected ? relationsFor(graph, selected.id) : null;

  const openNode = (node: GraphExportNode): void => {
    if (node.kind === "package") {
      const key = packageKey(node);
      const firstFile = graph ? filesInPackage(graph, key)[0] : undefined;
      setFocusKey(key);
      setSelectedId(firstFile?.id ?? node.id);
      return;
    }
    if (node.package) setFocusKey(node.package);
    setSelectedId(node.id);
  };

  const copy = (): void => {
    if (!selected) return;
    const text = promptFor(selected);
    const done = (): void => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(done).catch(done);
      return;
    }
    done();
  };

  const subtitle = [
    props.repoLabel,
    props.branch,
    graph
      ? `${graph.stats.packages} packages · ${graph.stats.files} files · ${graph.stats.tests} tests`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={shellRootClass("pgraph-root")}>
      <AppSidebar
        variant={shellNavVariant()}
        active="overview"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />
      <div className="ov-main">
        <header className="ov-top">
          <div>
            <Text variant="page" as="div" className="ov-top__title">
              Graph
            </Text>
            <Text variant="caption" as="div" className="ov-top__sub">
              {subtitle}
            </Text>
          </div>
        </header>
        {load.status === "loading" ? (
          <p className="pgraph__status">Reading the graph…</p>
        ) : load.status === "error" ? (
          <p className="pgraph__status pgraph__status--err">{load.message}</p>
        ) : (
          <div className="pgraph">
            <aside className="pgraph__col pgraph__packages">
              <div className="pgraph__head">
                <span>Packages</span>
                <span>{packages.length}</span>
              </div>
              <input
                className="pgraph__search"
                type="search"
                placeholder="Search packages and files"
                aria-label="Search packages and files"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="pgraph__list">
                {packages.length === 0 ? (
                  <p className="pgraph__empty">No packages match.</p>
                ) : (
                  packages.map((pkg) => (
                    <button
                      key={pkg.id}
                      type="button"
                      className="pgraph__row"
                      data-active={focusKey === packageKey(pkg) ? "true" : "false"}
                      title={pkg.label}
                      onClick={() => openNode(pkg)}
                    >
                      <span className="pgraph__name">{pkg.label}</span>
                      <span className="pgraph__count">
                        {graph ? fileCount(graph, pkg) : 0}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </aside>
            <section className="pgraph__col pgraph__stage">
              {focus ? (
                <>
                  <div className="pgraph__stage-head">
                    <div>
                      <h2 className="pgraph__stage-title">{focus.label}</h2>
                      <p className="pgraph__stage-sub">
                        {graph ? fileCount(graph, focus) : 0} files in this
                        package
                        {query.trim() &&
                        graph &&
                        files.length !== fileCount(graph, focus)
                          ? ` · ${files.length} match`
                          : ""}
                      </p>
                    </div>
                  </div>
                  {files.length === 0 ? (
                    <p className="pgraph__empty">
                      No files in this package are in the graph.
                    </p>
                  ) : (
                    <ul className="pgraph__files">
                      {files.map((file) => (
                        <li key={file.id}>
                          <button
                            type="button"
                            className="pgraph__file"
                            data-active={
                              selected?.id === file.id ? "true" : "false"
                            }
                            title={file.path || file.label}
                            onClick={() => openNode(file)}
                          >
                            <span
                              className={
                                file.kind === "test"
                                  ? "pgraph__kind pgraph__kind--test"
                                  : "pgraph__kind"
                              }
                            >
                              {kindLabel(file.kind)}
                            </span>
                            <span className="pgraph__file-copy">
                              <span className="pgraph__file-name">
                                {file.label}
                              </span>
                              {file.path && file.path !== file.label ? (
                                <span className="pgraph__file-path">
                                  <BrokenPath value={file.path} />
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="pgraph__empty">This repository has no packages in the graph.</p>
              )}
            </section>
            <aside className="pgraph__col pgraph__inspector">
              <div className="pgraph__head">
                <span>Inspector</span>
              </div>
              {selected && relations ? (
                <div className="pgraph__inspector-body">
                  <div>
                    <h2>{selected.label}</h2>
                    <p className="pgraph__path">
                      {kindLabel(selected.kind)}
                      {selected.path ? (
                        <>
                          {" · "}
                          <BrokenPath value={selected.path} />
                        </>
                      ) : null}
                      {selected.package ? ` · ${selected.package}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ov-btn ov-btn--primary"
                    onClick={copy}
                  >
                    {copied ? "Copied" : "Copy as prompt"}
                  </button>
                  <RelationList
                    title="Imports"
                    rows={relations.imports}
                    onOpen={openNode}
                  />
                  <RelationList
                    title="Imported by"
                    rows={relations.importedBy}
                    onOpen={openNode}
                  />
                  <RelationList
                    title="Tests"
                    rows={relations.tests}
                    onOpen={openNode}
                  />
                  {selected.kind !== "package" ? null : (
                    <p className="pgraph__empty">
                      {relations.files.length} files are listed in the center.
                    </p>
                  )}
                </div>
              ) : (
                <p className="pgraph__status">Select a package or file.</p>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
