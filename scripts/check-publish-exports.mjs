/**
 * Stop publishing a package that imports names its dependency does not export.
 *
 * The 1.8.0 MCP crash was this: dispatch-hub imported `formatDuration` from
 * `@repo-prism/shared`, but shared@1.1.1 was already on npm without that
 * export, so `publish-npm` skipped shared and shipped a broken pair.
 *
 * Two checks:
 * 1. Local graph — every named `@repo-prism/*` import in dist must exist on
 *    the dependency's local dist entry (no network).
 * 2. `--against-npm` — packages whose version is *not* on npm (this run will
 *    publish them) must not import names missing from a *skipped* dependency
 *    (same version already on npm). Local packages grow without a bump all
 *    the time; the poison is shipping a consumer against a frozen provider.
 *
 *   bun run scripts/check-publish-exports.mjs
 *   bun run scripts/check-publish-exports.mjs --against-npm
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PUBLISH_ORDER = [
  "shared",
  "analyzer",
  "graph-engine",
  "impact",
  "navigation",
  "indexer",
  "intelligence",
  "repository-map",
  "core",
  "dispatch",
  "host-session",
  "dispatch-hub",
  "mcp-server",
  "cli",
  "plugin",
];

const NAMED_IMPORT =
  /(?:import|export)\s+(type\s+)?\{([^}]+)\}\s+from\s+["'](@repo-prism\/[a-z0-9-]+(?:\/[A-Za-z0-9._-]+)?)["']/g;

export function parseSpecifiers(block) {
  return block
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith("type "))
    .map((part) => part.split(/\s+as\s+/)[0]?.trim() ?? "")
    .filter((name) => name.length > 0);
}

/**
 * Named value imports/re-exports of `@repo-prism/*`. Type-only imports are
 * erased at runtime and cannot crash `npx`, so they are ignored.
 */
export function namedWorkspaceImports(source) {
  const found = [];
  const matcher = new RegExp(NAMED_IMPORT.source, "g");
  for (const match of source.matchAll(matcher)) {
    if (match[1]) continue;
    const from = match[3];
    if (!from) continue;
    for (const name of parseSpecifiers(match[2] ?? "")) {
      found.push({ name, from });
    }
  }
  return found;
}

export function parseWorkspaceSpecifier(from) {
  const match = /^@repo-prism\/([a-z0-9-]+)(?:\/(.*))?$/.exec(from);
  if (!match) return undefined;
  return { folder: match[1], subpath: match[2] ?? "" };
}

const RELATIVE_IMPORT = /from\s+["'](\.[^"']+)["']/g;

function resolveRelative(fromFile, spec) {
  const href = pathToFileURL(fromFile).href;
  const resolved = new URL(
    spec.endsWith(".js") || spec.endsWith(".mjs") ? spec : `${spec}.js`,
    href,
  );
  return fileURLToPath(resolved);
}

function packageEntries(pkgDir) {
  const pkg = readPkg(pkgDir);
  const entries = [];
  if (pkg.exports) {
    for (const target of Object.values(pkg.exports)) {
      const importPath =
        typeof target === "string"
          ? target
          : target && typeof target === "object"
            ? target.import
            : undefined;
      if (typeof importPath === "string") {
        entries.push(join(pkgDir, importPath));
      }
    }
  }
  if (pkg.bin) {
    for (const binPath of Object.values(
      typeof pkg.bin === "string" ? { default: pkg.bin } : pkg.bin,
    )) {
      if (typeof binPath === "string") entries.push(join(pkgDir, binPath));
    }
  }
  if (entries.length === 0) {
    entries.push(join(pkgDir, "dist", "index.js"));
  }
  return [...new Set(entries.filter((path) => existsSync(path)))];
}

function reachableJsFiles(pkgDir) {
  const queue = packageEntries(pkgDir);
  const seen = new Set();
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      new RegExp(RELATIVE_IMPORT.source, "g"),
    )) {
      const spec = match[1];
      if (!spec) continue;
      queue.push(resolveRelative(file, spec));
    }
  }
  return [...seen];
}

function readPkg(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

function resolveExportFile(pkgDir, subpath) {
  const pkg = readPkg(pkgDir);
  const key = subpath ? `./${subpath}` : ".";
  const target = pkg.exports?.[key] ?? pkg.exports?.["."];
  const importPath =
    typeof target === "string"
      ? target
      : target && typeof target === "object"
        ? target.import
        : undefined;
  if (typeof importPath !== "string") {
    return join(pkgDir, "dist", "index.js");
  }
  return join(pkgDir, importPath);
}

const EXPORT_LIST =
  /export\s+(type\s+)?\{([^}]+)\}\s*(?:from\s+["']([^"']+)["'])?/g;
const EXPORT_DECL =
  /export\s+(?:async\s+)?(?:function(?:\s+\*)?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_STAR = /export\s+\*\s+from\s+["']([^"']+)["']/g;

export function staticExportedNames(entry) {
  if (!existsSync(entry)) {
    throw new Error(`missing entry ${entry} — run bun run build first`);
  }
  const names = new Set();
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(new RegExp(EXPORT_LIST.source, "g"))) {
      if (match[1]) continue;
      for (const name of parseSpecifiers(match[2] ?? "")) {
        names.add(name);
      }
    }
    for (const match of source.matchAll(new RegExp(EXPORT_DECL.source, "g"))) {
      if (match[1]) names.add(match[1]);
    }
    for (const match of source.matchAll(new RegExp(EXPORT_STAR.source, "g"))) {
      const spec = match[1];
      if (spec?.startsWith(".")) queue.push(resolveRelative(file, spec));
    }
  }
  return names;
}

function npmViewVersion(name, version) {
  const result = spawnSync("npm", ["view", `${name}@${version}`, "version"], {
    encoding: "utf8",
    env: process.env,
  });
  return result.status === 0 && result.stdout.trim() === version;
}

export async function collectLocalGraphProblems(root) {
  const problems = [];
  for (const folder of PUBLISH_ORDER) {
    const pkgDir = join(root, "packages", folder);
    const dist = join(pkgDir, "dist");
    if (!existsSync(dist)) continue;
    for (const file of reachableJsFiles(pkgDir)) {
      const source = readFileSync(file, "utf8");
      for (const item of namedWorkspaceImports(source)) {
        const spec = parseWorkspaceSpecifier(item.from);
        if (!spec || !PUBLISH_ORDER.includes(spec.folder)) continue;
        const depDir = join(root, "packages", spec.folder);
        const entry = resolveExportFile(depDir, spec.subpath);
        let names;
        try {
          names = staticExportedNames(entry);
        } catch (cause) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          problems.push(
            `${relative(root, file)}: cannot load ${item.from} (${detail})`,
          );
          continue;
        }
        if (!names.has(item.name)) {
          problems.push(
            `${relative(root, file)}: ${item.from} does not export '${item.name}'`,
          );
        }
      }
    }
  }
  return problems;
}

/**
 * Imports from packages that this publish will skip must exist on the
 * published tarball, not only on local dist.
 *
 * @param {Array<{ file: string, name: string, from: string }>} imports
 * @param {Map<string, { name: string, version: string, publish: boolean }>} packagesByFolder
 * @param {(folder: string, subpath: string) => Set<string>} publishedNames
 */
export function skippedDepSkewProblems(
  imports,
  packagesByFolder,
  publishedNames,
) {
  const problems = [];
  for (const item of imports) {
    const spec = parseWorkspaceSpecifier(item.from);
    if (!spec) continue;
    const dep = packagesByFolder.get(spec.folder);
    if (!dep || dep.publish) continue;
    const names = publishedNames(spec.folder, spec.subpath);
    if (!names.has(item.name)) {
      problems.push(
        `${item.file}: ${item.from}@${dep.version} on npm does not export '${item.name}'. Bump ${dep.name} before publishing this package.`,
      );
    }
  }
  return problems;
}

export function collectStalePublishProblems(root) {
  const packagesByFolder = new Map();
  for (const folder of PUBLISH_ORDER) {
    const pkgDir = join(root, "packages", folder);
    const pkg = readPkg(pkgDir);
    packagesByFolder.set(folder, {
      name: pkg.name,
      version: pkg.version,
      publish: !npmViewVersion(pkg.name, pkg.version),
    });
  }

  const packed = new Map();
  const namesCache = new Map();
  const publishedNames = (folder, subpath) => {
    const cacheKey = `${folder}#${subpath}`;
    const cached = namesCache.get(cacheKey);
    if (cached) return cached;
    const dep = packagesByFolder.get(folder);
    if (!dep) return new Set();
    const packKey = `${dep.name}@${dep.version}`;
    let pkgDir = packed.get(packKey);
    if (!pkgDir) {
      pkgDir = extractPublishedPackage(dep.name, dep.version);
      packed.set(packKey, pkgDir);
    }
    const names = staticExportedNames(resolveExportFile(pkgDir, subpath));
    namesCache.set(cacheKey, names);
    return names;
  };

  try {
    const imports = [];
    for (const folder of PUBLISH_ORDER) {
      const meta = packagesByFolder.get(folder);
      if (!meta?.publish) continue;
      const pkgDir = join(root, "packages", folder);
      if (!existsSync(join(pkgDir, "dist"))) continue;
      for (const file of reachableJsFiles(pkgDir)) {
        const source = readFileSync(file, "utf8");
        for (const item of namedWorkspaceImports(source)) {
          imports.push({
            file: relative(root, file),
            name: item.name,
            from: item.from,
          });
        }
      }
    }
    return skippedDepSkewProblems(imports, packagesByFolder, publishedNames);
  } finally {
    for (const dir of packed.values()) {
      rmSync(dirname(dir), { recursive: true, force: true });
    }
  }
}

function extractPublishedPackage(name, version) {
  const scratch = mkdtempSync(join(tmpdir(), "prism-exports-"));
  const packed = spawnSync(
    "npm",
    ["pack", `${name}@${version}`, "--pack-destination", scratch],
    { encoding: "utf8", env: process.env },
  );
  if (packed.status !== 0) {
    rmSync(scratch, { recursive: true, force: true });
    throw new Error(
      `npm pack ${name}@${version} failed: ${packed.stderr || packed.stdout}`,
    );
  }
  const tgz = readdirSync(scratch).find((file) => file.endsWith(".tgz"));
  if (!tgz) {
    rmSync(scratch, { recursive: true, force: true });
    throw new Error(`npm pack ${name}@${version} produced no tarball`);
  }
  const extracted = spawnSync("tar", ["-xzf", tgz], {
    cwd: scratch,
    encoding: "utf8",
  });
  if (extracted.status !== 0) {
    rmSync(scratch, { recursive: true, force: true });
    throw new Error(`tar xf ${tgz} failed: ${extracted.stderr}`);
  }
  return join(scratch, "package");
}

export async function assertPublishable(options) {
  const root = options.root;
  const problems = await collectLocalGraphProblems(root);
  if (options.againstNpm) {
    problems.push(...collectStalePublishProblems(root));
  }
  if (problems.length > 0) {
    const error = new Error(
      `publish export check failed:\n  ${problems.join("\n  ")}`,
    );
    error.problems = problems;
    throw error;
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const againstNpm = process.argv.includes("--against-npm");
  try {
    await assertPublishable({ root, againstNpm });
    console.log(
      againstNpm
        ? "check-publish-exports: local graph and npm versions ok"
        : "check-publish-exports: local graph ok",
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(message);
    process.exit(1);
  }
}
