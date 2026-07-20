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

function scanApiSurface(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  const findings: UtilityOverlayFinding[] = [];

  for (const path of files) {
    const base = path.split("/").pop() ?? path;
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
      nodes.push(node(`api:handler:${path}`, "handler", base, { path }));
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
          nodes.push(node(id, "route-table", base, { path }));
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

function scanMobileNav(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  for (const path of files) {
    if (
      /(^|\/)app\/_layout\.(tsx?|jsx?)$/.test(path) ||
      /(^|\/)app\/\(.*\)\/.*\.(tsx?|jsx?)$/.test(path) ||
      /(^|\/)app\/[^/]+\.(tsx?|jsx?)$/.test(path)
    ) {
      nodes.push(
        node(`nav:screen:${path}`, "screen", path, { path, router: "expo" }),
      );
    }
    if (/navigation\.(tsx?|jsx?)$/i.test(path) || /Navigator\./i.test(path)) {
      nodes.push(node(`nav:graph:${path}`, "navigator", path, { path }));
    }
    if (/(Screen|screens\/).*\.(tsx?|jsx?)$/i.test(path)) {
      nodes.push(node(`nav:screen:${path}`, "screen", path, { path }));
    }
  }
  for (let i = 1; i < nodes.length; i++) {
    edges.push(edge(`nav:e${i}`, "navigates", nodes[i - 1]!.id, nodes[i]!.id));
  }
  return report({
    kind: "mobile-nav",
    domain: StackDomain.MOBILE,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No mobile navigation screens detected"
        : `Mobile nav: ${nodes.length} screen/navigator node(s)`,
    nodes,
    edges,
    mapLayer: {
      id: "layer:mobile-nav",
      label: "Mobile navigation",
      colorHint: "#EC4899",
      nodeKinds: ["screen", "navigator"],
    },
  });
}

function scanDesktopBoundary(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
  let mainId: string | undefined;
  let preloadId: string | undefined;
  let rendererId: string | undefined;
  for (const path of files) {
    if (/(^|\/)(electron\.)?main\.(ts|js|mjs|cjs)$/i.test(path)) {
      mainId = `dt:main:${path}`;
      nodes.push(node(mainId, "main", path, { path }));
    }
    if (/preload\.(ts|js|mjs|cjs)$/i.test(path)) {
      preloadId = `dt:preload:${path}`;
      nodes.push(node(preloadId, "preload", path, { path }));
    }
    if (
      /renderer\.(ts|js|tsx|jsx)$/i.test(path) ||
      /(^|\/)src\/renderer\//i.test(path)
    ) {
      rendererId = `dt:renderer:${path}`;
      nodes.push(node(rendererId, "renderer", path, { path }));
    }
    if (/tauri\.conf\.json$/i.test(path) || /Cargo\.toml$/i.test(path)) {
      nodes.push(node(`dt:tauri:${path}`, "tauri-config", path, { path }));
    }
    const text =
      path.endsWith(".ts") || path.endsWith(".js") ? readText(root, path) : "";
    if (/ipcMain|contextBridge|invoke\(/i.test(text)) {
      const id = `dt:ipc:${path}`;
      if (!nodes.some((n) => n.id === id)) {
        nodes.push(node(id, "ipc", path, { path }));
      }
    }
  }
  if (mainId && preloadId) {
    edges.push(edge("dt:e-main-preload", "ipc", mainId, preloadId));
  }
  if (preloadId && rendererId) {
    edges.push(edge("dt:e-preload-renderer", "exposes", preloadId, rendererId));
  } else if (mainId && rendererId) {
    edges.push(edge("dt:e-main-renderer", "loads", mainId, rendererId));
  }
  return report({
    kind: "desktop-boundary",
    domain: StackDomain.DESKTOP,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No desktop main/renderer/IPC markers found"
        : `Desktop boundary: ${nodes.length} process/surface node(s)`,
    nodes,
    edges,
    mapLayer: {
      id: "layer:desktop-boundary",
      label: "Desktop process boundary",
      colorHint: "#8B5CF6",
      nodeKinds: ["main", "preload", "renderer", "ipc", "tauri-config"],
    },
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

function scanIac(
  root: string,
  files: readonly string[],
  packageId?: string,
): UtilityOverlayReport {
  const nodes: GraphNodeDto[] = [];
  const edges: GraphEdgeDto[] = [];
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
    }
  }
  if (nodes.length >= 2) {
    edges.push(edge("iac:e0", "related", nodes[0]!.id, nodes[1]!.id));
  }
  return report({
    kind: "iac-resources",
    domain: StackDomain.DEVOPS_PLATFORM,
    rootPath: root,
    ...(packageId === undefined ? {} : { packageId }),
    summary:
      nodes.length === 0
        ? "No IaC markers found"
        : `IaC map: ${nodes.length} resource/config node(s)`,
    nodes,
    edges,
    mapLayer: {
      id: "layer:iac-resources",
      label: "Infrastructure as code",
      colorHint: "#64748B",
      nodeKinds: ["terraform", "helm", "kubernetes", "container"],
    },
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
