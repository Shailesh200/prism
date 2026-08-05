import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  BackendAuthExposure,
  BackendBackgroundJob,
  BackendDataLayerItem,
  BackendEndpoint,
  BackendEnvVar,
  BackendFramework,
  BackendIntegration,
  BackendReport,
  IndexSnapshot,
} from "@repo-prism/shared";

export type BuildBackendReportInput = {
  workspaceRoot: string;
  packageId?: string;
  packageRootDir?: string;
  /** Optional index for import-based test linkage. */
  index?: IndexSnapshot;
};

type RawRoute = {
  method: string;
  path: string;
  handlerFile: string;
  handlerName?: string;
  framework: BackendFramework;
  auth: BackendAuthExposure;
  confidence: number;
  evidence: string[];
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".prism",
]);

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "all",
] as const;

const AUTH_HINT =
  /\b(auth|authenticate|requireAuth|isAuthenticated|passport|jwt|bearer|guard|UseGuards|AuthGuard|@Public\b|@Roles?\b)/i;

const PUBLIC_HINT = /\b(@Public\b|allowAnonymous|noAuth|skipAuth)\b/i;

/**
 * Build a typed BackendReport (M-044 / ADR-0015). Static heuristics over local
 * files; optional index improves test linkage.
 */
export function buildBackendReport(
  input: BuildBackendReportInput,
): BackendReport {
  const files = scopeFiles(
    listRepoFiles(input.workspaceRoot),
    input.packageRootDir,
  );
  const routes: RawRoute[] = [];
  const frameworks = new Set<BackendFramework>();

  for (const path of files) {
    if (!/\.(tsx?|jsx?|mjs|cjs)$/i.test(path)) continue;
    const text = readText(input.workspaceRoot, path);
    if (!text) continue;
    for (const r of extractNest(path, text)) {
      routes.push(r);
      frameworks.add(r.framework);
    }
    for (const r of extractExpressLike(path, text, "express")) {
      routes.push(r);
      frameworks.add(r.framework);
    }
    for (const r of extractExpressLike(path, text, "fastify")) {
      routes.push(r);
      frameworks.add(r.framework);
    }
  }

  const dataLayer = scanDataLayer(input.workspaceRoot, files);
  const dataPaths = new Set(dataLayer.map((d) => d.path));
  const envVars = scanEnvVars(input.workspaceRoot, files);
  const integrations = scanIntegrations(input.workspaceRoot, files);
  const background = scanBackground(input.workspaceRoot, files);

  const testMap = linkTests(routes, files, input.index);
  const endpoints: BackendEndpoint[] = routes.map((r, i) => {
    const tests = testMap.get(routeKey(r)) ?? [];
    const touchesData =
      dataPaths.has(r.handlerFile) ||
      fileMentionsData(input.workspaceRoot, r.handlerFile, dataPaths);
    return {
      id: `ep:${r.framework}:${r.method}:${r.path}:${i}`,
      method: r.method,
      path: r.path,
      handlerFile: r.handlerFile,
      ...(r.handlerName !== undefined ? { handlerName: r.handlerName } : {}),
      framework: r.framework,
      auth: r.auth,
      tested: tests.length > 0,
      testFiles: tests,
      dataLayer: touchesData,
      confidence: r.confidence,
      evidence: r.evidence,
      overlayNodeId: `api:route-file:${r.handlerFile}`,
    };
  });

  const frameworksDetected = [...frameworks].filter((f) => f !== "unknown");
  const untested = endpoints.filter((e) => !e.tested).length;
  const summary =
    endpoints.length === 0
      ? "No HTTP routes detected (Express / Nest / Fastify heuristics)"
      : `Backend: ${endpoints.length} endpoint(s)` +
        (frameworksDetected.length
          ? ` · ${frameworksDetected.join(", ")}`
          : "") +
        (untested > 0 ? ` · ${untested} untested` : "");

  return {
    rootPath: input.workspaceRoot,
    ...(input.packageId === undefined ? {} : { packageId: input.packageId }),
    generatedAt: new Date().toISOString(),
    summary,
    frameworksDetected,
    endpoints,
    dataLayer,
    envVars,
    integrations,
    background,
  };
}

function routeKey(
  r: Pick<RawRoute, "method" | "path" | "handlerFile">,
): string {
  return `${r.method}|${r.path}|${r.handlerFile}`;
}

/** NestJS `@Controller` + `@Get` / `@Post` / … */
export function extractNest(path: string, text: string): RawRoute[] {
  // Leading `\b` before `@` never matches (both sides are non-word).
  if (
    !/@Controller\b/.test(text) &&
    !/@(Get|Post|Put|Patch|Delete|Options|Head|All)\b/.test(text)
  ) {
    return [];
  }
  const out: RawRoute[] = [];
  const controllerMatch =
    /@Controller\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/.exec(text);
  const prefix = normalizePath(controllerMatch?.[1] ?? "");

  const methodRe =
    /@(Get|Post|Put|Patch|Delete|Options|Head|All)\s*(?:\(\s*(?:['"`]([^'"`]*)['"`])?\s*\))?/g;
  let m: RegExpExecArray | null;
  while ((m = methodRe.exec(text)) !== null) {
    const method = m[1]!.toUpperCase();
    const suffix = normalizePath(m[2] ?? "");
    const full = joinPaths(prefix, suffix) || "/";
    const window = text.slice(Math.max(0, m.index - 120), m.index + 200);
    const after = text.slice(
      m.index + m[0].length,
      m.index + m[0].length + 160,
    );
    const nameMatch =
      /^\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:async\s+)?(\w+)\s*\(/.exec(after);
    out.push({
      method,
      path: full,
      handlerFile: path,
      ...(nameMatch?.[1] !== undefined ? { handlerName: nameMatch[1] } : {}),
      framework: "nest",
      auth: inferAuth(window, text),
      confidence: 0.85,
      evidence: [
        controllerMatch
          ? `@Controller(${JSON.stringify(controllerMatch[1] ?? "")})`
          : "@Controller",
        `@${m[1]}${m[2] !== undefined ? `(${JSON.stringify(m[2])})` : ""}`,
      ],
    });
  }
  return out;
}

/**
 * Express `app|router.(get|post|…)` and Fastify `fastify|app.(get|post|…)` /
 * `app.route({ method, url })`.
 */
export function extractExpressLike(
  path: string,
  text: string,
  framework: "express" | "fastify",
): RawRoute[] {
  const out: RawRoute[] = [];
  const receiver =
    framework === "fastify"
      ? "(?:fastify|app|server)"
      : "(?:app|router|server)";

  // Prefer framework-specific markers to avoid double-counting.
  if (framework === "fastify") {
    if (
      !/\bfastify\b/i.test(text) &&
      !/\.route\s*\(\s*\{/.test(text) &&
      !/@fastify\//.test(text)
    ) {
      // Still allow app.get if package signals fastify elsewhere — keep soft.
      if (!/\b(app|server)\.(get|post|put|patch|delete)\s*\(/i.test(text)) {
        return [];
      }
    }
  } else {
    if (/\bfastify\b/i.test(text) && !/\bexpress\b/i.test(text)) {
      return [];
    }
  }

  const callRe = new RegExp(
    `\\b${receiver}\\.(${HTTP_METHODS.join("|")})\\s*\\(\\s*(['"\`])([^'"\`]+)\\2`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(text)) !== null) {
    const method = m[1]!.toUpperCase();
    const routePath = normalizePath(m[3] ?? "/") || "/";
    const window = text.slice(Math.max(0, m.index), m.index + 280);
    const after = text.slice(
      m.index + m[0].length,
      m.index + m[0].length + 120,
    );
    const handlerMatch =
      /^\s*,\s*(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)/.exec(after);
    const handlerName =
      handlerMatch?.[1] &&
      !["async", "function", "req", "request", "res", "reply"].includes(
        handlerMatch[1],
      )
        ? handlerMatch[1]
        : undefined;
    out.push({
      method,
      path: routePath,
      handlerFile: path,
      ...(handlerName !== undefined ? { handlerName } : {}),
      framework,
      auth: inferAuth(window, text),
      confidence: framework === "fastify" ? 0.8 : 0.82,
      evidence: [`${m[0].slice(0, 80)}…`],
    });
  }

  if (framework === "fastify" || /\.route\s*\(/.test(text)) {
    const routeObjRe = /\.route\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
    let rm: RegExpExecArray | null;
    while ((rm = routeObjRe.exec(text)) !== null) {
      const body = rm[1] ?? "";
      const methodMatch =
        /method\s*:\s*(?:['"`](\w+)['"`]|\[\s*['"`](\w+)['"`])/.exec(body);
      const urlMatch = /(?:url|path)\s*:\s*['"`]([^'"`]+)['"`]/.exec(body);
      if (!urlMatch) continue;
      const method = (
        methodMatch?.[1] ??
        methodMatch?.[2] ??
        "GET"
      ).toUpperCase();
      const handlerMatch =
        /handler\s*:\s*(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)/.exec(
          body,
        );
      const handlerName =
        handlerMatch?.[1] && handlerMatch[1] !== "async"
          ? handlerMatch[1]
          : undefined;
      out.push({
        method,
        path: normalizePath(urlMatch[1]!) || "/",
        handlerFile: path,
        ...(handlerName !== undefined ? { handlerName } : {}),
        framework: "fastify",
        auth: inferAuth(body, text),
        confidence: 0.78,
        evidence: [`route({ method: ${method}, url: ${urlMatch[1]} })`],
      });
    }
  }

  return out;
}

function inferAuth(window: string, fileText: string): BackendAuthExposure {
  if (PUBLIC_HINT.test(window) || PUBLIC_HINT.test(fileText.slice(0, 400))) {
    return "public";
  }
  if (AUTH_HINT.test(window)) return "authenticated";
  if (AUTH_HINT.test(fileText) && /guard|UseGuards|AuthGuard/i.test(fileText)) {
    return "authenticated";
  }
  return "unknown";
}

function scanDataLayer(
  root: string,
  files: readonly string[],
): BackendDataLayerItem[] {
  const out: BackendDataLayerItem[] = [];
  for (const path of files) {
    const base = path.split("/").pop() ?? path;
    if (/\.sql$/i.test(path)) {
      out.push({
        id: `data:sql:${path}`,
        kind: "sql",
        path,
        confidence: 0.9,
        evidence: [base],
      });
      continue;
    }
    if (/migration/i.test(path) || /\/migrations?\//i.test(path)) {
      out.push({
        id: `data:migration:${path}`,
        kind: "migration",
        path,
        confidence: 0.85,
        evidence: ["migration path"],
      });
      continue;
    }
    if (!/\.(tsx?|jsx?|prisma)$/i.test(path)) continue;
    const text = readText(root, path);
    if (
      /\b(prisma|typeorm|sequelize|mongoose|knex|drizzle|@prisma\/client)\b/i.test(
        text,
      ) ||
      path.endsWith(".prisma")
    ) {
      out.push({
        id: `data:client:${path}`,
        kind:
          path.endsWith(".prisma") || /schema\.prisma$/i.test(path)
            ? "model"
            : "client",
        path,
        confidence: 0.8,
        evidence: ["ORM / DB client marker"],
      });
    }
    if (
      /\b(Entity|Schema|Model)\b/.test(text) &&
      /\/(models?|entities)\//i.test(path)
    ) {
      out.push({
        id: `data:model:${path}`,
        kind: "model",
        path,
        confidence: 0.7,
        evidence: ["model/entity path"],
      });
    }
  }
  return dedupeById(out);
}

function scanEnvVars(root: string, files: readonly string[]): BackendEnvVar[] {
  const seen = new Map<string, BackendEnvVar>();
  const re =
    /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[['"`]([A-Z][A-Z0-9_]*)['"`]\])/g;
  for (const path of files) {
    if (!/\.(tsx?|jsx?|mjs|cjs)$/i.test(path)) continue;
    const text = readText(root, path);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = m[1] ?? m[2];
      if (!name || seen.has(name)) continue;
      seen.set(name, {
        name,
        path,
        confidence: 0.9,
        evidence: [`process.env.${name}`],
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function scanIntegrations(
  root: string,
  files: readonly string[],
): BackendIntegration[] {
  const patterns: Array<{ id: string; name: string; re: RegExp }> = [
    { id: "stripe", name: "Stripe", re: /\bstripe\b|from ['"]stripe['"]/i },
    { id: "twilio", name: "Twilio", re: /\btwilio\b|from ['"]twilio['"]/i },
    { id: "aws-sdk", name: "AWS SDK", re: /@aws-sdk\/|aws-sdk/i },
    { id: "sendgrid", name: "SendGrid", re: /@sendgrid\/|sendgrid/i },
    { id: "sentry", name: "Sentry", re: /@sentry\/|Sentry\./ },
  ];
  const out: BackendIntegration[] = [];
  for (const path of files) {
    if (!/\.(tsx?|jsx?|json)$/i.test(path)) continue;
    const text = readText(root, path);
    for (const p of patterns) {
      if (p.re.test(text)) {
        out.push({
          id: `int:${p.id}:${path}`,
          name: p.name,
          path,
          confidence: 0.75,
          evidence: [p.name],
        });
      }
    }
  }
  return dedupeById(out);
}

function scanBackground(
  root: string,
  files: readonly string[],
): BackendBackgroundJob[] {
  const out: BackendBackgroundJob[] = [];
  for (const path of files) {
    if (!/\.(tsx?|jsx?)$/i.test(path)) continue;
    const text = readText(root, path);
    if (/\b(Bull|BullMQ|bee-queue|Agenda|bee)\b|from ['"]bull/.test(text)) {
      out.push({
        id: `bg:queue:${path}`,
        kind: "queue",
        path,
        confidence: 0.8,
        evidence: ["queue library"],
      });
    }
    if (
      /@Cron\b|node-cron|cron\.schedule|CronJob\b|from ['"]cron['"]/.test(text)
    ) {
      out.push({
        id: `bg:cron:${path}`,
        kind: "cron",
        path,
        confidence: 0.85,
        evidence: ["cron marker"],
      });
    }
    if (/\/workers?\//i.test(path) || /\bWorker\b/.test(text)) {
      out.push({
        id: `bg:worker:${path}`,
        kind: "worker",
        path,
        confidence: 0.65,
        evidence: ["worker marker"],
      });
    }
  }
  return dedupeById(out);
}

function linkTests(
  routes: readonly RawRoute[],
  files: readonly string[],
  index?: IndexSnapshot,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const testFiles = files.filter(
    (f) =>
      /\.(test|spec)\.(tsx?|jsx?)$/i.test(f) ||
      /\/__tests__\//i.test(f) ||
      /\.tests?\./i.test(f),
  );

  const importsByFile = new Map<string, string[]>();
  if (index) {
    for (const f of index.files) {
      const targets = (f.imports ?? [])
        .map((im) => im.source)
        .filter((s) => s.length > 0);
      importsByFile.set(f.path, targets);
    }
  }

  for (const r of routes) {
    const stem = fileStem(r.handlerFile);
    const linked = new Set<string>();

    for (const t of testFiles) {
      if (fileStem(t) === stem || fileStem(t).includes(stem)) {
        linked.add(t);
      }
    }

    for (const [testPath, imports] of importsByFile) {
      if (!testFiles.includes(testPath) && !/\.(test|spec)\./i.test(testPath)) {
        continue;
      }
      for (const spec of imports) {
        if (
          spec === r.handlerFile ||
          spec.endsWith(`/${stem}`) ||
          spec.includes(stem)
        ) {
          linked.add(testPath);
        }
      }
    }

    map.set(routeKey(r), [...linked]);
  }
  return map;
}

function fileMentionsData(
  root: string,
  handlerFile: string,
  dataPaths: Set<string>,
): boolean {
  const text = readText(root, handlerFile);
  if (!text) return false;
  for (const p of dataPaths) {
    const stem = fileStem(p);
    if (stem.length > 2 && text.includes(stem)) return true;
  }
  return /\b(prisma|typeorm|sequelize|mongoose|knex|drizzle)\b/i.test(text);
}

function fileStem(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base
    .replace(/\.(tsx?|jsx?|mjs|cjs)$/i, "")
    .replace(/\.(test|spec)$/i, "");
}

function normalizePath(p: string): string {
  const t = p.trim();
  if (!t) return "";
  return t.startsWith("/") ? t : `/${t}`;
}

function joinPaths(a: string, b: string): string {
  if (!a) return b || "/";
  if (!b || b === "/") return a || "/";
  return `${a.replace(/\/$/, "")}/${b.replace(/^\//, "")}`;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function listRepoFiles(root: string, prefix = ""): string[] {
  const dir = join(root, prefix);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    let st;
    try {
      st = statSync(join(root, rel));
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...listRepoFiles(root, rel));
    else if (st.isFile()) out.push(rel);
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
