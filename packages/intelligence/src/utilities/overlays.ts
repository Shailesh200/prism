import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  StackDomain,
  UtilityOverlayKindSchema,
  type GraphEdgeDto,
  type GraphNodeDto,
  type GraphSnapshotDto,
  type IndexSnapshot,
  type StackPackageProfile,
  type StackProfile,
  type UtilityOverlayFinding,
  type UtilityOverlayKind,
  type UtilityOverlayKindInfo,
  type UtilityOverlayReport,
} from "@prism/shared";
import { discoverLocalPackages } from "../dependency/packages.js";

const SKIP_DIRS = new Set([
  ".git",
  ".prism",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
]);

export type BuildUtilityOverlayInput = {
  readonly workspaceRoot: string;
  readonly kind: UtilityOverlayKind;
  readonly packageId?: string;
  readonly packageRootDir?: string;
  readonly stack?: StackProfile;
  readonly index?: IndexSnapshot;
};

export const UTILITY_OVERLAY_CATALOG: readonly UtilityOverlayKindInfo[] = [
  {
    kind: "api-surface",
    domain: StackDomain.BACKEND,
    label: "API / RPC surface",
    backlogIds: ["BE-01"],
    requiresIndex: false,
  },
  {
    kind: "mobile-nav",
    domain: StackDomain.MOBILE,
    label: "Mobile navigation / screens",
    backlogIds: ["MO-01"],
    requiresIndex: false,
  },
  {
    kind: "desktop-boundary",
    domain: StackDomain.DESKTOP,
    label: "Desktop main / renderer / IPC",
    backlogIds: ["DT-01"],
    requiresIndex: false,
  },
  {
    kind: "notebook-modules",
    domain: StackDomain.DATA_ML_AI,
    label: "Notebook ↔ module graph",
    backlogIds: ["ML-01"],
    requiresIndex: false,
  },
  {
    kind: "data-pipeline-dag",
    domain: StackDomain.DATA_ENGINEERING,
    label: "Data pipeline / DAG",
    backlogIds: ["DE-01"],
    requiresIndex: false,
  },
  {
    kind: "iac-resources",
    domain: StackDomain.DEVOPS_PLATFORM,
    label: "IaC resource map",
    backlogIds: ["DO-01"],
    requiresIndex: false,
  },
  {
    kind: "embedded-regions",
    domain: StackDomain.EMBEDDED_SYSTEMS,
    label: "Firmware vs host regions",
    backlogIds: ["EM-01"],
    requiresIndex: false,
  },
  {
    kind: "game-regions",
    domain: StackDomain.GAME,
    label: "Game content vs code regions",
    backlogIds: ["GM-01"],
    requiresIndex: false,
  },
  {
    kind: "qa-test-gaps",
    domain: "qa",
    label: "Test-only packages / e2e gaps",
    backlogIds: ["QA-01"],
    requiresIndex: false,
  },
  {
    kind: "security-surface",
    domain: "security",
    label: "Auth / crypto / policy surface",
    backlogIds: ["SEC-01"],
    requiresIndex: false,
  },
  {
    kind: "cross-package-impact",
    domain: StackDomain.TOOLING,
    label: "Cross-package impact defaults",
    backlogIds: ["MR-06"],
    requiresIndex: true,
  },
  {
    kind: "domain-regions",
    domain: StackDomain.TOOLING,
    label: "Domain-colored Map regions",
    backlogIds: ["MR-07"],
    requiresIndex: false,
  },
];

export function listUtilityOverlayKinds(): UtilityOverlayKindInfo[] {
  return [...UTILITY_OVERLAY_CATALOG];
}

export function parseUtilityOverlayKind(
  kind: string,
): UtilityOverlayKind | null {
  const parsed = UtilityOverlayKindSchema.safeParse(kind);
  return parsed.success ? parsed.data : null;
}

function listRepoFiles(root: string, prefix = ""): string[] {
  const out: string[] = [];
  const abs = prefix === "" ? root : join(root, prefix);
  let entries;
  try {
    entries = readdirSync(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      out.push(...listRepoFiles(root, rel));
      continue;
    }
    if (entry.isFile()) out.push(rel);
  }
  return out;
}

function scopeFiles(
  files: readonly string[],
  packageRootDir: string | undefined,
): string[] {
  if (packageRootDir === undefined || packageRootDir === "") return [...files];
  const prefix = `${packageRootDir}/`;
  return files.filter((f) => f === packageRootDir || f.startsWith(prefix));
}

function readText(root: string, rel: string): string {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    return "";
  }
}

function node(
  id: string,
  kind: string,
  label: string,
  attrs?: Record<string, string | number | boolean>,
): GraphNodeDto {
  return {
    id,
    kind,
    label,
    ...(attrs === undefined ? {} : { attrs }),
  };
}

function edge(
  id: string,
  kind: string,
  from: string,
  to: string,
): GraphEdgeDto {
  return { id, kind, from, to };
}

function report(input: {
  kind: UtilityOverlayKind;
  domain: string;
  rootPath: string;
  packageId?: string;
  summary: string;
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  mapLayer: UtilityOverlayReport["mapLayer"];
  findings?: UtilityOverlayFinding[];
}): UtilityOverlayReport {
  const graph: GraphSnapshotDto = {
    id: `overlay:${input.kind}`,
    nodes: input.nodes,
    edges: input.edges,
  };
  return {
    kind: input.kind,
    domain: input.domain,
    rootPath: input.rootPath,
    ...(input.packageId === undefined ? {} : { packageId: input.packageId }),
    generatedAt: new Date().toISOString(),
    summary: input.summary,
    graph,
    mapLayer: {
      ...input.mapLayer,
      nodeKinds: input.mapLayer.nodeKinds ?? [],
    },
    findings: input.findings ?? [],
  };
}

function fileBasename(path: string): string {
  return path.split("/").pop() ?? path;
}

function fileStemLabel(path: string): string {
  return fileBasename(path).replace(/\.[^.]+$/, "");
}

/** Prefer exported symbol / Nest handler name over raw filename. */
function apiSurfaceLabel(path: string, text: string): string {
  const exportClass = /\bexport\s+(?:default\s+)?class\s+(\w+)/.exec(text);
  if (exportClass?.[1]) return exportClass[1];
  const exportFn =
    /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/.exec(text);
  if (exportFn?.[1]) return exportFn[1];
  const exportConst = /\bexport\s+(?:const|let)\s+(\w+)\s*=/.exec(text);
  if (exportConst?.[1]) return exportConst[1];
  const nestMethod =
    /@(?:Get|Post|Put|Patch|Delete|Options|Head|All)\b[\s\S]{0,120}?(?:async\s+)?(\w+)\s*\(/.exec(
      text,
    );
  if (nestMethod?.[1] && nestMethod[1] !== "async") return nestMethod[1];
  return fileStemLabel(path);
}

function scanApiSurface(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  const findings: UtilityOverlayFinding[] = [];

  for (const path of files) {
    const base = fileBasename(path);
    if (
      /(^|\/)openapi\.(ya?ml|json)$/i.test(path) ||
      /(^|\/)swagger\.(ya?ml|json)$/i.test(path)
    ) {
      const id = `api:spec:${path}`;
      nodes.push(node(id, "openapi", base, { path }));
      findings.push({
        id: `finding:${path}`,
        message: "OpenAPI / Swagger spec detected",
        path,
        severity: "info",
      });
    }
    if (path.endsWith(".proto")) {
      nodes.push(node(`api:proto:${path}`, "grpc-proto", base, { path }));
    }
    if (
      /(route|controller|handler|router)\.(ts|js|go|py)$/i.test(base) ||
      /\/routes?\//i.test(path)
    ) {
      const text = readText(root, path);
      nodes.push(
        node(`api:handler:${path}`, "handler", apiSurfaceLabel(path, text), {
          path,
        }),
      );
    }
    if (/\.(ts|js|go)$/i.test(path)) {
      const text = readText(root, path);
      if (
        /\b@(Get|Post|Put|Patch|Delete|Controller)\b/.test(text) ||
        /\b(app|router)\.(get|post|put|patch|delete)\s*\(/i.test(text) ||
        /\bhttp\.(Handle|HandleFunc)\s*\(/.test(text) ||
        /\b(gin|echo|fiber)\./i.test(text)
      ) {
        const id = `api:route-file:${path}`;
        if (!nodes.some((n) => n.id === id)) {
          nodes.push(
            node(id, "route-table", apiSurfaceLabel(path, text), { path }),
          );
        }
      }
    }
  }

  if (nodes.length >= 2) {
    edges.push(edge("api:e0", "related", nodes[0]!.id, nodes[1]!.id));
  }

  return report({
    kind: "api-surface",
    domain: StackDomain.BACKEND,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No API surface markers found"
        : `API surface: ${nodes.length} endpoint/spec node(s)`,
    nodes,
    edges,
    mapLayer: {
      id: "layer:api-surface",
      label: "API surface",
      colorHint: "#3B82F6",
      nodeKinds: ["openapi", "grpc-proto", "handler", "route-table"],
    },
    findings,
  });
}

function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "" : path.slice(0, i);
}

function resolveRelPath(fromDir: string, specifier: string): string {
  const parts = fromDir === "" ? [] : fromDir.split("/").filter(Boolean);
  for (const seg of specifier.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

function resolveMobileImport(
  fromPath: string,
  specifier: string,
  byStem: Map<string, string>,
  byPath: Map<string, string>,
): string | undefined {
  if (!specifier.startsWith(".")) return byStem.get(specifier);
  const joined = resolveRelPath(parentDir(fromPath), specifier);
  const candidates = [
    joined,
    `${joined}.tsx`,
    `${joined}.ts`,
    `${joined}.jsx`,
    `${joined}.js`,
    `${joined}/index.tsx`,
    `${joined}/index.ts`,
  ];
  for (const c of candidates) {
    const id = byPath.get(c);
    if (id) return id;
  }
  const stem = fileStemLabel(joined);
  return byStem.get(stem) ?? byStem.get(specifier.replace(/^\.\.?\//, ""));
}

function scanMobileNav(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  const seen = new Set<string>();
  const byPath = new Map<string, string>();
  const byStem = new Map<string, string>();

  const addNode = (
    id: string,
    kind: string,
    label: string,
    attrs: Record<string, string | number | boolean>,
  ): void => {
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push(node(id, kind, label, attrs));
    const path = String(attrs.path ?? "");
    if (path) {
      byPath.set(path, id);
      byStem.set(fileStemLabel(path), id);
      byStem.set(label, id);
    }
  };

  for (const path of files) {
    const label = fileStemLabel(path);
    const isAppLayout = /(^|\/)app\/.*_layout\.(tsx?|jsx?)$/.test(path);
    const isExpoScreen =
      /(^|\/)app\/(?:\(.*\)\/)?[^/]+\.(tsx?|jsx?)$/.test(path) ||
      /(^|\/)app\/\(.*\)\/.*\.(tsx?|jsx?)$/.test(path);
    if (isAppLayout) {
      addNode(`nav:graph:${path}`, "navigator", label, {
        path,
        router: "expo",
      });
    } else if (
      isExpoScreen &&
      !/\+api\./.test(path) &&
      !path.endsWith(".d.ts")
    ) {
      addNode(`nav:screen:${path}`, "screen", label, {
        path,
        router: "expo",
      });
    }
    if (/navigation\.(tsx?|jsx?)$/i.test(path) || /Navigator\./i.test(path)) {
      addNode(`nav:graph:${path}`, "navigator", label, { path });
    }
    if (/(Screen|screens\/).*\.(tsx?|jsx?)$/i.test(path)) {
      addNode(`nav:screen:${path}`, "screen", label, { path });
    }
    if (
      /(^|\/)hooks?\/use\w+\.(tsx?|jsx?)$/i.test(path) ||
      /(^|\/)use[A-Z]\w+\.(tsx?|jsx?)$/.test(path)
    ) {
      addNode(`nav:hook:${path}`, "hook", label, { path });
    }
    if (
      /(^|\/)(services?|api|modules?)\/.*\.(tsx?|jsx?|ts|js)$/i.test(path) ||
      /\.(service|module)\.(tsx?|jsx?|ts|js)$/i.test(path)
    ) {
      const kind = /module/i.test(path) ? "module" : "service";
      addNode(`nav:${kind}:${path}`, kind, label, { path });
    }
  }

  let edgeIdx = 0;
  const edgeKeys = new Set<string>();
  const addNavEdge = (from: string, to: string): void => {
    if (from === to) return;
    const key = `${from}->${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge(`nav:e${edgeIdx++}`, "navigates", from, to));
  };

  for (const path of files) {
    if (!/\.(tsx?|jsx?)$/i.test(path)) continue;
    const text = readText(root, path);
    if (!text) continue;
    const fromId = byPath.get(path);

    // React Navigation: Stack.Screen name="X" component={Foo}
    const screenTagRe =
      /(?:Stack|Tab|Drawer|NativeStack|MaterialTopTab)\.Screen\s[^>]*?component\s*=\s*\{\s*(\w+)\s*\}/g;
    let m: RegExpExecArray | null;
    while ((m = screenTagRe.exec(text)) !== null) {
      const toId = byStem.get(m[1]!);
      if (fromId && toId) addNavEdge(fromId, toId);
    }

    // createXNavigator route tables: Foo: FooScreen / Foo: { screen: FooScreen }
    if (
      /create(?:Native)?(?:Stack|BottomTab|Drawer|MaterialTopTab)Navigator/i.test(
        text,
      )
    ) {
      const routeRe = /(\w+)\s*:\s*(?:\{\s*screen\s*:\s*)?(\w+Screen|\w+)\b/g;
      while ((m = routeRe.exec(text)) !== null) {
        const toId = byStem.get(m[2]!) ?? byStem.get(m[1]!);
        if (fromId && toId) addNavEdge(fromId, toId);
      }
    }

    // import FooScreen from './Foo' / import { Home } from ...
    const importRe =
      /import\s+(?:(\w+)|\{\s*([^}]+)\s*\})\s+from\s+['"]([^'"]+)['"]/g;
    while ((m = importRe.exec(text)) !== null) {
      const names = [
        m[1],
        ...(m[2] ?? "")
          .split(",")
          .map((s) =>
            s
              .trim()
              .split(/\s+as\s+/)
              .pop()
              ?.trim(),
          )
          .filter(Boolean),
      ].filter((n): n is string => Boolean(n));
      for (const name of names) {
        if (!name.endsWith("Screen") && !byStem.has(name)) continue;
        const toId =
          resolveMobileImport(path, m[3]!, byStem, byPath) ?? byStem.get(name);
        if (
          fromId &&
          toId &&
          nodes.find((n) => n.id === toId)?.kind === "screen"
        ) {
          addNavEdge(fromId, toId);
        }
      }
    }

    // Expo Router: Link href="/x" / router.push('/x')
    const linkRe =
      /(?:href|router\.(?:push|replace|navigate))\s*[=(]\s*['"`]\/?([^'"`]+)['"`]/g;
    while ((m = linkRe.exec(text)) !== null) {
      const route = m[1]!.replace(/^\//, "");
      const candidates = [
        `app/${route}.tsx`,
        `app/${route}.ts`,
        `app/${route}/index.tsx`,
        `app/(tabs)/${route}.tsx`,
      ];
      // Also match any screen whose path ends with the route segment.
      for (const [p, id] of byPath) {
        if (
          candidates.includes(p) ||
          p.endsWith(`/${route}.tsx`) ||
          p.endsWith(`/${route}.ts`) ||
          p.endsWith(`/${route}/index.tsx`)
        ) {
          if (fromId) addNavEdge(fromId, id);
        }
      }
    }
  }

  // Fallback: screens that share a navigator parent folder get navigates edges
  // (not a global sequential discovery-order chain).
  if (edges.length === 0) {
    const screens = nodes.filter((n) => n.kind === "screen");
    const byParent = new Map<string, string[]>();
    for (const s of screens) {
      const p = String(s.attrs?.path ?? "");
      const parent = parentDir(p) || ".";
      const list = byParent.get(parent) ?? [];
      list.push(s.id);
      byParent.set(parent, list);
    }
    for (const ids of byParent.values()) {
      for (let i = 1; i < ids.length; i++) {
        addNavEdge(ids[i - 1]!, ids[i]!);
      }
    }
    // Link navigators to screens under the same directory tree.
    for (const nav of nodes.filter((n) => n.kind === "navigator")) {
      const navPath = String(nav.attrs?.path ?? "");
      const navDir = parentDir(navPath);
      for (const s of screens) {
        const sp = String(s.attrs?.path ?? "");
        if (
          navDir &&
          (sp.startsWith(`${navDir}/`) || parentDir(sp) === navDir)
        ) {
          addNavEdge(nav.id, s.id);
        }
      }
    }
  }

  return report({
    kind: "mobile-nav",
    domain: StackDomain.MOBILE,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No mobile navigation screens detected"
        : `Mobile nav: ${nodes.length} screen/navigator node(s)` +
          (edges.length > 0 ? ` · ${edges.length} navigates` : ""),
    nodes,
    edges,
    mapLayer: {
      id: "layer:mobile-nav",
      label: "Mobile navigation",
      colorHint: "#EC4899",
      nodeKinds: ["screen", "navigator", "hook", "service", "module"],
    },
  });
}

export type DesktopIpcChannel = {
  name: string;
  source:
    | "ipcMain.handle"
    | "ipcMain.on"
    | "ipcRenderer.invoke"
    | "ipcRenderer.send"
    | "contextBridge";
  path: string;
  risk: "low" | "medium";
};

/** Parse Electron IPC channel names from source text. */
export function extractDesktopIpcChannels(
  path: string,
  text: string,
): DesktopIpcChannel[] {
  const out: DesktopIpcChannel[] = [];
  const push = (
    name: string,
    source: DesktopIpcChannel["source"],
    risk: DesktopIpcChannel["risk"],
  ): void => {
    if (!name.trim()) return;
    if (
      out.some((c) => c.name === name && c.source === source && c.path === path)
    )
      return;
    out.push({ name, source, path, risk });
  };

  let m: RegExpExecArray | null;
  const handleRe = /ipcMain\.(handle|handleOnce)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = handleRe.exec(text)) !== null) {
    push(m[2]!, "ipcMain.handle", "low");
  }
  const onRe = /ipcMain\.(on|once)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = onRe.exec(text)) !== null) {
    push(m[2]!, "ipcMain.on", "low");
  }
  const invokeRe = /ipcRenderer\.invoke\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = invokeRe.exec(text)) !== null) {
    push(m[1]!, "ipcRenderer.invoke", "low");
  }
  const sendRe = /ipcRenderer\.(send|sendSync)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = sendRe.exec(text)) !== null) {
    push(m[2]!, "ipcRenderer.send", "low");
  }
  const exposeRe =
    /contextBridge\.exposeInMainWorld\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = exposeRe.exec(text)) !== null) {
    push(m[1]!, "contextBridge", "medium");
  }
  return out;
}

function scanDesktopBoundary(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  const findings: UtilityOverlayFinding[] = [];
  const mainIds: string[] = [];
  const preloadIds: string[] = [];
  const rendererIds: string[] = [];
  const ipcIds: string[] = [];
  const allChannels: DesktopIpcChannel[] = [];

  for (const path of files) {
    if (/(^|\/)(electron\.)?main\.(ts|js|mjs|cjs)$/i.test(path)) {
      const id = `dt:main:${path}`;
      nodes.push(node(id, "main", `${fileBasename(path)} · main`, { path }));
      mainIds.push(id);
    }
    if (/preload\.(ts|js|mjs|cjs)$/i.test(path)) {
      const id = `dt:preload:${path}`;
      nodes.push(
        node(id, "preload", `${fileBasename(path)} · preload`, { path }),
      );
      preloadIds.push(id);
    }
    if (
      /renderer\.(ts|js|tsx|jsx)$/i.test(path) ||
      /(^|\/)src\/renderer\//i.test(path)
    ) {
      const id = `dt:renderer:${path}`;
      if (!nodes.some((n) => n.id === id)) {
        nodes.push(
          node(id, "renderer", `${fileBasename(path)} · renderer`, { path }),
        );
        rendererIds.push(id);
      }
    }
    if (/tauri\.conf\.json$/i.test(path) || /Cargo\.toml$/i.test(path)) {
      nodes.push(
        node(
          `dt:tauri:${path}`,
          "tauri-config",
          `${fileBasename(path)} · tauri`,
          {
            path,
          },
        ),
      );
    }
    const text = /\.(tsx?|jsx?|mjs|cjs)$/i.test(path)
      ? readText(root, path)
      : "";
    const channels = text ? extractDesktopIpcChannels(path, text) : [];
    if (
      channels.length > 0 ||
      /ipcMain|contextBridge|ipcRenderer|invoke\(/i.test(text)
    ) {
      const id = `dt:ipc:${path}`;
      if (!nodes.some((n) => n.id === id)) {
        const channelNames = [...new Set(channels.map((c) => c.name))];
        nodes.push(
          node(id, "ipc", `${fileBasename(path)} · ipc`, {
            path,
            ...(channelNames.length > 0
              ? { channels: channelNames.join(",") }
              : {}),
          }),
        );
        ipcIds.push(id);
      }
      for (const ch of channels) {
        allChannels.push(ch);
        findings.push({
          id: `finding:ipc:${ch.source}:${ch.name}:${path}`,
          message: `IPC ${ch.source}: "${ch.name}"${
            ch.risk === "medium" ? " (preload exposure)" : ""
          }`,
          path,
          severity: ch.risk === "medium" ? "medium" : "info",
        });
      }
    }
  }

  let eIdx = 0;
  for (const mainId of mainIds) {
    for (const preloadId of preloadIds) {
      edges.push(edge(`dt:e${eIdx++}`, "ipc", mainId, preloadId));
    }
    for (const rendererId of rendererIds) {
      if (preloadIds.length === 0) {
        edges.push(edge(`dt:e${eIdx++}`, "loads", mainId, rendererId));
      }
    }
    for (const ipcId of ipcIds) {
      if (ipcId !== mainId) {
        edges.push(edge(`dt:e${eIdx++}`, "ipc", mainId, ipcId));
      }
    }
  }
  for (const preloadId of preloadIds) {
    for (const rendererId of rendererIds) {
      edges.push(edge(`dt:e${eIdx++}`, "exposes", preloadId, rendererId));
    }
  }

  const channelSummary =
    allChannels.length > 0 ? ` · ${allChannels.length} IPC channel(s)` : "";

  return report({
    kind: "desktop-boundary",
    domain: StackDomain.DESKTOP,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No desktop main/renderer/IPC markers found"
        : `Desktop boundary: ${nodes.length} process/surface node(s)${channelSummary}`,
    nodes,
    edges,
    mapLayer: {
      id: "layer:desktop-boundary",
      label: "Desktop process boundary",
      colorHint: "#8B5CF6",
      nodeKinds: ["main", "preload", "renderer", "ipc", "tauri-config"],
    },
    findings,
  });
}

function scanNotebooks(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  const notebooks = files.filter((f) => f.endsWith(".ipynb"));
  const modules = files.filter(
    (f) =>
      f.endsWith(".py") &&
      !f.includes("__pycache__") &&
      !/(^|\/)tests?\//.test(f),
  );
  for (const nb of notebooks) {
    nodes.push(node(`nb:${nb}`, "notebook", nb, { path: nb }));
  }
  for (const mod of modules) {
    nodes.push(node(`mod:${mod}`, "module", mod, { path: mod }));
  }
  for (const nb of notebooks) {
    const text = readText(root, nb);
    for (const mod of modules) {
      const stem = (mod.split("/").pop() ?? "").replace(/\.py$/, "");
      if (stem && text.includes(stem)) {
        edges.push(
          edge(`nb-mod:${nb}:${mod}`, "imports", `nb:${nb}`, `mod:${mod}`),
        );
      }
    }
  }
  return report({
    kind: "notebook-modules",
    domain: StackDomain.DATA_ML_AI,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary: `Notebooks: ${notebooks.length}; modules: ${modules.length}; links: ${edges.length}`,
    nodes,
    edges,
    mapLayer: {
      id: "layer:notebook-modules",
      label: "Notebook ↔ modules",
      colorHint: "#F59E0B",
      nodeKinds: ["notebook", "module"],
    },
  });
}

function scanDataPipeline(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  for (const path of files) {
    if (/(^|\/)dags?\//i.test(path) || /airflow/i.test(path)) {
      nodes.push(node(`dag:${path}`, "airflow-dag", path, { path }));
    }
    if (
      /(^|\/)models\/.*\.sql$/i.test(path) ||
      /dbt_project\.ya?ml$/i.test(path)
    ) {
      nodes.push(node(`dbt:${path}`, "dbt-model", path, { path }));
    }
    if (/spark|pyspark/i.test(path) || path.endsWith(".scala")) {
      nodes.push(node(`spark:${path}`, "spark-job", path, { path }));
    }
  }
  for (let i = 1; i < Math.min(nodes.length, 8); i++) {
    edges.push(
      edge(`pipe:e${i}`, "depends-on", nodes[i - 1]!.id, nodes[i]!.id),
    );
  }
  return report({
    kind: "data-pipeline-dag",
    domain: StackDomain.DATA_ENGINEERING,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No pipeline/DAG markers found"
        : `Pipeline DAG: ${nodes.length} job/model node(s)`,
    nodes,
    edges,
    mapLayer: {
      id: "layer:data-pipeline-dag",
      label: "Data pipelines",
      colorHint: "#0EA5E9",
      nodeKinds: ["airflow-dag", "dbt-model", "spark-job"],
    },
  });
}

type CiDispatchInput = {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
};

type CiWorkflow = {
  path: string;
  name: string;
  events: string[];
  jobs: string[];
  /** Manual/API dispatchers present on `on:` (e.g. workflow_dispatch). */
  dispatchers: string[];
  /** `workflow_dispatch.inputs` — drives the Trigger form UI. */
  inputs: CiDispatchInput[];
  /** `repository_dispatch.types` when declared. */
  dispatchTypes: string[];
  /** Top-level `concurrency:` present (overlap guard). */
  hasConcurrency: boolean;
  /** Top-level `permissions:` present (token scope). */
  hasPermissions: boolean;
};

/** Best-effort `owner/repo` from package.json repository or `.git/config`. */
function detectRepoSlug(root: string): string | undefined {
  try {
    const raw = readText(root, "package.json");
    if (raw) {
      const pkg = JSON.parse(raw) as {
        name?: unknown;
        repository?: unknown;
      };
      const repoField = pkg.repository;
      const url =
        typeof repoField === "string"
          ? repoField
          : repoField &&
              typeof repoField === "object" &&
              typeof (repoField as { url?: unknown }).url === "string"
            ? (repoField as { url: string }).url
            : undefined;
      if (url) {
        const m =
          /github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?(?:[/?#]|$)/i.exec(url);
        if (m?.[1]) return m[1].replace(/\.git$/i, "");
      }
      if (typeof pkg.name === "string" && pkg.name.trim() !== "") {
        return pkg.name.replace(/^@/, "");
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const cfg = readFileSync(join(root, ".git", "config"), "utf8");
    const m = /url\s*=\s*.*github\.com[/:]([^/\s]+\/[^/\s]+)/i.exec(cfg);
    if (m?.[1]) return m[1].replace(/\.git$/i, "");
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Capture immediate child keys of a `parent:` block (standard indented YAML). */
function childKeys(lines: readonly string[], startIndex: number): string[] {
  const keys: string[] = [];
  let childIndent = -1;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const keyMatch = /^([ \t]*)([A-Za-z_][\w-]*):/.exec(line);
    if (keyMatch === null) {
      // A non-key line at column 0 ends the block; deeper lines are children.
      if (/^\S/.test(line)) break;
      continue;
    }
    const indent = keyMatch[1]!.length;
    if (indent === 0) break;
    if (childIndent === -1) childIndent = indent;
    if (indent === childIndent) keys.push(keyMatch[2]!);
  }
  return keys;
}

/** Line index of an immediate child key under a parent block, or -1. */
function findChildKey(
  lines: readonly string[],
  parentIndex: number,
  key: string,
): number {
  let childIndent = -1;
  for (let i = parentIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const keyMatch = /^([ \t]*)([A-Za-z_][\w-]*):/.exec(line);
    if (keyMatch === null) {
      if (/^\S/.test(line)) break;
      continue;
    }
    const indent = keyMatch[1]!.length;
    if (indent === 0) break;
    if (childIndent === -1) childIndent = indent;
    if (indent < childIndent) break;
    if (indent === childIndent && keyMatch[2] === key) return i;
  }
  return -1;
}

function scalarAfter(line: string, key: string): string | undefined {
  const re = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`);
  const m = re.exec(line);
  if (m === null) return undefined;
  return m[1]!.replace(/^['"]|['"]$/g, "").trim();
}

/** Parse `workflow_dispatch.inputs` children into a typed list. */
function parseDispatchInputs(
  lines: readonly string[],
  inputsIndex: number,
): CiDispatchInput[] {
  const names = childKeys(lines, inputsIndex);
  return names.map((name) => {
    const idx = findChildKey(lines, inputsIndex, name);
    let type = "string";
    let required = false;
    let description: string | undefined;
    let def: string | undefined;
    if (idx !== -1) {
      // Scan immediate field lines under this input.
      let fieldIndent = -1;
      for (let i = idx + 1; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("#")) continue;
        const keyMatch = /^([ \t]*)([A-Za-z_][\w-]*):/.exec(line);
        if (keyMatch === null) {
          if (/^\S/.test(line)) break;
          continue;
        }
        const indent = keyMatch[1]!.length;
        if (fieldIndent === -1) fieldIndent = indent;
        if (indent < fieldIndent) break;
        if (indent !== fieldIndent) continue;
        const field = keyMatch[2]!;
        if (field === "type") type = scalarAfter(line, "type") ?? type;
        else if (field === "required") required = /:\s*true\b/i.test(line);
        else if (field === "description")
          description = scalarAfter(line, "description");
        else if (field === "default") def = scalarAfter(line, "default");
      }
    }
    return {
      name,
      type,
      required,
      ...(description === undefined ? {} : { description }),
      ...(def === undefined ? {} : { default: def }),
    };
  });
}

/**
 * Best-effort GitHub Actions workflow reader. Local-only, no network. Extracts
 * the display name, trigger events, job ids, and manual dispatchers
 * (`workflow_dispatch` / `repository_dispatch` + inputs) from
 * `.github/workflows/*.yml`. Never fabricates run status — that needs the
 * GitHub API behind Integrations (ADR-0016).
 */
function scanCiWorkflows(root: string): CiWorkflow[] {
  const dir = ".github/workflows";
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: CiWorkflow[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
    const rel = `${dir}/${entry.name}`;
    const text = readText(root, rel);
    const lines = text.split(/\r?\n/);

    const nameMatch = /^name:[ \t]*(.+?)[ \t]*$/m.exec(text);
    const name =
      nameMatch?.[1]?.replace(/^['"]|['"]$/g, "").trim() ||
      entry.name.replace(/\.ya?ml$/i, "");

    let events: string[] = [];
    const onIndex = lines.findIndex((l) => l.startsWith("on:"));
    if (onIndex !== -1) {
      const inline = lines[onIndex]!.slice(3).trim();
      events =
        inline !== ""
          ? inline
              .replace(/^\[|\]$/g, "")
              .split(",")
              .map((s) => s.replace(/['"]/g, "").trim())
              .filter(Boolean)
          : childKeys(lines, onIndex);
    }

    const jobsIndex = lines.findIndex((l) => l.startsWith("jobs:"));
    const jobs = jobsIndex === -1 ? [] : childKeys(lines, jobsIndex);

    const dispatchers = events.filter(
      (e) => e === "workflow_dispatch" || e === "repository_dispatch",
    );
    let inputs: CiDispatchInput[] = [];
    let dispatchTypes: string[] = [];
    if (onIndex !== -1 && dispatchers.includes("workflow_dispatch")) {
      const wdIdx = findChildKey(lines, onIndex, "workflow_dispatch");
      if (wdIdx !== -1) {
        const inputsIdx = findChildKey(lines, wdIdx, "inputs");
        if (inputsIdx !== -1) inputs = parseDispatchInputs(lines, inputsIdx);
      }
    }
    if (onIndex !== -1 && dispatchers.includes("repository_dispatch")) {
      const rdIdx = findChildKey(lines, onIndex, "repository_dispatch");
      if (rdIdx !== -1) {
        const typesIdx = findChildKey(lines, rdIdx, "types");
        if (typesIdx !== -1) {
          const inline = lines[typesIdx]!.replace(/^[^:]+:\s*/, "").trim();
          if (inline.startsWith("[")) {
            dispatchTypes = inline
              .replace(/^\[|\]$/g, "")
              .split(",")
              .map((s) => s.replace(/['"]/g, "").trim())
              .filter(Boolean);
          } else {
            // Block list: `- deploy`
            for (let i = typesIdx + 1; i < lines.length; i++) {
              const m = /^[ \t]*-\s*['"]?([^'"#\n]+?)['"]?\s*(?:#.*)?$/.exec(
                lines[i] ?? "",
              );
              if (m === null) {
                if (
                  /^\S/.test(lines[i] ?? "") ||
                  /^[ \t]*[A-Za-z_]/.test(lines[i] ?? "")
                )
                  break;
                continue;
              }
              dispatchTypes.push(m[1]!.trim());
            }
          }
        }
      }
    }

    const hasConcurrency = /^concurrency\s*:/m.test(text);
    const hasPermissions = /^permissions\s*:/m.test(text);

    out.push({
      path: rel,
      name,
      events,
      jobs,
      dispatchers,
      inputs,
      dispatchTypes,
      hasConcurrency,
      hasPermissions,
    });
  }
  return out;
}

function scanIac(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  const findings: UtilityOverlayFinding[] = [];
  const dockerfiles: string[] = [];
  for (const path of files) {
    if (path.endsWith(".tf") || path.endsWith(".tf.json")) {
      nodes.push(node(`iac:tf:${path}`, "terraform", path, { path }));
    }
    if (
      /(^|\/)charts?\//i.test(path) ||
      /Chart\.ya?ml$/i.test(path) ||
      /values\.ya?ml$/i.test(path)
    ) {
      nodes.push(node(`iac:helm:${path}`, "helm", path, { path }));
    }
    if (
      /deployment|service|ingress|kustomization/i.test(path) &&
      /\.ya?ml$/i.test(path)
    ) {
      nodes.push(node(`iac:k8s:${path}`, "kubernetes", path, { path }));
    }
    if (/Dockerfile$/i.test(path) || /compose\.ya?ml$/i.test(path)) {
      nodes.push(node(`iac:container:${path}`, "container", path, { path }));
      if (/Dockerfile$/i.test(path)) dockerfiles.push(path);
    }
  }

  const repoSlug = detectRepoSlug(root);

  // CI/CD pipelines — GitHub Actions today (repo-level only). Runners like Argo
  // and Jenkins arrive via the Integrations tab (see ADR-0016).
  if (packageId === undefined) {
    for (const wf of scanCiWorkflows(root)) {
      nodes.push(
        node(`iac:ci:${wf.path}`, "ci", wf.name, {
          path: wf.path,
          provider: "github-actions",
          source: "github",
          ...(repoSlug !== undefined ? { repo: repoSlug } : {}),
          ...(wf.events.length > 0 ? { events: wf.events.join(", ") } : {}),
          ...(wf.jobs.length > 0
            ? { jobs: wf.jobs.join(", "), jobCount: wf.jobs.length }
            : {}),
          ...(wf.dispatchers.length > 0
            ? {
                dispatchers: wf.dispatchers.join(", "),
                canTrigger: true,
              }
            : { canTrigger: false }),
          ...(wf.inputs.length > 0
            ? { inputs: JSON.stringify(wf.inputs) }
            : {}),
          ...(wf.dispatchTypes.length > 0
            ? { dispatchTypes: wf.dispatchTypes.join(", ") }
            : {}),
          hasConcurrency: wf.hasConcurrency,
          hasPermissions: wf.hasPermissions,
        }),
      );
      if (!wf.hasConcurrency && findings.length < 3) {
        findings.push({
          id: `ci:concurrency:${wf.path}`,
          message: `Workflow "${wf.name}" has no concurrency group — parallel runs may overlap`,
          path: wf.path,
          severity: "low",
        });
      }
      if (!wf.hasPermissions && findings.length < 3) {
        findings.push({
          id: `ci:permissions:${wf.path}`,
          message: `Workflow "${wf.name}" lacks top-level permissions — GITHUB_TOKEN may be overly broad`,
          path: wf.path,
          severity: "medium",
        });
      }
    }
  }

  for (const path of dockerfiles) {
    if (findings.length >= 3) break;
    const text = readText(root, path);
    if (text && !/HEALTHCHECK\b/i.test(text)) {
      findings.push({
        id: `container:healthcheck:${path}`,
        message: "Dockerfile has no HEALTHCHECK instruction",
        path,
        severity: "low",
      });
    }
  }

  if (nodes.length >= 2) {
    edges.push(edge("iac:e0", "related", nodes[0]!.id, nodes[1]!.id));
  }
  const ciCount = nodes.filter((n) => n.kind === "ci").length;
  return report({
    kind: "iac-resources",
    domain: StackDomain.DEVOPS_PLATFORM,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No IaC markers found"
        : `IaC map: ${nodes.length} resource/config node(s)${
            ciCount > 0 ? `, ${ciCount} pipeline(s)` : ""
          }`,
    nodes,
    edges,
    mapLayer: {
      id: "layer:iac-resources",
      label: "Infrastructure as code",
      colorHint: "#64748B",
      nodeKinds: ["terraform", "helm", "kubernetes", "container", "ci"],
    },
    findings,
  });
}

function scanEmbedded(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  for (const path of files) {
    if (
      /\.(c|h|cpp|hpp|s|lds)$/i.test(path) ||
      /(^|\/)firmware\//i.test(path)
    ) {
      nodes.push(node(`em:fw:${path}`, "firmware", path, { path }));
    }
    if (
      /(^|\/)host\//i.test(path) ||
      /(^|\/)tools\//i.test(path) ||
      /\.(py|ts|go)$/i.test(path)
    ) {
      if (/(test|host|tool)/i.test(path)) {
        nodes.push(node(`em:host:${path}`, "host", path, { path }));
      }
    }
  }
  return report({
    kind: "embedded-regions",
    domain: StackDomain.EMBEDDED_SYSTEMS,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No embedded firmware/host regions detected"
        : `Embedded regions: ${nodes.length} node(s)`,
    nodes,
    edges: [],
    mapLayer: {
      id: "layer:embedded-regions",
      label: "Firmware vs host",
      colorHint: "#78716C",
      nodeKinds: ["firmware", "host"],
    },
  });
}

function scanGame(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  for (const path of files) {
    if (
      /(^|\/)(assets|content|art|audio|maps)\//i.test(path) ||
      /\.(unity|prefab|fbx|png|wav|ogg)$/i.test(path)
    ) {
      nodes.push(node(`gm:content:${path}`, "content", path, { path }));
    }
    if (
      /(^|\/)(scripts|src|code)\//i.test(path) &&
      /\.(cs|ts|js|gd|cpp)$/i.test(path)
    ) {
      nodes.push(node(`gm:code:${path}`, "code", path, { path }));
    }
  }
  return report({
    kind: "game-regions",
    domain: StackDomain.GAME,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No game content/code regions detected"
        : `Game regions: ${nodes.length} node(s)`,
    nodes,
    edges: [],
    mapLayer: {
      id: "layer:game-regions",
      label: "Content vs code",
      colorHint: "#22C55E",
      nodeKinds: ["content", "code"],
    },
  });
}

function scanQa(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const findings: UtilityOverlayFinding[] = [];
  for (const path of files) {
    if (
      /(^|\/)(e2e|__tests__|tests?)\//i.test(path) ||
      /\.(test|spec)\.(ts|tsx|js|jsx|py|go)$/i.test(path)
    ) {
      nodes.push(node(`qa:test:${path}`, "test", path, { path }));
    }
    if (/playwright|cypress|detox|maestro/i.test(path)) {
      nodes.push(node(`qa:e2e:${path}`, "e2e", path, { path }));
    }
  }
  const pkgJson = files.filter((f) => f.endsWith("package.json"));
  for (const path of pkgJson) {
    const text = readText(root, path);
    if (/"name"\s*:\s*"[^"]*(test|e2e|qa)[^"]*"/i.test(text)) {
      findings.push({
        id: `qa-pkg:${path}`,
        message: "Test-oriented package name",
        path,
        severity: "info",
      });
      nodes.push(node(`qa:pkg:${path}`, "test-package", path, { path }));
    }
  }
  return report({
    kind: "qa-test-gaps",
    domain: "qa",
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No test/e2e markers found (possible coverage gap)"
        : `QA surface: ${nodes.length} test/e2e node(s)`,
    nodes,
    edges: [],
    mapLayer: {
      id: "layer:qa-test-gaps",
      label: "Tests & e2e",
      colorHint: "#14B8A6",
      nodeKinds: ["test", "e2e", "test-package"],
    },
    findings:
      nodes.length === 0
        ? [
            {
              id: "qa:gap",
              message: "No test markers in scope — possible test gap",
              severity: "medium",
            },
          ]
        : findings,
  });
}

function scanSecurity(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const findings: UtilityOverlayFinding[] = [];
  for (const path of files) {
    if (
      /(auth|oauth|jwt|crypto|password|secret)/i.test(path) ||
      /(^|\/)security\//i.test(path)
    ) {
      nodes.push(node(`sec:code:${path}`, "auth-crypto", path, { path }));
    }
    if (
      /(^|\/)\.github\/workflows\//.test(path) ||
      /opa|rego|policy-as-code|snyk|trivy|gitleaks/i.test(path)
    ) {
      nodes.push(node(`sec:policy:${path}`, "policy", path, { path }));
    }
    if (/\.env(\.|$)/i.test(path) || /secrets?\.(ya?ml|json)$/i.test(path)) {
      findings.push({
        id: `sec:secret-path:${path}`,
        message: "Secret/config path — treat as caution surface",
        path,
        severity: "high",
      });
      nodes.push(node(`sec:secret:${path}`, "secret-path", path, { path }));
    }
  }
  return report({
    kind: "security-surface",
    domain: "security",
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No auth/crypto/policy markers found"
        : `Security surface: ${nodes.length} node(s)`,
    nodes,
    edges: [],
    mapLayer: {
      id: "layer:security-surface",
      label: "Auth / crypto / policy",
      colorHint: "#EF4444",
      nodeKinds: ["auth-crypto", "policy", "secret-path"],
    },
    findings,
  });
}

function scanDomainRegions(
  root: string,
  stack: StackProfile | undefined,
  packageId?: string,
): UtilityOverlayReport {
  const packages = stack?.packages ?? [];
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  const domainColor: Record<string, string> = {
    [StackDomain.FRONTEND]: "#3B82F6",
    [StackDomain.BACKEND]: "#2563EB",
    [StackDomain.MOBILE]: "#EC4899",
    [StackDomain.DESKTOP]: "#8B5CF6",
    [StackDomain.DATA_ML_AI]: "#F59E0B",
    [StackDomain.DATA_ENGINEERING]: "#0EA5E9",
    [StackDomain.DEVOPS_PLATFORM]: "#64748B",
    [StackDomain.TOOLING]: "#94A3B8",
    [StackDomain.EMBEDDED_SYSTEMS]: "#78716C",
    [StackDomain.GAME]: "#22C55E",
    qa: "#14B8A6",
    security: "#EF4444",
  };

  if (packages.length === 0) {
    for (const domain of stack?.domains ?? []) {
      nodes.push(
        node(`region:${domain}`, "domain-region", domain, {
          domain,
          colorHint: domainColor[domain] ?? "#94A3B8",
        }),
      );
    }
  } else {
    for (const pkg of packages) {
      const primary = pkg.profile.domains[0] ?? StackDomain.TOOLING;
      nodes.push(
        node(`region:${pkg.id}`, "domain-region", pkg.name ?? pkg.id, {
          domain: primary,
          packageId: pkg.id,
          rootDir: pkg.rootDir,
          colorHint: domainColor[primary] ?? "#94A3B8",
        }),
      );
    }
    const ws = node("region:workspace", "workspace", "workspace", {
      domain: StackDomain.TOOLING,
    });
    nodes.unshift(ws);
    for (const pkg of packages) {
      edges.push(
        edge(`region:e:${pkg.id}`, "contains", ws.id, `region:${pkg.id}`),
      );
    }
  }

  return report({
    kind: "domain-regions",
    domain: StackDomain.TOOLING,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary: `Domain regions: ${nodes.filter((n) => n.kind === "domain-region").length}`,
    nodes,
    edges,
    mapLayer: {
      id: "layer:domain-regions",
      label: "Domain regions",
      colorHint: "#94A3B8",
      nodeKinds: ["domain-region", "workspace"],
    },
  });
}

function scanCrossPackageImpact(
  root: string,
  index: IndexSnapshot,
  stack: StackProfile | undefined,
  packageId?: string,
): UtilityOverlayReport {
  const packages = discoverLocalPackages(
    root,
    index.files.map((f) => f.path),
  );
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  const findings: UtilityOverlayFinding[] = [];

  for (const pkg of packages) {
    nodes.push(
      node(`xp:${pkg.name}`, "package", pkg.name, {
        rootDir: pkg.rootDir,
      }),
    );
  }

  const byRoot = [...packages].sort(
    (a, b) => b.rootDir.length - a.rootDir.length,
  );
  const pkgOf = (filePath: string): string | null => {
    for (const pkg of byRoot) {
      if (pkg.rootDir === "") continue;
      if (filePath === pkg.rootDir || filePath.startsWith(`${pkg.rootDir}/`)) {
        return pkg.name;
      }
    }
    const rootPkg = byRoot.find((p) => p.rootDir === "");
    return rootPkg?.name ?? null;
  };

  const seen = new Set<string>();
  for (const file of index.files) {
    const fromPkg = pkgOf(file.path);
    if (!fromPkg) continue;
    for (const imp of file.imports) {
      if (!imp.source.startsWith(".") && !imp.source.startsWith("/")) continue;
      // Local relative — resolve coarsely via indexed path heuristics
      const candidates = index.files.map((f) => f.path);
      const target = candidates.find((p) => {
        const base = imp.source.replace(/^\.\//, "").replace(/^\.\.\//, "");
        return p.includes(base.replace(/\.(js|ts|tsx|jsx)$/, ""));
      });
      if (!target) continue;
      const toPkg = pkgOf(target);
      if (!toPkg || toPkg === fromPkg) continue;
      const eid = `xp:${fromPkg}->${toPkg}`;
      if (seen.has(eid)) continue;
      seen.add(eid);
      edges.push(edge(eid, "depends-on", `xp:${fromPkg}`, `xp:${toPkg}`));
    }
  }

  // Prefer stack package ids when available
  if (stack?.packages?.length) {
    for (const pkg of stack.packages as StackPackageProfile[]) {
      if (!nodes.some((n) => n.label === pkg.id || n.id === `xp:${pkg.id}`)) {
        nodes.push(
          node(`xp:${pkg.id}`, "package", pkg.name ?? pkg.id, {
            rootDir: pkg.rootDir,
          }),
        );
      }
    }
  }

  if (packageId) {
    findings.push({
      id: "xp:scope",
      message: `Scoped view hint for package ${packageId} (defaults show workspace edges)`,
      severity: "info",
    });
  }

  return report({
    kind: "cross-package-impact",
    domain: StackDomain.TOOLING,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary: `Cross-package defaults: ${nodes.length} package(s), ${edges.length} edge(s)`,
    nodes,
    edges,
    mapLayer: {
      id: "layer:cross-package-impact",
      label: "Cross-package impact",
      colorHint: "#A855F7",
      nodeKinds: ["package"],
    },
    findings,
  });
}

/**
 * Build a domain utility overlay for Map / MCP (M-041 P2–P7 + Mono-v2).
 */
export function buildUtilityOverlay(
  input: BuildUtilityOverlayInput,
): UtilityOverlayReport {
  const root = input.workspaceRoot;
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return report({
      kind: input.kind,
      domain: StackDomain.TOOLING,
      rootPath: root,
      ...(input.packageId === undefined ? {} : { packageId: input.packageId }),
      summary: "Workspace root not found",
      nodes: [],
      edges: [],
      mapLayer: {
        id: `layer:${input.kind}`,
        label: input.kind,
        nodeKinds: [],
      },
      findings: [
        {
          id: "missing-root",
          message: "Workspace root does not exist",
          severity: "high",
        },
      ],
    });
  }

  const allFiles = listRepoFiles(root);
  const files = scopeFiles(allFiles, input.packageRootDir);
  const packageId = input.packageId;

  switch (input.kind) {
    case "api-surface":
      return scanApiSurface(root, files, packageId);
    case "mobile-nav":
      return scanMobileNav(root, files, packageId);
    case "desktop-boundary":
      return scanDesktopBoundary(root, files, packageId);
    case "notebook-modules":
      return scanNotebooks(root, files, packageId);
    case "data-pipeline-dag":
      return scanDataPipeline(root, files, packageId);
    case "iac-resources":
      return scanIac(root, files, packageId);
    case "embedded-regions":
      return scanEmbedded(root, files, packageId);
    case "game-regions":
      return scanGame(root, files, packageId);
    case "qa-test-gaps":
      return scanQa(root, files, packageId);
    case "security-surface":
      return scanSecurity(root, files, packageId);
    case "domain-regions":
      return scanDomainRegions(root, input.stack, packageId);
    case "cross-package-impact": {
      if (!input.index) {
        return report({
          kind: "cross-package-impact",
          domain: StackDomain.TOOLING,
          rootPath: root,
          ...(packageId === undefined ? {} : { packageId }),
          summary: "Index required for cross-package impact",
          nodes: [],
          edges: [],
          mapLayer: {
            id: "layer:cross-package-impact",
            label: "Cross-package impact",
            nodeKinds: ["package"],
          },
          findings: [
            {
              id: "index-required",
              message: "Call workspace.index() before cross-package-impact",
              severity: "high",
            },
          ],
        });
      }
      return scanCrossPackageImpact(root, input.index, input.stack, packageId);
    }
    default: {
      throw new Error(`Unhandled utility overlay kind: ${String(input.kind)}`);
    }
  }
}
