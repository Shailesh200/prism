import HighchartsReactImport from "highcharts-react-official";
import type { Chart, Options, Point } from "highcharts";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
} from "react";
import type { GraphNodeDto } from "@prism/shared";
import type { DensityMode } from "./density-layout.js";
import { buildFileTreeIndex, type TreeEntry } from "./file-tree.js";
import { ensureHighchartsTreemap, Highcharts } from "./highcharts-setup.js";
import {
  breadcrumbTrail,
  findTreeEntry,
  treeLevelToTreemapPoints,
  type TreemapPointCustom,
} from "./highcharts-treemap-data.js";
import type { HighchartsReactProps } from "highcharts-react-official";
import {
  FILE_TYPE_LEGEND,
  TREEMAP_SHADES,
  colorizeTreemapPoints,
  labelInkForFill,
} from "./treemap-palette.js";

const HighchartsReact = ((
  HighchartsReactImport as unknown as {
    default?: ComponentType<HighchartsReactProps>;
  }
).default ?? HighchartsReactImport) as ComponentType<HighchartsReactProps>;

export type DensityMapProps = {
  readonly nodes: readonly GraphNodeDto[];
  readonly mode: DensityMode;
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null, label: string) => void;
  readonly onModeChange: (mode: DensityMode) => void;
};

const DBLCLICK_MS = 380;

function pointSelectId(point: Point): string | null {
  const custom = point.options.custom as TreemapPointCustom | undefined;
  if (custom?.nodeId) return custom.nodeId;
  if (typeof point.options.id === "string") return point.options.id;
  return null;
}

function pointPath(point: Point): string {
  const custom = point.options.custom as TreemapPointCustom | undefined;
  return custom?.path || point.name || "";
}

function levelChildren(
  root: TreeEntry,
  folderId: string | null,
): readonly TreeEntry[] {
  if (!folderId) return root.children;
  const folder = findTreeEntry(root, folderId);
  return folder?.children ?? root.children;
}

function pointAtClient(
  chart: Chart,
  clientX: number,
  clientY: number,
): Point | undefined {
  if (chart.hoverPoint) return chart.hoverPoint;
  const series = chart.series[0];
  if (!series) return undefined;
  const rect = chart.container.getBoundingClientRect();
  const x = clientX - rect.left - chart.plotLeft;
  const y = clientY - rect.top - chart.plotTop;
  for (const point of series.points) {
    const shape = (
      point as Point & {
        shapeArgs?: { x?: number; y?: number; width?: number; height?: number };
      }
    ).shapeArgs;
    if (
      !shape ||
      typeof shape.x !== "number" ||
      typeof shape.y !== "number" ||
      typeof shape.width !== "number" ||
      typeof shape.height !== "number"
    ) {
      continue;
    }
    if (
      x >= shape.x &&
      x <= shape.x + shape.width &&
      y >= shape.y &&
      y <= shape.y + shape.height
    ) {
      return point;
    }
  }
  return undefined;
}

export function DensityMap(props: DensityMapProps): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(props.onSelect);
  onSelectRef.current = props.onSelect;
  const treeRootRef = useRef<TreeEntry | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const lastClickRef = useRef<{ id: string; at: number } | null>(null);
  const [height, setHeight] = useState(560);
  const [hcReady, setHcReady] = useState(false);
  /** Current folder id; null = repository root. */
  const [folderId, setFolderId] = useState<string | null>(null);

  const tree = useMemo(() => buildFileTreeIndex(props.nodes), [props.nodes]);
  treeRootRef.current = tree.root;

  const openFolder = useCallback((entryId: string) => {
    const root = treeRootRef.current;
    if (!root) return;
    const entry = findTreeEntry(root, entryId);
    if (!entry || entry.kind !== "folder") return;
    const kids = entry.children.filter((c) => c.kind !== "symbol");
    if (kids.length === 0) return;
    setFolderId(entry.id);
  }, []);

  useEffect(() => {
    setFolderId(null);
  }, [props.nodes]);

  useEffect(() => {
    ensureHighchartsTreemap();
    setHcReady(true);
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setHeight(Math.max(320, Math.floor(box.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const crumbs = useMemo(
    () => breadcrumbTrail(tree.root, folderId),
    [tree.root, folderId],
  );

  const points = useMemo(() => {
    const level = treeLevelToTreemapPoints(levelChildren(tree.root, folderId));
    return colorizeTreemapPoints(
      level.map((p) => ({
        ...p,
        kind: p.custom.kind,
        fileCount: p.custom.fileCount,
        path: p.custom.path,
        name: p.name,
      })),
    ).map((p) => ({
      ...p,
      custom: {
        ...p.custom,
        ...(p.fileTone === undefined ? {} : { fileTone: p.fileTone }),
        ...(p.fileLabel === undefined ? {} : { fileLabel: p.fileLabel }),
      },
    }));
  }, [tree.root, folderId]);

  const options = useMemo((): Options => {
    const layoutAlgorithm = props.mode === "icicle" ? "strip" : "squarified";

    return {
      chart: {
        height,
        backgroundColor: "transparent",
        style: {
          fontFamily: "Satoshi, Segoe UI, sans-serif",
        },
        animation: { duration: 320 },
        spacing: [10, 12, 10, 10],
      },
      title: {
        text: "",
      },
      credits: { enabled: false },
      accessibility: { enabled: false },
      tooltip: {
        useHTML: true,
        // Render above HTML data-labels (avoids label text stacking over the tip).
        outside: true,
        headerFormat: "",
        footerFormat: "",
        backgroundColor: TREEMAP_SHADES.panel,
        borderColor: TREEMAP_SHADES.line,
        borderRadius: 10,
        shadow: false,
        padding: 12,
        hideDelay: 60,
        style: {
          color: TREEMAP_SHADES.ink,
          fontFamily: "Satoshi, Segoe UI, sans-serif",
          fontSize: "12px",
          zIndex: 20,
        },
        pointFormatter() {
          const custom = this.options.custom as TreemapPointCustom | undefined;
          const path = custom?.path || this.name;
          const count =
            custom?.fileCount ??
            (typeof this.options.value === "number" ? this.options.value : 0);
          const kind = custom?.kind ?? "file";
          const typeLabel = custom?.fileLabel;
          const chip =
            kind === "folder"
              ? `<span style="display:inline-block;margin-top:8px;padding:2px 8px;border-radius:999px;background:${TREEMAP_SHADES.aquaSoft};color:${TREEMAP_SHADES.brandStrong};font-size:10px;font-weight:650">Folder · ${count} files</span><div style="margin-top:6px;color:${TREEMAP_SHADES.inkMuted};font-size:11px">Double-click to open</div>`
              : `<span style="display:inline-block;margin-top:8px;padding:2px 8px;border-radius:999px;background:${TREEMAP_SHADES.tile};color:${TREEMAP_SHADES.inkMuted};font-size:10px;font-weight:650;border:1px solid ${TREEMAP_SHADES.line}">${typeLabel ?? "File"}</span>`;
          return `<div class="prism-density-tip" style="padding:2px 0;min-width:160px">
            <div style="font-weight:650;margin-bottom:4px;font-size:13px;color:${TREEMAP_SHADES.ink}">${this.name}</div>
            <div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:${TREEMAP_SHADES.inkMuted};word-break:break-all">${path}</div>
            ${chip}
          </div>`;
        },
      },
      // Fills come from design-system shades on each point; chrome swatches are the key.
      legend: { enabled: false },
      series: [
        {
          type: "treemap",
          name: "Files",
          layoutAlgorithm,
          alternateStartingDirection: props.mode === "treemap",
          allowTraversingTree: false,
          animationLimit: 400,
          ...({
            borderRadius: 8,
            borderWidth: 3,
            borderColor: TREEMAP_SHADES.panel,
          } as object),
          levels: [
            {
              level: 1,
              dataLabels: {
                enabled: true,
                align: "left",
                verticalAlign: "top",
                style: {
                  fontSize: "13px",
                  fontWeight: "650",
                  textOutline: "none",
                },
              },
              borderWidth: 3,
              borderColor: TREEMAP_SHADES.panel,
            },
          ],
          dataLabels: {
            enabled: true,
            style: {
              fontFamily: "Satoshi, Segoe UI, sans-serif",
              textOutline: "none",
              textAlign: "left",
            },
            padding: 8,
            formatter() {
              const custom = this.point.options.custom as
                | TreemapPointCustom
                | undefined;
              const fill =
                typeof this.point.color === "string"
                  ? this.point.color
                  : TREEMAP_SHADES.canvas;
              const ink = labelInkForFill(fill);
              const count = custom?.fileCount;
              const name = String(this.point.name ?? "");
              if (custom?.kind === "folder" && typeof count === "number") {
                return `<span style="color:${ink}"><span style="font-weight:650">${name}</span><br/><span style="font-size:10px;opacity:0.88;font-weight:500">${count} files</span></span>`;
              }
              return `<span style="color:${ink};font-weight:600">${name}</span>`;
            },
            useHTML: true,
          },
          states: {
            hover: {
              borderColor: TREEMAP_SHADES.brandStrong,
              brightness: 0.06,
              shadow: false,
            },
            select: {
              borderColor: TREEMAP_SHADES.brand,
              borderWidth: 3,
            },
          },
          point: {
            events: {
              click() {
                const entryId =
                  typeof this.options.id === "string" ? this.options.id : null;
                const custom = this.options.custom as
                  | TreemapPointCustom
                  | undefined;
                const selectId = pointSelectId(this);
                const path = pointPath(this);
                const now = Date.now();
                const prev = lastClickRef.current;

                if (
                  entryId &&
                  custom?.kind === "folder" &&
                  prev &&
                  prev.id === entryId &&
                  now - prev.at <= DBLCLICK_MS
                ) {
                  lastClickRef.current = null;
                  openFolder(entryId);
                  return;
                }

                lastClickRef.current = entryId
                  ? { id: entryId, at: now }
                  : null;
                if (selectId) onSelectRef.current(selectId, path);
              },
            },
          },
          data: points,
          turboThreshold: 0,
        },
      ],
    };
  }, [points, props.mode, height, openFolder]);

  const onChartReady = useCallback((chart: Chart) => {
    chartRef.current = chart;
  }, []);

  // Keep containerProps identity stable so HighchartsReact does not recreate
  // the chart on every parent render (it depends on containerProps).
  const containerProps = useMemo(
    () => ({ className: "prism-density__hc" }),
    [],
  );

  const chartPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = chartPanelRef.current;
    if (!panel) return;

    const onDblClick = (event: MouseEvent) => {
      const tiles = [
        ...panel.querySelectorAll<SVGElement & { point?: Point }>(
          ".highcharts-point",
        ),
      ];
      const hit = tiles.find((tile) => {
        const box = tile.getBoundingClientRect();
        return (
          event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom
        );
      });

      const point =
        hit?.point ??
        (chartRef.current
          ? pointAtClient(chartRef.current, event.clientX, event.clientY)
          : undefined);
      if (!point) return;

      const custom = point.options.custom as TreemapPointCustom | undefined;
      if (custom?.kind !== "folder") return;
      if (typeof point.options.id === "string") {
        openFolder(point.options.id);
      }
    };

    panel.addEventListener("dblclick", onDblClick);
    return () => panel.removeEventListener("dblclick", onDblClick);
  }, [openFolder, folderId, props.mode]);

  return (
    <div className="prism-density" ref={hostRef}>
      <div className="prism-density__chrome">
        <nav className="prism-density__crumbs" aria-label="Folder path">
          <button
            type="button"
            className="prism-density__crumb"
            data-active={folderId === null ? "true" : "false"}
            onClick={() => setFolderId(null)}
          >
            Repository
          </button>
          {crumbs.map((crumb) => (
            <span key={crumb.id} className="prism-density__crumb-wrap">
              <span className="prism-density__crumb-sep" aria-hidden="true">
                /
              </span>
              <button
                type="button"
                className="prism-density__crumb"
                data-active={folderId === crumb.id ? "true" : "false"}
                onClick={() => setFolderId(crumb.id)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="prism-density__intro">
          <strong>
            {props.mode === "icicle" ? "Strip density" : "File density"}
          </strong>
          <span>
            This level only · click to select · double-click a folder to open
          </span>
          <div className="prism-density__swatches" aria-hidden="true">
            {FILE_TYPE_LEGEND.map((item) => (
              <span
                key={item.tone}
                className="prism-density__swatch"
                title={item.label}
                style={{ background: item.color }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="prism-density__chart" ref={chartPanelRef}>
        {points.length === 0 ? (
          <div className="prism-density__loading">This folder is empty</div>
        ) : hcReady ? (
          createElement(HighchartsReact, {
            highcharts: Highcharts,
            options,
            callback: onChartReady,
            containerProps,
            immutable: true,
            key: `${folderId ?? "root"}:${props.mode}`,
          })
        ) : (
          <div className="prism-density__loading">Loading chart…</div>
        )}
      </div>
    </div>
  );
}
