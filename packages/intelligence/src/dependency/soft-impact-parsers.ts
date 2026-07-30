/**
 * Family-specific soft-impact parsers (M-049 deep soft signals).
 */

import {
  SOFT_ENV_KEY_CAP,
  SOFT_MATCH_CAP,
  SOFT_SUBSTRING_CAP,
  basenameOf,
  collectStringLeaves,
  dirnamePosix,
  extractPathLikeTokens,
  extractStringArrayProp,
  joinPosix,
  matchAnywhere,
  matchGlob,
  matchUnderDir,
  pushEdge,
  readText,
  resolveInventoryPath,
  stripJsonc,
  type SoftImpactEdge,
  type SoftParseState,
  isVitestConfig,
  isJestConfig,
  isPlaywrightConfig,
  isMochaConfig,
  isCypressConfig,
} from "./soft-impact-utils.js";

export function parseTestRunnerConfig(
  configPath: string,
  source: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const dir = dirnamePosix(configPath);
  const base = basenameOf(configPath);
  const kind = isVitestConfig(base)
    ? "vitest"
    : isJestConfig(base)
      ? "jest"
      : isPlaywrightConfig(base)
        ? "playwright"
        : isMochaConfig(base)
          ? "mocha"
          : isCypressConfig(base)
            ? "cypress"
            : "test-runner";

  const includeProps =
    kind === "jest"
      ? ["testMatch", "testRegex", "roots"]
      : kind === "playwright"
        ? ["testMatch", "testDir", "testIgnore"]
        : kind === "mocha"
          ? ["spec", "extension", "file", "ignore"]
          : kind === "cypress"
            ? [
                "specPattern",
                "excludeSpecPattern",
                "supportFile",
                "fixturesFolder",
              ]
            : ["include"];

  const globs: string[] = [];
  for (const prop of includeProps) {
    globs.push(...extractStringArrayProp(source, prop));
  }
  // Cypress nested e2e/component blocks
  if (kind === "cypress") {
    for (const m of source.matchAll(
      /(?:e2e|component)\s*:\s*\{([^}]{0,1200})\}/g,
    )) {
      for (const prop of ["specPattern", "supportFile", "excludeSpecPattern"]) {
        globs.push(...extractStringArrayProp(m[1] ?? "", prop));
      }
    }
  }
  if (globs.length === 0 && kind === "vitest") {
    globs.push("**/*.{test,spec}.?(c|m)[jt]s?(x)");
    globs.push("src/**/*.test.ts", "src/**/*.test.tsx");
  }
  if (globs.length === 0 && kind === "jest") {
    globs.push("**/__tests__/**/*.[jt]s?(x)", "**/*.(test|spec).[jt]s?(x)");
  }
  if (globs.length === 0 && kind === "mocha") {
    globs.push("test/**/*.js", "test/**/*.ts", "**/*.test.js", "**/*.spec.js");
  }
  if (globs.length === 0 && kind === "cypress") {
    globs.push(
      "cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
      "cypress/integration/**/*.{js,ts}",
      "**/*.cy.{js,jsx,ts,tsx}",
    );
  }

  const { matches, truncated } = matchUnderDir(
    dir,
    globs,
    allPaths,
    SOFT_MATCH_CAP,
  );
  if (truncated) {
    state.truncated = true;
    state.notes.push(
      `soft matches capped at ${SOFT_MATCH_CAP} for ${configPath}`,
    );
  }

  for (const to of matches) {
    if (to === configPath) continue;
    const isTest =
      /(^|\/)__tests__\//.test(to) ||
      /\.(test|spec|cy)\.[a-z]+$/i.test(to) ||
      /(^|\/)(e2e|cypress)(\/|$)/i.test(to);
    pushEdge(
      edges,
      {
        from: configPath,
        to,
        lane: isTest ? "test" : "config",
        reason: `matched by ${kind} config include/testMatch`,
        confidence: "medium",
        evidence: [
          `${base}#${includeProps[0] ?? "include"}`,
          ...globs.slice(0, 3).map((g) => `glob: ${g}`),
        ],
        category: isTest ? "test" : "config",
      },
      seen,
    );
  }

  for (const prop of [
    "setupFiles",
    "setupFilesAfterEnv",
    "globalSetup",
    "globalTeardown",
    "setupFile",
    "require",
    "supportFile",
  ]) {
    for (const raw of extractStringArrayProp(source, prop)) {
      const resolved = resolveInventoryPath(dir, raw, allPaths);
      if (!resolved) continue;
      pushEdge(
        edges,
        {
          from: configPath,
          to: resolved,
          lane: "config",
          reason: `referenced as ${prop} in ${kind} config`,
          confidence: "high",
          evidence: [`${base}#${prop}`, resolved],
          category: "config",
        },
        seen,
      );
    }
  }
}

export function parseTsconfig(
  configPath: string,
  source: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const dir = dirnamePosix(configPath);
  const base = basenameOf(configPath);
  let json: {
    include?: string[];
    files?: string[];
    references?: Array<{ path?: string }>;
  };
  try {
    json = JSON.parse(stripJsonc(source)) as typeof json;
  } catch {
    state.notes.push(`could not parse ${configPath}`);
    return;
  }

  const globs = [...(json.include ?? []), ...(json.files ?? [])];
  if (globs.length > 0) {
    const { matches, truncated } = matchUnderDir(
      dir,
      globs,
      allPaths,
      SOFT_MATCH_CAP,
    );
    if (truncated) {
      state.truncated = true;
      state.notes.push(`tsconfig soft matches capped for ${configPath}`);
    }
    for (const to of matches) {
      if (to === configPath) continue;
      pushEdge(
        edges,
        {
          from: configPath,
          to,
          lane: "config",
          reason: "included by TypeScript project",
          confidence: "medium",
          evidence: [
            `${base}#include`,
            ...globs.slice(0, 3).map((g) => `glob: ${g}`),
          ],
          category: "config",
        },
        seen,
      );
    }
  }

  for (const ref of json.references ?? []) {
    if (!ref.path) continue;
    const refPath = joinPosix(dir, ref.path.replace(/^\.\//, ""));
    const candidates = [
      refPath,
      refPath.endsWith(".json") ? refPath : `${refPath}.json`,
      joinPosix(refPath, "tsconfig.json"),
    ];
    for (const cand of candidates) {
      if (!allPaths.includes(cand)) continue;
      pushEdge(
        edges,
        {
          from: configPath,
          to: cand,
          lane: "config",
          reason: "TypeScript project reference",
          confidence: "high",
          evidence: [`${base}#references`, cand],
          category: "config",
        },
        seen,
      );
      break;
    }
  }
}

function workspacePatternsFromPkg(pkg: {
  workspaces?: string[] | { packages?: string[] };
}): string[] {
  if (!pkg.workspaces) return [];
  if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
  return pkg.workspaces.packages ?? [];
}

function readPnpmWorkspacePatterns(
  root: string,
  packageJsonDir: string,
): string[] {
  for (const rel of [
    joinPosix(packageJsonDir, "pnpm-workspace.yaml"),
    "pnpm-workspace.yaml",
  ]) {
    const text = readText(root, rel);
    if (!text) continue;
    const patterns: string[] = [];
    const block = text.match(/packages\s*:\s*\n((?:\s*-\s*.+\n?)*)/i);
    if (block?.[1]) {
      for (const m of block[1].matchAll(/-\s*['"]?([^'"\n#]+)/g)) {
        const p = m[1]?.trim();
        if (p) patterns.push(p);
      }
    }
    if (patterns.length > 0) return patterns;
  }
  return [];
}

function memberPackageJsonsForWorkspaces(
  dir: string,
  patterns: readonly string[],
  allPaths: readonly string[],
): string[] {
  const members = new Set<string>();
  for (const p of allPaths) {
    if (basenameOf(p) !== "package.json") continue;
    const memberDir = dirnamePosix(p);
    if (memberDir === dir) continue;
    const rel = dir
      ? memberDir.startsWith(`${dir}/`)
        ? memberDir.slice(dir.length + 1)
        : null
      : memberDir;
    if (rel === null || rel === "") continue;
    for (const pat of patterns) {
      const cleaned = pat.replace(/\/$/, "");
      if (
        matchGlob(cleaned, rel) ||
        matchGlob(`${cleaned}/**`, rel) ||
        matchGlob(cleaned, joinPosix(rel, "package.json"))
      ) {
        members.add(p);
        break;
      }
    }
  }
  return [...members].sort();
}

export function parsePackageJson(
  configPath: string,
  source: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  packageNameByRoot: Map<string, string>,
  workspaceRoot: string,
  state: SoftParseState,
): void {
  const dir = dirnamePosix(configPath);
  let pkg: {
    name?: string;
    main?: string;
    module?: string;
    browser?: string | Record<string, unknown>;
    types?: string;
    typings?: string;
    bin?: string | Record<string, string>;
    exports?: unknown;
    scripts?: Record<string, string>;
    workspaces?: string[] | { packages?: string[] };
  };
  try {
    pkg = JSON.parse(source) as typeof pkg;
  } catch {
    return;
  }

  if (pkg.name) packageNameByRoot.set(dir, pkg.name);

  // Entry targets: main / module / bin / exports
  const entryTargets: Array<{ path: string; field: string }> = [];
  for (const field of ["main", "module", "types", "typings"] as const) {
    const v = pkg[field];
    if (typeof v === "string") entryTargets.push({ path: v, field });
  }
  if (typeof pkg.bin === "string") {
    entryTargets.push({ path: pkg.bin, field: "bin" });
  } else if (pkg.bin && typeof pkg.bin === "object") {
    for (const [name, p] of Object.entries(pkg.bin)) {
      if (typeof p === "string") {
        entryTargets.push({ path: p, field: `bin.${name}` });
      }
    }
  }
  for (const leaf of collectStringLeaves(pkg.exports)) {
    if (leaf.startsWith(".") || leaf.startsWith("/")) {
      entryTargets.push({ path: leaf, field: "exports" });
    }
  }
  if (typeof pkg.browser === "string") {
    entryTargets.push({ path: pkg.browser, field: "browser" });
  }

  for (const { path: raw, field } of entryTargets) {
    const resolved = resolveInventoryPath(dir, raw, allPaths);
    if (!resolved || resolved === configPath) continue;
    pushEdge(
      edges,
      {
        from: configPath,
        to: resolved,
        lane:
          field.startsWith("bin") || field === "exports" ? "package" : "config",
        reason: `package.json ${field} entry target`,
        confidence: "high",
        evidence: [`package.json#${field}`, raw],
        category: "config",
      },
      seen,
    );
  }

  // Scripts: path-like tokens + tool-word siblings
  for (const [scriptName, cmd] of Object.entries(pkg.scripts ?? {})) {
    const evidenceBase = [
      `package.json#scripts.${scriptName}`,
      cmd.slice(0, 100),
    ];

    for (const token of extractPathLikeTokens(cmd)) {
      if (token.includes("*") || token.includes("?")) {
        const { matches, truncated } = matchUnderDir(
          dir,
          [token],
          allPaths,
          Math.min(50, SOFT_MATCH_CAP),
        );
        if (truncated) {
          state.truncated = true;
          state.notes.push(
            `script glob capped for ${configPath}#${scriptName}`,
          );
        }
        for (const to of matches) {
          if (to === configPath) continue;
          pushEdge(
            edges,
            {
              from: configPath,
              to,
              lane: "script",
              reason: `package script "${scriptName}" references path pattern`,
              confidence: "medium",
              evidence: [...evidenceBase, `pattern: ${token}`],
              category: "config",
            },
            seen,
          );
        }
      } else {
        const resolved = resolveInventoryPath(dir, token, allPaths);
        if (!resolved || resolved === configPath) continue;
        pushEdge(
          edges,
          {
            from: configPath,
            to: resolved,
            lane: "script",
            reason: `package script "${scriptName}" references path`,
            confidence: "medium",
            evidence: [...evidenceBase, `path: ${token}`],
            category: "config",
          },
          seen,
        );
      }
    }

    const lower = cmd.toLowerCase();
    if (
      !/\b(vitest|jest|playwright|tsc|eslint|turbo|vite|prettier)\b/.test(lower)
    ) {
      continue;
    }
    const siblings = allPaths.filter((p) => {
      const under = dir === "" ? true : p === dir || p.startsWith(`${dir}/`);
      if (!under) return false;
      return (
        isVitestConfig(basenameOf(p)) ||
        isJestConfig(basenameOf(p)) ||
        /\.(test|spec)\.[a-z]+$/i.test(p)
      );
    });
    for (const to of siblings.slice(0, 50)) {
      if (to === configPath) continue;
      pushEdge(
        edges,
        {
          from: configPath,
          to,
          lane: "script",
          reason: `package script "${scriptName}" may exercise this path`,
          confidence: "medium",
          evidence: evidenceBase,
          category: "config",
        },
        seen,
      );
    }
  }

  // Workspace members
  const wsPatterns = [
    ...workspacePatternsFromPkg(pkg),
    ...readPnpmWorkspacePatterns(workspaceRoot, dir),
  ];
  if (wsPatterns.length > 0) {
    const members = memberPackageJsonsForWorkspaces(dir, wsPatterns, allPaths);
    if (members.length >= SOFT_MATCH_CAP) {
      state.truncated = true;
      state.notes.push(`workspace member matches capped for ${configPath}`);
    }
    for (const memberPkg of members.slice(0, SOFT_MATCH_CAP)) {
      pushEdge(
        edges,
        {
          from: configPath,
          to: memberPkg,
          lane: "workspace",
          reason: "workspace member package",
          confidence: "high",
          evidence: [
            "package.json#workspaces",
            ...wsPatterns.slice(0, 3).map((p) => `pattern: ${p}`),
            memberPkg,
          ],
          category: "config",
        },
        seen,
      );
    }
  }
}

export function linkWorkspaceDeps(
  packageJsonPaths: readonly string[],
  root: string,
  edges: SoftImpactEdge[],
  seen: Set<string>,
): void {
  const nameToPkgPath = new Map<string, string>();
  const depsOf = new Map<string, string[]>();

  for (const pkgPath of packageJsonPaths) {
    const source = readText(root, pkgPath);
    if (!source) continue;
    try {
      const pkg = JSON.parse(source) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      if (!pkg.name) continue;
      nameToPkgPath.set(pkg.name, pkgPath);
      depsOf.set(pkgPath, [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}),
      ]);
    } catch {
      /* skip */
    }
  }

  for (const [pkgPath, deps] of depsOf) {
    for (const dep of deps) {
      const targetPkg = nameToPkgPath.get(dep);
      if (!targetPkg || targetPkg === pkgPath) continue;
      pushEdge(
        edges,
        {
          from: targetPkg,
          to: pkgPath,
          lane: "workspace",
          reason: `workspace package depends on ${dep}`,
          confidence: "high",
          evidence: [`${basenameOf(pkgPath)} depends on ${dep}`],
          category: "config",
        },
        seen,
      );
    }
  }
}

/** Parse COPY/ADD sources from a Dockerfile instruction line. */
export function parseDockerCopySources(line: string): string[] {
  const trimmed = line.trim();
  if (!/^(COPY|ADD)\b/i.test(trimmed)) return [];
  // Skip multi-stage COPY --from=… (sources are other stages, not build context)
  if (/--from=/i.test(trimmed)) return [];

  let rest = trimmed.replace(/^(COPY|ADD)\s+/i, "");
  while (/^--\S+\s+/.test(rest)) {
    rest = rest.replace(/^--\S+\s+/, "");
  }
  const tokens: string[] = [];
  for (const m of rest.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)) {
    tokens.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  if (tokens.length < 2) return [];
  return tokens.slice(0, -1).filter((t) => t && t !== "." && t !== "..");
}

export function parseDockerfile(
  configPath: string,
  source: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const base = basenameOf(configPath);
  const dir = dirnamePosix(configPath);

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (/^(COPY|ADD)\b/i.test(line)) {
      const sources = parseDockerCopySources(line);
      for (const src of sources) {
        if (src.includes("*") || src.includes("?")) {
          const { matches, truncated } = matchAnywhere(
            [src, joinPosix(dir, src)].filter(Boolean),
            allPaths,
            SOFT_MATCH_CAP,
          );
          if (truncated) {
            state.truncated = true;
            state.notes.push(`Dockerfile COPY glob capped for ${configPath}`);
          }
          for (const to of matches.slice(0, 80)) {
            if (to === configPath) continue;
            pushEdge(
              edges,
              {
                from: configPath,
                to,
                lane: "ci",
                reason: "Dockerfile COPY/ADD source",
                confidence: "medium",
                evidence: [line.slice(0, 120), `source: ${src}`],
                category: "config",
              },
              seen,
            );
          }
        } else {
          const candidates = new Set<string>();
          for (const r of [
            resolveInventoryPath("", src, allPaths),
            resolveInventoryPath(dir, src, allPaths),
          ]) {
            if (r) candidates.add(r);
          }
          const pref = src.replace(/\/$/, "");
          for (const p of allPaths) {
            if (p === pref || p.startsWith(`${pref}/`)) candidates.add(p);
          }
          for (const to of [...candidates].slice(0, 80)) {
            if (to === configPath) continue;
            pushEdge(
              edges,
              {
                from: configPath,
                to,
                lane: "ci",
                reason: "Dockerfile COPY/ADD source",
                confidence: "high",
                evidence: [line.slice(0, 120)],
                category: "config",
              },
              seen,
            );
          }
        }
      }
      continue;
    }

    if (/^RUN\b/i.test(line)) {
      const runBody = line.replace(/^RUN\s+/i, "");
      for (const token of extractPathLikeTokens(runBody)) {
        if (token.includes("*")) continue;
        const resolved =
          resolveInventoryPath("", token, allPaths) ??
          resolveInventoryPath(dir, token, allPaths);
        if (!resolved || resolved === configPath) continue;
        pushEdge(
          edges,
          {
            from: configPath,
            to: resolved,
            lane: "ci",
            reason: "Dockerfile RUN references path",
            confidence: "low",
            evidence: [line.slice(0, 120)],
            category: "config",
          },
          seen,
        );
      }
    }
  }

  // Low-confidence full-path substring fallback (capped)
  let substringCount = 0;
  for (const candidate of allPaths) {
    if (substringCount >= SOFT_SUBSTRING_CAP) {
      state.truncated = true;
      state.notes.push(
        `Dockerfile substring matches capped at ${SOFT_SUBSTRING_CAP} for ${configPath}`,
      );
      break;
    }
    if (candidate === configPath || candidate.length < 8) continue;
    if (!source.includes(candidate)) continue;
    const already = edges.some(
      (e) => e.from === configPath && e.to === candidate && e.lane === "ci",
    );
    if (already) continue;
    substringCount++;
    pushEdge(
      edges,
      {
        from: configPath,
        to: candidate,
        lane: "ci",
        reason: "referenced in Dockerfile",
        confidence: "low",
        evidence: [`${base} mentions ${candidate}`],
        category: "config",
      },
      seen,
    );
  }
}

export function parseCiWorkflow(
  configPath: string,
  source: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const base = basenameOf(configPath);
  const isAzure =
    /^azure-pipelines/i.test(base) || /azure-pipelines/i.test(configPath);

  const pathFilterGlobs: string[] = [];
  // GitHub: paths: / paths-ignore: with list items (possibly nested under include:)
  for (const m of source.matchAll(
    /paths(?:-ignore)?\s*:\s*\n((?:[ \t]+.+\n?)*)/gi,
  )) {
    for (const item of (m[1] ?? "").matchAll(/-\s*['"]?([^'"\n#]+)/g)) {
      const g = item[1]?.trim();
      if (g && g !== "include" && g !== "exclude") pathFilterGlobs.push(g);
    }
  }
  for (const m of source.matchAll(/paths(?:-ignore)?\s*:\s*\[([^\]]*)\]/gi)) {
    for (const sm of (m[1] ?? "").matchAll(/['"]([^'"]+)['"]/g)) {
      if (sm[1]) pathFilterGlobs.push(sm[1]);
    }
  }

  // Azure Pipelines: trigger/pr → paths → include/exclude (nested)
  if (isAzure) {
    for (const block of source.matchAll(
      /(?:trigger|pr)\s*:\s*\n([\s\S]*?)(?=\n\S|\n[a-z][\w-]*\s*:|$)/gi,
    )) {
      const body = block[1] ?? "";
      for (const m of body.matchAll(
        /(?:include|exclude)\s*:\s*\n((?:\s*-\s*.+\n?)*)/gi,
      )) {
        for (const item of (m[1] ?? "").matchAll(/-\s*['"]?([^'"\n#]+)/g)) {
          const g = item[1]?.trim();
          if (g) pathFilterGlobs.push(g);
        }
      }
      // Inline: paths: [ 'src/*' ]
      for (const m of body.matchAll(/paths\s*:\s*\[([^\]]*)\]/gi)) {
        for (const sm of (m[1] ?? "").matchAll(/['"]([^'"]+)['"]/g)) {
          if (sm[1]) pathFilterGlobs.push(sm[1]);
        }
      }
    }
    // Fallback: any include/exclude list under a paths: key
    for (const m of source.matchAll(/paths\s*:\s*\n((?:[ \t]+.+\n?)*)/gi)) {
      const body = m[1] ?? "";
      for (const item of body.matchAll(/-\s*['"]?([^'"\n#]+)/g)) {
        const g = item[1]?.trim();
        if (g && g !== "include" && g !== "exclude") pathFilterGlobs.push(g);
      }
      for (const nested of body.matchAll(
        /(?:include|exclude)\s*:\s*\n((?:\s*-\s*.+\n?)*)/gi,
      )) {
        for (const item of (nested[1] ?? "").matchAll(
          /-\s*['"]?([^'"\n#]+)/g,
        )) {
          const g = item[1]?.trim();
          if (g) pathFilterGlobs.push(g);
        }
      }
    }
  } else {
    // Generic include/exclude lists (GitLab / others)
    for (const m of source.matchAll(
      /(?:^|\n)\s*(?:include|exclude)\s*:\s*\n((?:\s*-\s*.+\n?)*)/gi,
    )) {
      for (const item of (m[1] ?? "").matchAll(/-\s*['"]?([^'"\n#]+)/g)) {
        const g = item[1]?.trim();
        if (g) pathFilterGlobs.push(g);
      }
    }
  }

  const uniqueGlobs = [...new Set(pathFilterGlobs)];
  for (const glob of uniqueGlobs) {
    const { matches, truncated } = matchAnywhere(
      [glob],
      allPaths,
      SOFT_MATCH_CAP,
    );
    if (truncated) {
      state.truncated = true;
      state.notes.push(`CI path filter capped for ${configPath}`);
    }
    for (const to of matches) {
      if (to === configPath) continue;
      pushEdge(
        edges,
        {
          from: configPath,
          to,
          lane: "ci",
          reason: isAzure
            ? "Azure pipelines path filter"
            : "CI paths / paths-ignore filter",
          confidence: "medium",
          evidence: [`${base}#paths`, `glob: ${glob}`],
          category: "config",
        },
        seen,
      );
    }
  }

  for (const m of source.matchAll(
    /(?:working[-_]?directory|workingDirectory)\s*:\s*['"]?([^\s'"#\n]+)/gi,
  )) {
    const wd = m[1]?.trim();
    if (!wd) continue;
    const resolved = resolveInventoryPath("", wd, allPaths);
    const targets = resolved
      ? [resolved]
      : allPaths.filter((p) => p === wd || p.startsWith(`${wd}/`)).slice(0, 40);
    for (const to of targets) {
      if (to === configPath) continue;
      pushEdge(
        edges,
        {
          from: configPath,
          to,
          lane: "ci",
          reason: "CI working-directory",
          confidence: "medium",
          evidence: [`${base}#working-directory`, wd],
          category: "config",
        },
        seen,
      );
    }
  }

  // run: blocks — path-like tokens (best-effort)
  for (const m of source.matchAll(
    /\brun\s*:\s*\|?\s*([\s\S]*?)(?=\n\s{0,4}\w[\w-]*\s*:|\n\s*-\s+\w|$)/gi,
  )) {
    const body = (m[1] ?? "").slice(0, 2000);
    for (const token of extractPathLikeTokens(body)) {
      if (token.includes("*")) {
        const { matches } = matchAnywhere([token], allPaths, 30);
        for (const to of matches) {
          pushEdge(
            edges,
            {
              from: configPath,
              to,
              lane: "ci",
              reason: "CI run step path pattern",
              confidence: "low",
              evidence: [`${base}#run`, `pattern: ${token}`],
              category: "config",
            },
            seen,
          );
        }
      } else {
        const resolved = resolveInventoryPath("", token, allPaths);
        if (!resolved) continue;
        pushEdge(
          edges,
          {
            from: configPath,
            to: resolved,
            lane: "ci",
            reason: "CI run step references path",
            confidence: "low",
            evidence: [`${base}#run`, `path: ${token}`],
            category: "config",
          },
          seen,
        );
      }
    }
  }

  let substringCount = 0;
  for (const candidate of allPaths) {
    if (substringCount >= SOFT_SUBSTRING_CAP) {
      state.truncated = true;
      state.notes.push(
        `CI substring matches capped at ${SOFT_SUBSTRING_CAP} for ${configPath}`,
      );
      break;
    }
    if (candidate === configPath || candidate.length < 8) continue;
    if (!source.includes(candidate)) continue;
    const already = edges.some(
      (e) => e.from === configPath && e.to === candidate,
    );
    if (already) continue;
    substringCount++;
    pushEdge(
      edges,
      {
        from: configPath,
        to: candidate,
        lane: "ci",
        reason: "referenced in CI workflow",
        confidence: "low",
        evidence: [`${base} mentions ${candidate}`],
        category: "config",
      },
      seen,
    );
  }
}

/** Best-effort Jenkinsfile path mentions (Groovy / shell steps). */
export function parseJenkinsfile(
  configPath: string,
  source: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const base = basenameOf(configPath);

  for (const token of extractPathLikeTokens(source)) {
    if (token.includes("*") || token.includes("?")) {
      const { matches, truncated } = matchAnywhere(
        [token],
        allPaths,
        Math.min(80, SOFT_MATCH_CAP),
      );
      if (truncated) {
        state.truncated = true;
        state.notes.push(`Jenkinsfile glob capped for ${configPath}`);
      }
      for (const to of matches) {
        if (to === configPath) continue;
        pushEdge(
          edges,
          {
            from: configPath,
            to,
            lane: "ci",
            reason: "Jenkinsfile path pattern",
            confidence: "low",
            evidence: [`${base}`, `pattern: ${token}`],
            category: "config",
          },
          seen,
        );
      }
    } else {
      const resolved = resolveInventoryPath("", token, allPaths);
      if (!resolved || resolved === configPath) continue;
      pushEdge(
        edges,
        {
          from: configPath,
          to: resolved,
          lane: "ci",
          reason: "Jenkinsfile references path",
          confidence: "medium",
          evidence: [`${base}`, `path: ${token}`],
          category: "config",
        },
        seen,
      );
    }
  }

  // Quoted path-like strings: 'packages/foo/…', "src/…"
  for (const m of source.matchAll(
    /['"]((?:\.\/)?(?:src|apps|packages|lib|scripts|test|tests|\.github)\/[^'"]{2,120})['"]/g,
  )) {
    const raw = m[1];
    if (!raw) continue;
    const resolved = resolveInventoryPath("", raw, allPaths);
    if (!resolved || resolved === configPath) continue;
    pushEdge(
      edges,
      {
        from: configPath,
        to: resolved,
        lane: "ci",
        reason: "Jenkinsfile string path mention",
        confidence: "low",
        evidence: [`${base}`, raw],
        category: "config",
      },
      seen,
    );
  }

  let count = 0;
  for (const candidate of allPaths) {
    if (count >= SOFT_SUBSTRING_CAP) {
      state.truncated = true;
      state.notes.push(`Jenkinsfile substring capped for ${configPath}`);
      break;
    }
    if (candidate === configPath || candidate.length < 8) continue;
    if (!source.includes(candidate)) continue;
    const already = edges.some(
      (e) => e.from === configPath && e.to === candidate,
    );
    if (already) continue;
    count++;
    pushEdge(
      edges,
      {
        from: configPath,
        to: candidate,
        lane: "ci",
        reason: "referenced in Jenkinsfile",
        confidence: "low",
        evidence: [`${base} mentions ${candidate}`],
        category: "config",
      },
      seen,
    );
  }
}

export function parseEslintConfig(
  configPath: string,
  source: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const dir = dirnamePosix(configPath);
  const base = basenameOf(configPath);
  const globs = [
    ...extractStringArrayProp(source, "files"),
    ...extractStringArrayProp(source, "ignores"),
    ...extractStringArrayProp(source, "ignorePatterns"),
  ];
  if (globs.length === 0) {
    try {
      const json = JSON.parse(stripJsonc(source)) as {
        ignorePatterns?: string[];
        overrides?: Array<{ files?: string[] }>;
      };
      if (json.ignorePatterns) globs.push(...json.ignorePatterns);
      for (const o of json.overrides ?? []) {
        if (o.files) globs.push(...o.files);
      }
    } catch {
      /* not JSON */
    }
  }
  if (globs.length === 0) return;

  const { matches, truncated } = matchUnderDir(
    dir,
    globs,
    allPaths,
    SOFT_MATCH_CAP,
  );
  if (truncated) {
    state.truncated = true;
    state.notes.push(`eslint soft matches capped for ${configPath}`);
  }
  for (const to of matches) {
    if (to === configPath) continue;
    pushEdge(
      edges,
      {
        from: configPath,
        to,
        lane: "config",
        reason: "matched by ESLint files/ignores",
        confidence: "medium",
        evidence: [
          `${base}#files|ignores`,
          ...globs.slice(0, 3).map((g) => `glob: ${g}`),
        ],
        category: "config",
      },
      seen,
    );
  }
}

/**
 * Prettier dialect: top-level rarely has `files`; overrides use
 * `overrides: [{ files: "...", options }]` and `.prettierignore` is line globs.
 */
export function parsePrettierConfig(
  configPath: string,
  source: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const dir = dirnamePosix(configPath);
  const base = basenameOf(configPath);
  const globs: string[] = [];

  if (base === ".prettierignore") {
    for (const line of source.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      globs.push(t);
    }
  } else {
    // overrides: [{ files: "…" | ["…"], … }]
    for (const m of source.matchAll(/overrides\s*[:=]\s*\[([\s\S]*?)\]/g)) {
      const body = m[1] ?? "";
      globs.push(...extractStringArrayProp(body, "files"));
      // JSON-style "files": "pattern" or array already covered; also bare
      for (const fm of body.matchAll(
        /files\s*[:=]\s*(?:\[([^\]]*)\]|['"`]([^'"`]+)['"`])/g,
      )) {
        if (fm[2]) globs.push(fm[2]);
        for (const sm of (fm[1] ?? "").matchAll(/['"`]([^'"`]+)['"`]/g)) {
          if (sm[1]) globs.push(sm[1]);
        }
      }
    }
    try {
      const json = JSON.parse(stripJsonc(source)) as {
        overrides?: Array<{ files?: string | string[] }>;
      };
      for (const o of json.overrides ?? []) {
        if (typeof o.files === "string") globs.push(o.files);
        else if (Array.isArray(o.files)) globs.push(...o.files);
      }
    } catch {
      /* JS/CJS config — regex already applied */
    }
  }

  const unique = [...new Set(globs)];
  if (unique.length === 0) {
    // Default Prettier scope: common source extensions under the config dir
    unique.push("**/*.{js,jsx,ts,tsx,mjs,cjs,json,md,yml,yaml,css}");
    state.notes.push(
      `${configPath}: no overrides.files — using default Prettier extension globs`,
    );
  }

  const { matches, truncated } = matchUnderDir(
    dir,
    unique,
    allPaths,
    SOFT_MATCH_CAP,
  );
  if (truncated) {
    state.truncated = true;
    state.notes.push(`prettier soft matches capped for ${configPath}`);
  }
  for (const to of matches) {
    if (to === configPath) continue;
    pushEdge(
      edges,
      {
        from: configPath,
        to,
        lane: "config",
        reason:
          base === ".prettierignore"
            ? "matched by .prettierignore"
            : "matched by Prettier overrides.files",
        confidence: base === ".prettierignore" ? "medium" : "medium",
        evidence: [
          `${base}#files|overrides`,
          ...unique.slice(0, 3).map((g) => `glob: ${g}`),
        ],
        category: "config",
      },
      seen,
    );
  }
}

export function parseBundlerConfig(
  configPath: string,
  source: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const dir = dirnamePosix(configPath);
  const base = basenameOf(configPath);
  const kind = /^vite\./i.test(base)
    ? "vite"
    : /^webpack\./i.test(base)
      ? "webpack"
      : "next";

  const paths: string[] = [];
  for (const prop of ["root", "input", "entry", "entryFileNames"]) {
    paths.push(...extractStringArrayProp(source, prop));
  }
  for (const m of source.matchAll(/(?:entry|input)\s*:\s*\{([^}]{0,800})\}/g)) {
    for (const sm of (m[1] ?? "").matchAll(/['"`]([^'"`]+)['"`]/g)) {
      if (sm[1]?.includes("/") || sm[1]?.startsWith(".")) paths.push(sm[1]);
    }
  }

  if (kind === "next") {
    for (const heur of ["app", "pages", "src/app", "src/pages"]) {
      const abs = joinPosix(dir, heur);
      if (allPaths.some((p) => p === abs || p.startsWith(`${abs}/`))) {
        paths.push(heur);
      }
    }
  }
  if (kind === "vite" && paths.length === 0) {
    if (allPaths.includes(joinPosix(dir, "index.html"))) {
      paths.push("index.html");
    }
    const srcPrefix = dir ? `${dir}/src/` : "src/";
    if (allPaths.some((p) => p.startsWith(srcPrefix))) {
      paths.push("src");
    }
  }

  for (const raw of paths) {
    if (raw.includes("*") || raw.includes("?")) {
      const { matches, truncated } = matchUnderDir(
        dir,
        [raw],
        allPaths,
        SOFT_MATCH_CAP,
      );
      if (truncated) {
        state.truncated = true;
        state.notes.push(`bundler glob capped for ${configPath}`);
      }
      for (const to of matches) {
        if (to === configPath) continue;
        pushEdge(
          edges,
          {
            from: configPath,
            to,
            lane: "config",
            reason: `${kind} config entry/root pattern`,
            confidence: "medium",
            evidence: [`${base}`, `pattern: ${raw}`],
            category: "config",
          },
          seen,
        );
      }
    } else {
      const resolved = resolveInventoryPath(dir, raw, allPaths);
      const targets: string[] = [];
      if (resolved) {
        targets.push(resolved);
      } else {
        const pref = joinPosix(dir, raw.replace(/^\.\//, ""));
        for (const p of allPaths) {
          if (p === pref || p.startsWith(`${pref}/`)) targets.push(p);
          if (targets.length >= 80) break;
        }
      }
      for (const to of targets) {
        if (to === configPath) continue;
        pushEdge(
          edges,
          {
            from: configPath,
            to,
            lane: "config",
            reason: `${kind} config entry/root`,
            confidence: "medium",
            evidence: [`${base}`, raw],
            category: "config",
          },
          seen,
        );
      }
    }
  }
}

export function parseEnvFile(
  configPath: string,
  source: string,
  fileContents: Map<string, string>,
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const keys: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m?.[1]) keys.push(m[1]);
  }
  if (keys.length === 0) return;

  const sourceFiles = [...fileContents.keys()].filter((p) =>
    /\.[cm]?[jt]sx?$/i.test(p),
  );

  for (const key of keys.slice(0, 80)) {
    let matches = 0;
    for (const file of sourceFiles) {
      if (matches >= SOFT_ENV_KEY_CAP) {
        state.truncated = true;
        state.notes.push(
          `env key matches capped at ${SOFT_ENV_KEY_CAP} for ${key} in ${configPath}`,
        );
        break;
      }
      if (file === configPath) continue;
      const text = fileContents.get(file);
      if (!text) continue;
      const simpleHit =
        text.includes(`process.env.${key}`) ||
        text.includes(`import.meta.env.${key}`) ||
        text.includes(`Deno.env.get("${key}")`) ||
        text.includes(`Deno.env.get('${key}')`);
      if (!simpleHit) continue;
      matches++;
      pushEdge(
        edges,
        {
          from: configPath,
          to: file,
          lane: "env",
          reason: `reads env key ${key}`,
          confidence: "medium",
          evidence: [`.env key ${key}`, file],
          category: "runtime",
        },
        seen,
      );
    }
  }
}

/** Reverse: source that reads env keys → soft edge to .env files. */
export function parseSourceEnvReverse(
  sourcePath: string,
  source: string,
  envFiles: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
): void {
  const keys = new Set<string>();
  for (const m of source.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (m[1]) keys.add(m[1]);
  }
  for (const m of source.matchAll(
    /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  )) {
    if (m[1]) keys.add(m[1]);
  }
  if (keys.size === 0 || envFiles.length === 0) return;

  for (const envFile of envFiles.slice(0, 5)) {
    pushEdge(
      edges,
      {
        from: sourcePath,
        to: envFile,
        lane: "env",
        reason: "source reads process.env / import.meta.env keys",
        confidence: "low",
        evidence: [
          `${basenameOf(sourcePath)} env access`,
          ...[...keys].slice(0, 5).map((k) => `key: ${k}`),
          envFile,
        ],
        category: "runtime",
      },
      seen,
    );
  }
}

export function parseTaskGraph(
  configPath: string,
  source: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const base = basenameOf(configPath);
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(stripJsonc(source)) as Record<string, unknown>;
  } catch {
    json = null;
  }

  const pathPatterns: string[] = [];
  const collectFromTask = (task: unknown) => {
    if (!task || typeof task !== "object") return;
    const t = task as Record<string, unknown>;
    for (const field of ["inputs", "outputs", "dependsOn"] as const) {
      const v = t[field];
      if (!Array.isArray(v)) continue;
      for (const item of v) {
        if (typeof item !== "string") continue;
        const cleaned = item.replace(/^\^/, "");
        if (cleaned.includes("/") || cleaned.includes("*")) {
          pathPatterns.push(cleaned);
        }
      }
    }
    // Nx options.outputPath / main / etc.
    const options = t.options;
    if (options && typeof options === "object") {
      for (const leaf of collectStringLeaves(options)) {
        if (
          (leaf.includes("/") || leaf.startsWith(".")) &&
          !leaf.startsWith("http") &&
          leaf.length < 200
        ) {
          pathPatterns.push(leaf);
        }
      }
    }
  };

  if (json) {
    const pipeline =
      (json.pipeline as Record<string, unknown> | undefined) ??
      (json.tasks as Record<string, unknown> | undefined) ??
      null;
    if (pipeline && typeof pipeline === "object") {
      for (const task of Object.values(pipeline)) collectFromTask(task);
    }
    if (json.targetDefaults && typeof json.targetDefaults === "object") {
      for (const task of Object.values(
        json.targetDefaults as Record<string, unknown>,
      )) {
        collectFromTask(task);
      }
    }
    // Nx project.json: { targets: { build: { inputs, outputs, options } } }
    if (json.targets && typeof json.targets === "object") {
      for (const task of Object.values(
        json.targets as Record<string, unknown>,
      )) {
        collectFromTask(task);
      }
    }
    // Nx namedInputs at project/root level
    if (json.namedInputs && typeof json.namedInputs === "object") {
      for (const v of Object.values(
        json.namedInputs as Record<string, unknown>,
      )) {
        if (Array.isArray(v)) {
          for (const item of v) {
            if (
              typeof item === "string" &&
              (item.includes("/") || item.includes("*"))
            ) {
              pathPatterns.push(item);
            }
          }
        }
      }
    }
    // sourceRoot / root fields on project.json
    for (const field of ["sourceRoot", "root"] as const) {
      const v = json[field];
      if (typeof v === "string" && v.length > 0) pathPatterns.push(v);
    }
  }

  for (const pattern of pathPatterns) {
    const cleaned = pattern.replace(/^\.\//, "");
    if (cleaned.includes("*") || cleaned.includes("?")) {
      const { matches, truncated } = matchAnywhere(
        [cleaned],
        allPaths,
        SOFT_MATCH_CAP,
      );
      if (truncated) {
        state.truncated = true;
        state.notes.push(`task graph matches capped for ${configPath}`);
      }
      for (const to of matches) {
        if (to === configPath) continue;
        pushEdge(
          edges,
          {
            from: configPath,
            to,
            lane: "config",
            reason: "task graph inputs/outputs path pattern",
            confidence: "medium",
            evidence: [`${base}#inputs|outputs`, `pattern: ${pattern}`],
            category: "config",
          },
          seen,
        );
      }
    } else {
      const resolved = resolveInventoryPath(
        dirnamePosix(configPath),
        cleaned,
        allPaths,
      );
      const targets: string[] = [];
      if (resolved) {
        targets.push(resolved);
      } else {
        for (const p of allPaths) {
          if (p === cleaned || p.startsWith(`${cleaned}/`)) targets.push(p);
          if (targets.length >= 80) break;
        }
      }
      for (const to of targets) {
        if (to === configPath) continue;
        pushEdge(
          edges,
          {
            from: configPath,
            to,
            lane: "config",
            reason: "task graph inputs/outputs path",
            confidence: "medium",
            evidence: [`${base}`, pattern],
            category: "config",
          },
          seen,
        );
      }
    }
  }

  let count = 0;
  for (const candidate of allPaths) {
    if (count >= SOFT_SUBSTRING_CAP) {
      state.truncated = true;
      state.notes.push(`task graph substring capped for ${configPath}`);
      break;
    }
    if (candidate === configPath || candidate.length < 8) continue;
    if (!source.includes(candidate)) continue;
    const already = edges.some(
      (e) => e.from === configPath && e.to === candidate,
    );
    if (already) continue;
    count++;
    pushEdge(
      edges,
      {
        from: configPath,
        to: candidate,
        lane: "config",
        reason: "referenced in task graph config",
        confidence: "low",
        evidence: [`${base} mentions ${candidate}`],
        category: "config",
      },
      seen,
    );
  }
}

/**
 * Advisory only: when blasting package.json, note nearby lockfiles without
 * exploding soft fan-out into every lockfile line.
 */
export function adviseLockfilesForPackageJson(
  packageJsonPath: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const dir = dirnamePosix(packageJsonPath);
  const lockfiles = allPaths.filter((p) => {
    const base = basenameOf(p);
    if (
      !(
        base === "package-lock.json" ||
        base === "yarn.lock" ||
        base === "pnpm-lock.yaml" ||
        base === "bun.lock" ||
        base === "bun.lockb" ||
        base === "npm-shrinkwrap.json"
      )
    ) {
      return false;
    }
    const lockDir = dirnamePosix(p);
    return lockDir === dir || (dir === "" && !lockDir.includes("/"));
  });
  if (lockfiles.length === 0) return;

  const names = lockfiles.map((p) => basenameOf(p)).sort();
  state.notes.push(
    `Lockfile advisory for ${packageJsonPath}: ${names.join(", ")} present — dependency installs pin versions here; soft blast does not expand lockfile contents.`,
  );

  // Single summary soft edge to the first lockfile (not every dep line)
  const primary = lockfiles.sort()[0]!;
  pushEdge(
    edges,
    {
      from: packageJsonPath,
      to: primary,
      lane: "package",
      reason: "lockfile pins dependencies for this package manifest",
      confidence: "low",
      evidence: ["lockfile-advisory", ...names.map((n) => `lockfile: ${n}`)],
      category: "config",
    },
    seen,
  );
}

/**
 * Cheap string/path refs + static `import("…")` soft enrichment from source text.
 */
export function parseSourceUsageRefs(
  sourcePath: string,
  source: string,
  allPaths: readonly string[],
  edges: SoftImpactEdge[],
  seen: Set<string>,
  state: SoftParseState,
): void {
  const dir = dirnamePosix(sourcePath);
  let hits = 0;
  const cap = 25;

  // Static import() strings
  for (const m of source.matchAll(/\bimport\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g)) {
    const spec = m[2];
    if (!spec || spec.includes("${")) continue;
    const resolved = resolveInventoryPath(dir, spec, allPaths);
    if (!resolved || resolved === sourcePath) continue;
    if (hits >= cap) {
      state.truncated = true;
      state.notes.push(`usage-ref soft matches capped for ${sourcePath}`);
      break;
    }
    hits++;
    pushEdge(
      edges,
      {
        from: sourcePath,
        to: resolved,
        lane: "import",
        reason: "dynamic import() static string",
        confidence: "high",
        evidence: [`import('${spec}')`],
        category: "import",
      },
      seen,
    );
  }

  // Relative path string literals that resolve to inventory (low confidence).
  // Skip typical ESM import rewrites (./foo.js) — those belong on the hard graph.
  for (const m of source.matchAll(/(['"`])(\.\.?\/[^'"`\n]{2,160})\1/g)) {
    if (hits >= cap) break;
    const raw = m[2];
    if (!raw || raw.includes("${") || raw.includes("*")) continue;
    if (/\.(css|scss|sass|less|svg|png|jpg|gif|webp)$/i.test(raw)) continue;
    if (/\.[cm]?[jt]sx?$/i.test(raw)) continue;
    const resolved = resolveInventoryPath(dir, raw, allPaths);
    if (!resolved || resolved === sourcePath) continue;
    const already = edges.some(
      (e) => e.from === sourcePath && e.to === resolved,
    );
    if (already) continue;
    hits++;
    pushEdge(
      edges,
      {
        from: sourcePath,
        to: resolved,
        lane: "alias",
        reason: "string path reference",
        confidence: "low",
        evidence: [`string: '${raw}'`],
        category: "runtime",
      },
      seen,
    );
  }
}
