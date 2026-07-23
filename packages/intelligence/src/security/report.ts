import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  SecurityCheck,
  SecurityReport,
  SecurityTool,
} from "@prism/shared";

export type BuildSecurityReportInput = {
  workspaceRoot: string;
  /** Optional pre-listed repo-relative paths (skips FS walk when provided). */
  files?: readonly string[];
  /** When true, treat the backend domain as present (from DNA/overlays). */
  hasBackendDomain?: boolean;
  /** When true, treat the frontend domain as present (from DNA/overlays). */
  hasFrontendDomain?: boolean;
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".prism",
  "coverage",
  "vendor",
  ".turbo",
]);

const LOCKFILES = [
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.lock",
  "go.sum",
  "poetry.lock",
  "Pipfile.lock",
];

const ENV_SECRET_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.staging",
];

/** Source extensions we are willing to open for content scans. */
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|rs|php)$/i;
const FRONTEND_EXT = /\.(tsx|jsx|vue|svelte|astro|html)$/i;

/** Cap on files opened for any single content scan to keep this cheap. */
const SCAN_FILE_LIMIT = 400;
const SCAN_BYTES = 16_000;

const AUTH_CODE_HINT =
  /\b(requireAuth|isAuthenticated|passport|jsonwebtoken|jwt\.verify|bearer|UseGuards|AuthGuard|withAuth|getServerSession|verifyToken)\b/i;

const AUTH_LIBS = [
  "passport",
  "next-auth",
  "@auth/core",
  "@auth/express",
  "jsonwebtoken",
  "jose",
  "express-session",
  "cookie-session",
  "@nestjs/passport",
  "@nestjs/jwt",
  "lucia",
  "better-auth",
  "@clerk/nextjs",
  "@clerk/backend",
  "@supabase/supabase-js",
  "firebase-admin",
  "oidc-client-ts",
  "openid-client",
  "express-jwt",
  "bcrypt",
  "bcryptjs",
  "argon2",
];

const VALIDATION_LIBS = [
  "zod",
  "joi",
  "yup",
  "valibot",
  "class-validator",
  "superstruct",
  "ajv",
  "io-ts",
  "@sinclair/typebox",
  "pydantic",
];

const CORS_LIBS = ["cors", "@fastify/cors", "@koa/cors"];
const HEADERS_LIBS = ["helmet", "@fastify/helmet", "next-secure-headers"];
const FRONTEND_LIBS = [
  "react",
  "react-dom",
  "vue",
  "svelte",
  "@angular/core",
  "next",
  "nuxt",
  "solid-js",
  "preact",
  "@remix-run/react",
];
const BACKEND_LIBS = [
  "express",
  "fastify",
  "@nestjs/core",
  "koa",
  "hapi",
  "@hapi/hapi",
  "http-server",
  "apollo-server",
  "@apollo/server",
];

/**
 * Build a typed SecurityReport: left-shift tool detection + a fundamental,
 * domain-segregated checklist (M-046 / ADR-0022). Local FS only — deterministic,
 * no network, not a full SAST scanner.
 */
export function buildSecurityReport(
  input: BuildSecurityReportInput,
): SecurityReport {
  const root = input.workspaceRoot;
  const files = input.files ? [...input.files] : listRepoFiles(root);
  const deps = readDeps(root);
  const tools = detectTools(root, files);

  const looksBackend =
    input.hasBackendDomain === true || inferBackend(root, files, deps);
  const looksFrontend =
    input.hasFrontendDomain === true || inferFrontend(files, deps);

  const checks = runChecks(root, files, deps, tools, {
    looksBackend,
    looksFrontend,
  });
  const score = scoreSecurity(tools, checks);
  const summary = summarizeSecurity(tools, checks, score);

  return { score, tools, checks, summary };
}

type DomainFlags = { looksBackend: boolean; looksFrontend: boolean };

function detectTools(root: string, files: readonly string[]): SecurityTool[] {
  const workflows = files.filter(
    (f) => f.startsWith(".github/workflows/") && /\.(yml|yaml)$/i.test(f),
  );

  const dependabotPath = firstExisting(root, [
    ".github/dependabot.yml",
    ".github/dependabot.yaml",
  ]);

  const renovatePath =
    firstExisting(root, [
      "renovate.json",
      "renovate.json5",
      ".renovaterc",
      ".renovaterc.json",
      ".renovaterc.json5",
      ".github/renovate.json",
      ".gitlab/renovate.json",
    ]) ??
    workflows.find((f) => fileMentions(root, f, "renovate")) ??
    (pkgHasKey(root, "renovate") ? "package.json" : undefined);

  const codeqlPath =
    workflows.find((f) => fileMentions(root, f, "codeql")) ??
    firstExisting(root, [".github/codeql", ".github/codeql/codeql-config.yml"]);

  const snykPath =
    firstExisting(root, [".snyk", "snyk.yml", "snyk.yaml"]) ??
    workflows.find((f) => fileMentions(root, f, "snyk")) ??
    (pkgHas(root, "snyk") ? "package.json" : undefined);

  const semgrepPath =
    firstExisting(root, [
      ".semgrep.yml",
      ".semgrep.yaml",
      "semgrep.yml",
      ".semgrep/config.yml",
    ]) ?? workflows.find((f) => fileMentions(root, f, "semgrep"));

  const trivyPath =
    firstExisting(root, [
      "trivy.yaml",
      "trivy.yml",
      ".trivyignore",
      "trivy-secret.yaml",
    ]) ?? workflows.find((f) => fileMentions(root, f, "trivy"));

  const gitleaksPath =
    firstExisting(root, [
      ".gitleaks.toml",
      ".gitleaks.yml",
      "gitleaks.toml",
      ".gitleaksignore",
    ]) ?? workflows.find((f) => fileMentions(root, f, "gitleaks"));

  const trufflehogPath =
    firstExisting(root, [
      ".trufflehog.yaml",
      ".trufflehog.yml",
      "trufflehog.yaml",
    ]) ?? workflows.find((f) => fileMentions(root, f, "trufflehog"));

  return [
    tool("dependabot", "Dependabot", dependabotPath),
    tool("renovate", "Renovate", renovatePath),
    tool("codeql", "CodeQL", codeqlPath),
    tool("snyk", "Snyk", snykPath),
    tool("semgrep", "Semgrep", semgrepPath),
    tool("trivy", "Trivy", trivyPath),
    tool("gitleaks", "gitleaks", gitleaksPath),
    tool("trufflehog", "TruffleHog", trufflehogPath),
  ];
}

function tool(
  id: string,
  name: string,
  path: string | undefined,
): SecurityTool {
  return {
    id,
    name,
    present: path !== undefined,
    ...(path === undefined ? {} : { path }),
  };
}

function runChecks(
  root: string,
  files: readonly string[],
  deps: Record<string, string>,
  tools: readonly SecurityTool[],
  domains: DomainFlags,
): SecurityCheck[] {
  const checks: SecurityCheck[] = [];
  const toolPresent = (id: string): boolean =>
    tools.some((t) => t.id === id && t.present);

  // --- General checks -------------------------------------------------------

  // env-gitignored: a committed .env is a hard fail; a missing .gitignore rule
  // is a warning; clean + ignored is a pass.
  const envHit = files.find((f) => {
    const base = f.split("/").pop() ?? f;
    return (
      ENV_SECRET_FILES.includes(base) ||
      (/^\.env\./i.test(base) &&
        !/\.(example|sample|template|dist)$/i.test(base))
    );
  });
  const gitignoreIgnoresEnv = gitignoreHasEnvRule(root);
  checks.push({
    id: "env-gitignored",
    status: envHit ? "fail" : gitignoreIgnoresEnv ? "pass" : "warn",
    title: ".env files are gitignored",
    detail: envHit
      ? `Committed secret file found: ${envHit}`
      : gitignoreIgnoresEnv
        ? ".env pattern present in .gitignore; no committed .env files"
        : "No committed .env files, but .gitignore has no .env rule",
  });

  // lockfile-present
  const lock = LOCKFILES.find(
    (name) => existsSync(join(root, name)) || files.includes(name),
  );
  checks.push({
    id: "lockfile-present",
    status: lock ? "pass" : "warn",
    title: "Dependency lockfile committed",
    detail: lock
      ? lock
      : "No lockfile (bun.lock / package-lock.json / yarn.lock / etc.) found",
  });

  // dependency-updates: Dependabot or Renovate
  const depUpdate = toolPresent("dependabot")
    ? "Dependabot"
    : toolPresent("renovate")
      ? "Renovate"
      : undefined;
  checks.push({
    id: "dependency-updates",
    status: depUpdate ? "pass" : "warn",
    title: "Automated dependency updates configured",
    detail: depUpdate
      ? `${depUpdate} configuration detected`
      : "No Dependabot or Renovate configuration found",
  });

  // secrets-scan-tool: gitleaks / trufflehog
  const secretScanner = toolPresent("gitleaks")
    ? "gitleaks"
    : toolPresent("trufflehog")
      ? "TruffleHog"
      : undefined;
  checks.push({
    id: "secrets-scan-tool",
    status: secretScanner ? "pass" : "warn",
    title: "Secret scanning tool present (gitleaks/trufflehog)",
    detail: secretScanner
      ? `${secretScanner} configured`
      : "No gitleaks / TruffleHog markers found",
  });

  // sast-tool: codeql / semgrep / snyk / trivy
  const sast = ["codeql", "semgrep", "snyk", "trivy"]
    .filter(toolPresent)
    .map((id) => tools.find((t) => t.id === id)?.name ?? id);
  checks.push({
    id: "sast-tool",
    status: sast.length > 0 ? "pass" : "warn",
    title: "Static analysis / SAST tool configured (codeql, semgrep, snyk)",
    detail:
      sast.length > 0
        ? sast.join(", ")
        : "No CodeQL / Semgrep / Snyk / Trivy markers found",
  });

  // --- Backend-domain checks ------------------------------------------------

  if (!domains.looksBackend) {
    checks.push(
      skipped(
        "https-only",
        "backend",
        "No hardcoded http:// endpoints in backend source",
      ),
      skipped("auth-library", "backend", "Auth/session library detected"),
      skipped("cors-config", "backend", "CORS configuration detected"),
      skipped(
        "input-validation",
        "backend",
        "Validation library detected (zod/joi/yup/valibot)",
      ),
    );
  } else {
    // https-only: warn if hardcoded http:// (non-localhost) endpoints exist.
    const httpHit = scanForFirst(
      root,
      files,
      (f) => CODE_EXT.test(f),
      /https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i,
      (line) => /http:\/\//i.test(line),
    );
    checks.push({
      id: "https-only",
      domain: "backend",
      status: httpHit ? "warn" : "pass",
      title: "No hardcoded http:// endpoints in backend source",
      detail: httpHit
        ? `Plain http:// endpoint referenced in ${httpHit}`
        : "No hardcoded http:// endpoints found in source",
    });

    // auth-library
    const authLib = AUTH_LIBS.find((d) => d in deps);
    const authCode = authLib
      ? undefined
      : scanForFirst(
          root,
          files,
          (f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f),
          AUTH_CODE_HINT,
        );
    checks.push({
      id: "auth-library",
      domain: "backend",
      status: authLib || authCode ? "pass" : "warn",
      title: "Auth/session library detected",
      detail: authLib
        ? `Dependency: ${authLib}`
        : authCode
          ? `Auth code signal in ${authCode}`
          : "Backend surface present but no auth/session library or middleware found",
    });

    // cors-config: informational — pass if detected, otherwise skip (not penalized).
    const corsLib = CORS_LIBS.find((d) => d in deps);
    const corsCode = corsLib
      ? undefined
      : scanForFirst(
          root,
          files,
          (f) => CODE_EXT.test(f),
          /\bcors\s*\(|access-control-allow-origin/i,
        );
    checks.push(
      corsLib || corsCode
        ? {
            id: "cors-config",
            domain: "backend",
            status: "pass",
            title: "CORS configuration detected",
            detail: corsLib
              ? `Dependency: ${corsLib}`
              : `CORS usage in ${corsCode}`,
          }
        : skipped(
            "cors-config",
            "backend",
            "CORS configuration detected",
            "No explicit CORS configuration found (informational)",
          ),
    );

    // input-validation
    const validationLib = VALIDATION_LIBS.find((d) => d in deps);
    checks.push({
      id: "input-validation",
      domain: "backend",
      status: validationLib ? "pass" : "warn",
      title: "Validation library detected (zod/joi/yup/valibot)",
      detail: validationLib
        ? `Dependency: ${validationLib}`
        : "No schema/validation library found among dependencies",
    });
  }

  // --- Security headers (backend and/or frontend) ---------------------------

  const headerDomain = domains.looksBackend
    ? "backend"
    : domains.looksFrontend
      ? "frontend"
      : undefined;
  const headersLib = HEADERS_LIBS.find((d) => d in deps);
  const headersCode = headersLib
    ? undefined
    : scanForFirst(
        root,
        files,
        (f) => CODE_EXT.test(f) || FRONTEND_EXT.test(f),
        /\bhelmet\s*\(|content-security-policy|strict-transport-security/i,
      );
  checks.push({
    id: "security-headers",
    ...(headerDomain ? { domain: headerDomain } : {}),
    status: headersLib || headersCode ? "pass" : "warn",
    title: "Security headers / helmet / CSP detected",
    detail: headersLib
      ? `Dependency: ${headersLib}`
      : headersCode
        ? `Security header signal in ${headersCode}`
        : "No helmet / CSP / HSTS configuration detected",
  });

  // --- Frontend-domain checks -----------------------------------------------

  if (!domains.looksFrontend) {
    checks.push(
      skipped(
        "dangerous-html",
        "frontend",
        "No obvious dangerouslySetInnerHTML / innerHTML sinks",
      ),
    );
  } else {
    const dangerHit = scanForFirst(
      root,
      files,
      (f) => FRONTEND_EXT.test(f) || /\.(ts|tsx|js|jsx)$/i.test(f),
      /dangerouslySetInnerHTML|\.innerHTML\s*=|\bv-html\b/,
    );
    checks.push({
      id: "dangerous-html",
      domain: "frontend",
      status: dangerHit ? "warn" : "pass",
      title: "No obvious dangerouslySetInnerHTML / innerHTML sinks",
      detail: dangerHit
        ? `Raw HTML sink in ${dangerHit}`
        : "No dangerouslySetInnerHTML / innerHTML / v-html sinks found",
    });
  }

  return checks;
}

function skipped(
  id: string,
  domain: string,
  title: string,
  detail = "Domain not detected — skipped",
): SecurityCheck {
  return { id, domain, status: "skip", title, detail };
}

/**
 * Score = tool coverage (up to 50) + checklist quality (up to 50).
 * The checklist term weights failures heavier than warnings by giving fails a
 * larger denominator weight, so a single fail drags the score more than a warn.
 * `skip` checks are excluded entirely.
 */
function scoreSecurity(
  tools: readonly SecurityTool[],
  checks: readonly SecurityCheck[],
): number {
  const presentTools = tools.filter((t) => t.present).length;
  const toolScore =
    tools.length === 0 ? 0 : Math.min(50, presentTools * (50 / tools.length));

  const scored = checks.filter((c) => c.status !== "skip");
  if (scored.length === 0) return Math.round(toolScore);

  let earned = 0;
  let possible = 0;
  for (const c of scored) {
    if (c.status === "pass") {
      earned += 1;
      possible += 1;
    } else if (c.status === "warn") {
      earned += 0.5;
      possible += 1;
    } else {
      // fail: no credit and a heavier weight in the denominator.
      possible += 2;
    }
  }
  const checkScore = (earned / possible) * 50;
  return Math.round(Math.max(0, Math.min(100, toolScore + checkScore)));
}

function summarizeSecurity(
  tools: readonly SecurityTool[],
  checks: readonly SecurityCheck[],
  score: number,
): string {
  const present = tools.filter((t) => t.present).map((t) => t.name);
  const active = checks.filter((c) => c.status !== "skip");
  const passed = active.filter((c) => c.status === "pass").length;
  const warned = active.filter((c) => c.status === "warn").length;
  const failed = active.filter((c) => c.status === "fail").length;
  const skippedCount = checks.length - active.length;

  const parts = [
    present.length > 0
      ? `tools: ${present.join(", ")}`
      : "no left-shift tools detected",
    `${passed} pass / ${warned} warn / ${failed} fail (of ${active.length}); ${skippedCount} skipped`,
  ];
  return `Score ${score}/100 — ${parts.join("; ")}`;
}

// --- Domain inference -------------------------------------------------------

function inferBackend(
  root: string,
  files: readonly string[],
  deps: Record<string, string>,
): boolean {
  if (BACKEND_LIBS.some((d) => d in deps)) return true;
  const backendPath = files.some(
    (f) =>
      /(^|\/)(server|api|backend|routes?|controllers?)(\/|$)/i.test(f) ||
      /\.(controller|guard|middleware|resolver)\.(ts|js)$/i.test(f),
  );
  if (backendPath) return true;
  if (files.some((f) => f.endsWith(".go") || f.endsWith(".rb"))) return true;
  // Python web apps count as backend.
  return files.some((f) => f.endsWith(".py") && !/(^|\/)tests?\//i.test(f));
}

function inferFrontend(
  files: readonly string[],
  deps: Record<string, string>,
): boolean {
  if (FRONTEND_LIBS.some((d) => d in deps)) return true;
  return files.some(
    (f) => FRONTEND_EXT.test(f) || (f.split("/").pop() ?? f) === "index.html",
  );
}

// --- Helpers ----------------------------------------------------------------

function gitignoreHasEnvRule(root: string): boolean {
  const text = readText(root, ".gitignore");
  if (!text) return false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (/(^|\/)\.env(\b|\.|\*|$)/i.test(line)) return true;
  }
  return false;
}

/**
 * Scan candidate files for the first match of `re`. Bounded by SCAN_FILE_LIMIT
 * files and SCAN_BYTES per file. Optional `lineFilter` further narrows what
 * counts as a hit (e.g. require a plain http:// on the matched line).
 */
function scanForFirst(
  root: string,
  files: readonly string[],
  accept: (f: string) => boolean,
  re: RegExp,
  lineFilter?: (line: string) => boolean,
): string | undefined {
  let opened = 0;
  for (const f of files) {
    if (!accept(f)) continue;
    if (opened >= SCAN_FILE_LIMIT) break;
    opened += 1;
    const text = readText(root, f).slice(0, SCAN_BYTES);
    if (!text) continue;
    if (!re.test(text)) continue;
    if (!lineFilter) return f;
    if (text.split("\n").some((line) => re.test(line) && lineFilter(line))) {
      return f;
    }
  }
  return undefined;
}

function readDeps(root: string): Record<string, string> {
  try {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
  } catch {
    return {};
  }
}

function firstExisting(root: string, candidates: string[]): string | undefined {
  for (const rel of candidates) {
    if (existsSync(join(root, rel))) return rel;
  }
  return undefined;
}

function pkgHas(root: string, name: string): boolean {
  try {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
  } catch {
    return false;
  }
}

function pkgHasKey(root: string, key: string): boolean {
  try {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    return pkg[key] !== undefined && pkg[key] !== null;
  } catch {
    return false;
  }
}

function fileMentions(root: string, rel: string, needle: string): boolean {
  return readText(root, rel).toLowerCase().includes(needle.toLowerCase());
}

function readText(root: string, rel: string): string {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    return "";
  }
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
