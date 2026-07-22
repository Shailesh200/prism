import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type UIEvent,
} from "react";
import type { GraphNodeDto } from "@prism/shared";
import { ChevronRight } from "lucide-react";
import { MaterialFileIcon } from "./MaterialFileIcon.js";
import {
  buildFileTreeIndex,
  defaultExpandedIds,
  expandPathTo,
  flattenVisible,
  type FlatTreeRow,
  type TreeEntry,
} from "./file-tree.js";

const ROW_H = 30;
const OVERSCAN = 10;

export type FileExplorerProps = {
  readonly nodes: readonly GraphNodeDto[];
  readonly selectedId: string | null;
  readonly filterQuery?: string;
  readonly onSelectNode: (nodeId: string | null) => void;
  /** Reveal this node in the tree (expand ancestors + scroll). */
  readonly revealNodeId?: string | null;
};

function Chevron(props: { open: boolean }): ReactElement {
  return (
    <ChevronRight
      className="prism-explorer__chevron"
      size={16}
      aria-hidden
      style={{
        transform: props.open ? "rotate(90deg)" : undefined,
        transition: "transform 120ms ease",
      }}
    />
  );
}

function rowLabel(entry: TreeEntry): string {
  if (entry.kind === "folder") {
    return `${entry.name}${entry.fileCount ? ` · ${entry.fileCount}` : ""}`;
  }
  return entry.name;
}

export function FileExplorer(props: FileExplorerProps): ReactElement {
  const index = useMemo(() => buildFileTreeIndex(props.nodes), [props.nodes]);
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    defaultExpandedIds(index.root),
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Reset shallow expansion when the file set changes.
  useEffect(() => {
    setExpanded(defaultExpandedIds(index.root));
  }, [index.root]);

  // Reveal selection / search jump.
  useEffect(() => {
    const targetId = props.revealNodeId ?? props.selectedId;
    if (!targetId) return;
    const path = index.byNodeId.get(targetId);
    const ancestorIds = expandPathTo(index.root, {
      nodeId: targetId,
      ...(path === undefined ? {} : { path }),
    });
    if (ancestorIds.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of ancestorIds) next.add(id);
      return next;
    });
  }, [props.revealNodeId, props.selectedId, index]);

  const filterQuery = props.filterQuery ?? "";
  const rows = useMemo(
    () => flattenVisible(index.root, expanded, filterQuery),
    [index.root, expanded, filterQuery],
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setViewportH(h);
    });
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Scroll selected row into view when reveal changes.
  useEffect(() => {
    const targetId = props.revealNodeId ?? props.selectedId;
    if (!targetId) return;
    const idx = rows.findIndex((r) => r.entry.nodeId === targetId);
    if (idx < 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    const top = idx * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) {
      el.scrollTop = top - el.clientHeight + ROW_H * 2;
    }
  }, [props.revealNodeId, props.selectedId, rows]);

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const toggle = (entry: TreeEntry) => {
    if (entry.kind !== "folder" && entry.children.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
  };

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil(viewportH / ROW_H) + OVERSCAN * 2;
  const slice = rows.slice(start, start + visibleCount);
  const offsetY = start * ROW_H;
  const totalH = rows.length * ROW_H;

  return (
    <div className="prism-explorer">
      <header className="prism-explorer__toolbar">
        <div>
          <strong>Explorer</strong>
          <span>
            {index.fileCount} files · {index.folderCount} folders
            {index.symbolCount > 0 ? ` · ${index.symbolCount} symbols` : ""}
          </span>
        </div>
        <div className="prism-explorer__toolbar-actions">
          <button
            type="button"
            onClick={() => setExpanded(defaultExpandedIds(index.root))}
          >
            Collapse
          </button>
          <button
            type="button"
            onClick={() => {
              const all = new Set<string>();
              const walk = (e: TreeEntry) => {
                if (e.children.length > 0) all.add(e.id);
                for (const c of e.children) walk(c);
              };
              walk(index.root);
              setExpanded(all);
            }}
          >
            Expand all
          </button>
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="prism-explorer__list"
        onScroll={onScroll}
        role="tree"
        aria-label="Repository files"
      >
        <div className="prism-explorer__spacer" style={{ height: totalH }}>
          <div
            className="prism-explorer__window"
            style={{ transform: `translateY(${offsetY}px)` }}
          >
            {slice.map((row) => (
              <ExplorerRow
                key={row.entry.id}
                row={row}
                selectedId={props.selectedId}
                onToggle={() => toggle(row.entry)}
                onSelect={() => {
                  if (row.entry.nodeId) {
                    props.onSelectNode(row.entry.nodeId);
                  } else if (row.hasChildren) {
                    toggle(row.entry);
                  }
                }}
              />
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="prism-explorer__empty">No files match</p>
        ) : null}
      </div>
    </div>
  );
}

function ExplorerRow(props: {
  row: FlatTreeRow;
  selectedId: string | null;
  onToggle: () => void;
  onSelect: () => void;
}): ReactElement {
  const { entry, depth, expanded, hasChildren } = props.row;
  const selected =
    entry.nodeId !== undefined && entry.nodeId === props.selectedId;

  return (
    <div
      className="prism-explorer__row"
      style={{ paddingLeft: 10 + depth * 14 }}
      data-kind={entry.kind}
      data-selected={selected ? "true" : "false"}
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={selected}
    >
      <button
        type="button"
        className="prism-explorer__twist"
        tabIndex={-1}
        aria-hidden={!hasChildren}
        disabled={!hasChildren}
        onClick={(e) => {
          e.stopPropagation();
          props.onToggle();
        }}
      >
        {hasChildren ? (
          <Chevron open={expanded} />
        ) : (
          <span className="prism-explorer__twist-spacer" />
        )}
      </button>

      <button
        type="button"
        className="prism-explorer__item"
        onClick={props.onSelect}
        onDoubleClick={() => {
          if (hasChildren) props.onToggle();
        }}
      >
        {entry.kind === "folder" ? (
          <MaterialFileIcon
            name={entry.name}
            folder
            open={expanded}
            size={16}
          />
        ) : entry.kind === "symbol" ? (
          <MaterialFileIcon name={`${entry.name}.ts`} size={16} />
        ) : (
          <MaterialFileIcon name={entry.path || entry.name} size={16} />
        )}
        <span className="prism-explorer__name">{rowLabel(entry)}</span>
      </button>
    </div>
  );
}
