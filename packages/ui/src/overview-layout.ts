import type { Edge, Node } from "@xyflow/react";
import type { GraphEdgeDto, GraphNodeDto } from "@repo-prism/shared";

const CARD_W = 200;
const CARD_H = 108;
const GAP_X = 20;
const GAP_Y = 20;
const CLUSTER_GAP_X = 72;
const CLUSTER_GAP_Y = 64;
const CLUSTER_PAD_X = 16;
const CLUSTER_PAD_TOP = 44;
/** Cap columns so a single big cluster wraps into a near-square block. */
const CLUSTER_COLS_MAX = 6;
/** Wrap clusters onto a new row past this width (keeps overviews compact). */
const MAX_ROW_W = 1680;

const edgeStyle = {
  type: "default" as const,
  className: "prism-edge prism-edge--focus",
  style: {
    stroke: "url(#prism-edge-gradient)",
    strokeWidth: 1.9,
  },
};

const edgeDimStyle = {
  type: "default" as const,
  className: "prism-edge prism-edge--spoke",
  style: {
    stroke: "color-mix(in srgb, var(--prism-brand) 24%, transparent)",
    strokeWidth: 1.3,
  },
};

/** Faint always-on "arterial" routes — curated, never a hairball. */
const edgeAmbientStyle = {
  type: "default" as const,
  className: "prism-edge prism-edge--ambient",
  style: {
    stroke: "color-mix(in srgb, var(--prism-brand) 22%, transparent)",
    strokeWidth: 1.1,
  },
};

/** Cap on ambient routes shown when nothing is selected. */
const AMBIENT_CAP = 8;

export type OverviewLayout = {
  readonly nodes: Node[];
  readonly edges: Edge[];
};

type Cluster = {
  key: string;
  label: string;
  members: GraphNodeDto[];
};

function isHubKind(kind: string): boolean {
  return kind === "workspace" || kind === "repo";
}

/** Group key for overview islands (`@prism`, `@fixture`, `App`, …). */
export function clusterKeyForLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.startsWith("@")) {
    const slash = trimmed.indexOf("/");
    return slash >= 0 ? trimmed.slice(0, slash) : trimmed;
  }
  return "App";
}

export function shortLabelInCluster(label: string, clusterKey: string): string {
  if (clusterKey !== "App" && label.startsWith(`${clusterKey}/`)) {
    return label.slice(clusterKey.length + 1);
  }
  return label;
}

function buildClusters(nodes: readonly GraphNodeDto[]): Cluster[] {
  const buckets = new Map<string, GraphNodeDto[]>();
  for (const node of nodes) {
    const key = clusterKeyForLabel(node.label);
    const list = buckets.get(key) ?? [];
    list.push(node);
    buckets.set(key, list);
  }

  const preferred = [
    "App",
    "@repo-prism",
    "@prism",
    "@fixture",
    "@prism-fixture",
  ];
  const keys = [...buckets.keys()].sort((a, b) => {
    const ia = preferred.indexOf(a);
    const ib = preferred.indexOf(b);
    if (ia !== ib) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    return a.localeCompare(b);
  });

  return keys.map((key) => {
    const members = [...(buckets.get(key) ?? [])].sort((a, b) => {
      const ca =
        typeof a.attrs?.confidence === "number" ? a.attrs.confidence : 0;
      const cb =
        typeof b.attrs?.confidence === "number" ? b.attrs.confidence : 0;
      if (ca !== cb) return cb - ca;
      return a.label.localeCompare(b.label);
    });
    return {
      key,
      label: key === "App" ? "Application" : key,
      members,
    };
  });
}

function clusterInnerSize(count: number): {
  cols: number;
  w: number;
  h: number;
} {
  const cols = Math.min(
    CLUSTER_COLS_MAX,
    Math.max(1, Math.round(Math.sqrt(count))),
  );
  const rows = Math.ceil(count / cols);
  return {
    cols,
    w: cols * CARD_W + Math.max(0, cols - 1) * GAP_X + CLUSTER_PAD_X * 2,
    h: CLUSTER_PAD_TOP + rows * CARD_H + Math.max(0, rows - 1) * GAP_Y + 16,
  };
}

function selectEdges(
  graphEdges: readonly GraphEdgeDto[],
  known: ReadonlySet<string>,
  selectedId: string | null,
  hubIds: ReadonlySet<string>,
): Edge[] {
  const usable = graphEdges.filter((e) => known.has(e.from) && known.has(e.to));

  // Selection: only neighborhood — turns the map into a readable focus graph.
  if (selectedId && known.has(selectedId)) {
    return usable
      .filter((e) => e.from === selectedId || e.to === selectedId)
      .map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        ...edgeStyle,
      }));
  }

  // Repo hub: only containment spokes (sparse, intentional).
  if (hubIds.size > 0) {
    return usable
      .filter(
        (e) =>
          e.kind === "contains" && (hubIds.has(e.from) || hubIds.has(e.to)),
      )
      .map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        ...edgeDimStyle,
      }));
  }

  // Feature/package landing: curated arterial routes between the most
  // connected nodes — enough to feel alive, capped so it never tangles.
  const deg = new Map<string, number>();
  for (const e of usable) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }
  const score = (e: GraphEdgeDto) =>
    (deg.get(e.from) ?? 0) + (deg.get(e.to) ?? 0);
  return [...usable]
    .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))
    .slice(0, AMBIENT_CAP)
    .map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      ...edgeAmbientStyle,
    }));
}

/**
 * Clustered overview for repo / package / feature zoom.
 * Islands by scope, sparse edges, selection reveals neighborhood links.
 */
export function layoutOverviewGraph(
  graphNodes: readonly GraphNodeDto[],
  graphEdges: readonly GraphEdgeDto[],
  selectedId: string | null,
  metaFor: (
    kind: string,
    attrs: Record<string, unknown> | undefined,
  ) => string | undefined,
): OverviewLayout {
  const hubs = graphNodes.filter((n) => isHubKind(n.kind));
  const rest = graphNodes.filter((n) => !isHubKind(n.kind));
  const clusters = buildClusters(rest);
  const positions = new Map<string, { x: number; y: number }>();
  const nodes: Node[] = [];

  const clusterSizes = clusters.map((c) => ({
    cluster: c,
    size: clusterInnerSize(c.members.length),
  }));

  const totalClustersW = clusterSizes.reduce(
    (sum, c, i) => sum + c.size.w + (i > 0 ? CLUSTER_GAP_X : 0),
    0,
  );

  let originY = 0;
  if (hubs.length === 1) {
    positions.set(hubs[0]!.id, {
      x: Math.max(0, (totalClustersW - CARD_W) / 2),
      y: 0,
    });
    originY = CARD_H + CLUSTER_GAP_Y;
  } else if (hubs.length > 1) {
    hubs.forEach((hub, i) => {
      positions.set(hub.id, { x: i * (CARD_W + GAP_X), y: 0 });
    });
    originY = CARD_H + CLUSTER_GAP_Y;
  }

  let cursorX = 0;
  let rowY = originY;
  let rowMaxH = 0;
  for (const { cluster, size } of clusterSizes) {
    if (cursorX > 0 && cursorX + size.w > MAX_ROW_W) {
      cursorX = 0;
      rowY += rowMaxH + CLUSTER_GAP_Y;
      rowMaxH = 0;
    }
    const groupId = `group:${cluster.key}`;
    nodes.push({
      id: groupId,
      type: "prism",
      position: { x: cursorX, y: rowY },
      // Initial dimensions keep pre-measurement bounds exact, so the mount
      // fitView centers real card rectangles instead of node origins.
      width: size.w,
      height: size.h,
      style: { width: size.w, height: size.h },
      draggable: false,
      selectable: false,
      data: {
        label: cluster.label,
        kind: "group",
        selected: false,
        openable: false,
        meta: `${cluster.members.length} ${cluster.members[0]?.kind === "package" ? "packages" : "features"}`,
        group: true,
      },
    });

    cluster.members.forEach((member, index) => {
      const col = index % size.cols;
      const row = Math.floor(index / size.cols);
      const x = cursorX + CLUSTER_PAD_X + col * (CARD_W + GAP_X);
      const y = rowY + CLUSTER_PAD_TOP + row * (CARD_H + GAP_Y);
      positions.set(member.id, { x, y });
    });

    rowMaxH = Math.max(rowMaxH, size.h);
    cursorX += size.w + CLUSTER_GAP_X;
  }

  for (const hub of hubs) {
    const pos = positions.get(hub.id) ?? { x: 0, y: 0 };
    const meta = metaFor(
      hub.kind,
      hub.attrs as Record<string, unknown> | undefined,
    );
    nodes.push({
      id: hub.id,
      type: "prism",
      position: pos,
      width: CARD_W,
      height: CARD_H,
      style: { width: CARD_W, height: CARD_H },
      zIndex: 2,
      data: {
        label: hub.label,
        kind: hub.kind,
        selected: hub.id === selectedId,
        openable: true,
        enterDelay: 0.02,
        ...(meta === undefined ? {} : { meta }),
      },
    });
  }

  let enterOrder = 0;

  const degree = new Map<string, number>();
  for (const e of graphEdges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  const neighborIds = new Set<string>();
  if (selectedId) {
    neighborIds.add(selectedId);
    for (const e of graphEdges) {
      if (e.from === selectedId) neighborIds.add(e.to);
      if (e.to === selectedId) neighborIds.add(e.from);
    }
  }

  for (const cluster of clusters) {
    for (const member of cluster.members) {
      const pos = positions.get(member.id) ?? { x: 0, y: 0 };
      const meta = metaFor(
        member.kind,
        member.attrs as Record<string, unknown> | undefined,
      );
      const dimmed =
        selectedId !== null &&
        neighborIds.size > 0 &&
        !neighborIds.has(member.id);
      const confidence =
        typeof member.attrs?.confidence === "number"
          ? member.attrs.confidence
          : undefined;
      const enterDelay = Math.min(enterOrder * 0.028, 0.5);
      enterOrder += 1;
      const links = degree.get(member.id) ?? 0;
      nodes.push({
        id: member.id,
        type: "prism",
        position: pos,
        width: CARD_W,
        height: CARD_H,
        style: { width: CARD_W, height: CARD_H },
        zIndex: 2,
        data: {
          label: shortLabelInCluster(member.label, cluster.key),
          kind: member.kind,
          selected: member.id === selectedId,
          openable: member.kind === "feature" || member.kind === "package",
          dimmed,
          fullLabel: member.label,
          enterDelay,
          links,
          ...(confidence === undefined ? {} : { confidence }),
          ...(meta === undefined ? {} : { meta }),
        },
      });
    }
  }

  const known = new Set(graphNodes.map((n) => n.id));
  const hubIds = new Set(hubs.map((h) => h.id));
  const edges = selectEdges(graphEdges, known, selectedId, hubIds);

  return { nodes, edges };
}
