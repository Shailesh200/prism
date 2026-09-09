import type {
  BackendReport,
  DnaReport,
  DomainKindCount,
  DomainReport,
  GitActivity,
  GraphNodeDto,
  GraphSnapshotDto,
  UtilityOverlayFinding,
  UtilityOverlayReport,
} from "@repo-prism/shared";
import { countOverlayKinds, overlayNodePath } from "@repo-prism/shared";
import {
  AppWindow,
  Cloud,
  Database,
  Monitor,
  Server,
  Smartphone,
} from "lucide-react";
import type { ComponentType } from "react";
import type { AppSidebarUser, AppView } from "../AppSidebar.js";
import { KIND_META } from "./kind-meta.js";
import { writeStore } from "./store.js";

type DomainIcon = ComponentType<{
  size?: number | string;
  "aria-hidden"?: boolean;
}>;

export type DomainOverlayStatus = "idle" | "loading" | "ready" | "error";

export type DomainDef = {
  id: string;
  title: string;
  icon: DomainIcon;
  /** Core utility overlay kind, or `null` when the domain needs a lab run. */
  kind: string | null;
  surfaceLabel: string;
  description: string;
  sources: string;
  /** Copy for a domain that is opt-in but not yet wired (e.g. Lighthouse). */
  labNote?: string;
};

export const DOMAINS: Record<string, DomainDef> = {
  backend: {
    id: "backend",
    title: "Backend · Services & APIs",
    icon: Server,
    kind: "api-surface",
    surfaceLabel: "API Surface",
    description:
      "Extracts Express / Nest / Fastify routes (METHOD /path), auth exposure, test linkage, data layer, env vars, and background work via Core backend report — plus the api-surface overlay for Map.",
    sources:
      "route handlers, controllers, models/migrations, env usage, queues",
  },
  devops_platform: {
    id: "devops_platform",
    title: "DevOps · Platform",
    icon: Cloud,
    kind: "iac-resources",
    surfaceLabel: "Infrastructure Surface",
    description:
      "Detects infrastructure-as-code, container and CI/CD assets to map platform resources.",
    sources: "IaC manifests, CI/CD config, Dockerfiles & compose files",
  },
  mobile: {
    id: "mobile",
    title: "Mobile",
    icon: Smartphone,
    kind: "mobile-nav",
    surfaceLabel: "Screen Manifest",
    description:
      "Detects mobile screens and navigators from Expo Router / React Navigation path markers (local heuristics).",
    sources: "app/ routes, screens/, navigation & Navigator files",
  },
  desktop: {
    id: "desktop",
    title: "Desktop",
    icon: AppWindow,
    kind: "desktop-boundary",
    surfaceLabel: "Process Surface",
    description:
      "Detects Electron/Tauri main, preload, renderer, and IPC-touching files to map the desktop process boundary.",
    sources:
      "main/preload/renderer entry files, ipcMain/contextBridge/invoke usage, tauri.conf",
  },
  data_ml_ai: {
    id: "data_ml_ai",
    title: "Data / ML",
    icon: Database,
    kind: "data-pipeline-dag",
    surfaceLabel: "Pipeline Surface",
    description:
      "Detects pipelines, DAGs, models and notebooks to map the data / ML surface.",
    sources: "DAG folders, dbt models, Spark jobs & notebooks",
  },
  frontend: {
    id: "frontend",
    title: "Web · Frontend",
    icon: Monitor,
    kind: null,
    surfaceLabel: "Performance Surface",
    description:
      "Runs a local Lighthouse lab to capture Core Web Vitals and a consent-gated Bundle Weight analyze for chunk/module sizes.",
    sources: "local Lighthouse run, imported CWV report, or local bundle stats",
    labNote:
      "Runs a real local Lighthouse lab via Core against a production build (Prism builds + previews one when needed; dev servers are skipped because they distort lab metrics). Requires Chrome/Chromium — never shows sample numbers. Bundle Weight runs separately with Analyze in the Bundle / Weight section.",
  },
};

export const SEVERITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

export type Tile = {
  label: string;
  value: number | string;
  warn?: boolean;
  tip?: string;
};

export type DomainScreenProps = {
  domainId: string;
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  overlay: UtilityOverlayReport | null;
  status: DomainOverlayStatus;
  /** Backend / Mobile Wave 1: reused Core signals. */
  security?: UtilityOverlayReport | null;
  qa?: UtilityOverlayReport | null;
  depGraph?: GraphSnapshotDto | null;
  /** Route-granular backend report from Core `getBackendReport` (M-044). */
  backendReport?: BackendReport | null;
  /**
   * Per-domain aggregation from Core `getDomainReport` (M-053).
   * When present for the open domain, rankings / coverage prefer the report.
   */
  domainReport?: DomainReport | null;
  gitActivity?: GitActivity | null;
  /** Stack DNA — Mobile / Desktop Wave 1 stack snapshot. */
  dna?: DnaReport | null;
  onRun: (kind: string) => void;
  /**
   * Abort the in-flight Analyze run (host ignores late results and returns to
   * idle). When omitted, the loading state offers no cancel affordance.
   */
  onCancel?: (() => void) | undefined;
  onNavigate: (view: AppView) => void;
};

export function titleCase(id: string): string {
  return id
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function kindLabel(kind: string): string {
  return KIND_META[kind]?.label ?? titleCase(kind);
}

export function kindColor(kind: string): string {
  return KIND_META[kind]?.color ?? "#8AA0AA";
}

export function nodePath(attrs: Record<string, unknown> | undefined): string {
  return overlayNodePath(attrs);
}

export function shortProcessLabel(
  label: string,
  kind: string,
  path: string,
): string {
  const base = (path || label).split("/").pop() ?? label;
  if (base.includes(" · ")) return base;
  return `${base} · ${kindLabel(kind)}`;
}

export function overlayAnalyzeSteps(
  def: DomainDef,
  flags: {
    enriched?: boolean;
    isMobile?: boolean;
    isDesktop?: boolean;
  },
): string[] {
  const steps = [`${def.kind ?? def.id} overlay`];
  if (flags.enriched) steps.push("security-surface overlay");
  if (flags.enriched || flags.isMobile) steps.push("qa-test-gaps overlay");
  if (flags.enriched || flags.isMobile || flags.isDesktop) {
    steps.push("dependency graph");
  }
  if (flags.enriched) steps.push("backend report");
  return steps;
}

/**
 * Open the Blast Radius screen for a file. The shared navigation prop only
 * carries an `AppView` (no target payload), so we stash the intended target
 * locally for a future Blast screen to consume, then navigate. See summary
 * for the host/contract gap.
 */
export function openBlastFor(
  path: string,
  domainId: string,
  onNavigate: (view: AppView) => void,
): void {
  if (path) {
    writeStore("prism:blast:pending-target", {
      kind: "file",
      id: path,
      path,
      at: Date.now(),
      returnView: "domain",
      domainId,
    });
  }
  onNavigate("blast");
}

export function domainSubtitle(
  repoLabel: string,
  branch: string | undefined,
): string {
  return [repoLabel, branch].filter(Boolean).join(" · ");
}

export function overlayKindCounts(
  nodes: readonly GraphNodeDto[],
  fromReport?: readonly DomainKindCount[] | null,
): (readonly [string, number])[] {
  if (fromReport) return fromReport.map((k) => [k.kind, k.count] as const);
  return countOverlayKinds(nodes).map((k) => [k.kind, k.count] as const);
}

export function sortedOverlayFindings(
  overlay: UtilityOverlayReport | null,
): UtilityOverlayFinding[] {
  return [...(overlay?.findings ?? [])].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}
