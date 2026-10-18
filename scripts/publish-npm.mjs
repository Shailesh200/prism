/**
 * Publish the two public npm packages.
 *
 * `@prismapp/cli` and `@prismapp/mcp-server` are the registry packages.
 * The other libraries stay folders in this repo and are packed inside those
 * two tarballs (`bundleDependencies`). Their native dependencies
 * (`better-sqlite3`, `oxc-parser`) stay normal dependencies so npm installs
 * the right binary. Package.json files in the repo keep `workspace:*`.
 *
 * Usage:
 *   node scripts/publish-npm.mjs --dry-run
 *   node scripts/publish-npm.mjs
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPublishable } from "./check-publish-exports.mjs";

/** Registry packages, server first so the CLI can depend on it. */
export const ORDER = ["mcp-server", "cli"];

/** Names on npm. Workspace folders stay `@repo-prism/*` and are bundled. */
const REGISTRY_NAME = {
  cli: "@prismapp/cli",
  "mcp-server": "@prismapp/mcp-server",
};

const dryRun = process.argv.includes("--dry-run");
const root = process.cwd();

function fail(message) {
  console.error(`publish-npm: ${message}`);
  process.exit(1);
}

function readPkg(dir) {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

function writePkg(dir, pkg) {
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
}

function folderOf(name) {
  const match = /^@repo-prism\/([a-z0-9-]+)$/.exec(name);
  if (!match) fail(`not a workspace package: ${name}`);
  return match[1];
}

function workspaceDeps(pkg) {
  return Object.entries(pkg.dependencies ?? {})
    .filter(
      ([name, spec]) =>
        name.startsWith("@repo-prism/") &&
        String(spec).startsWith("workspace:"),
    )
    .map(([name]) => name);
}

/** Workspace packages this package needs, including the other published one. */
export function bundledClosure(rootDir, folder) {
  const self = `@repo-prism/${folder}`;
  const seen = new Set();
  const walk = (name) => {
    if (name === self || seen.has(name)) return;
    seen.add(name);
    const pkg = readPkg(join(rootDir, "packages", folderOf(name)));
    for (const dep of workspaceDeps(pkg)) walk(dep);
  };
  const pkg = readPkg(join(rootDir, "packages", folder));
  for (const dep of workspaceDeps(pkg)) walk(dep);
  return [...seen].sort();
}

function thirdPartyDeps(rootDir, names) {
  const deps = {};
  for (const name of names) {
    const pkg = readPkg(join(rootDir, "packages", folderOf(name)));
    for (const [dep, spec] of Object.entries(pkg.dependencies ?? {})) {
      if (dep.startsWith("@repo-prism/")) continue;
      if (deps[dep] !== undefined && deps[dep] !== spec) {
        fail(`${dep} is ${deps[dep]} and ${spec}`);
      }
      deps[dep] = spec;
    }
  }
  return deps;
}

function bundledManifest(pkg) {
  return {
    name: pkg.name,
    version: pkg.version,
    ...(pkg.type ? { type: pkg.type } : {}),
    ...(pkg.description ? { description: pkg.description } : {}),
    ...(pkg.exports ? { exports: pkg.exports } : {}),
    ...(pkg.bin ? { bin: pkg.bin } : {}),
    license: pkg.license ?? "MIT",
  };
}

function copyDist(from, dest) {
  if (!existsSync(join(from, "dist"))) {
    fail(`${from} has no dist/ — run bun run build first`);
  }
  cpSync(join(from, "dist"), join(dest, "dist"), { recursive: true });
  if (existsSync(join(from, "media"))) {
    cpSync(join(from, "media"), join(dest, "media"), { recursive: true });
  }
  for (const file of ["README.md", "LICENSE"]) {
    if (existsSync(join(from, file)))
      cpSync(join(from, file), join(dest, file));
  }
}

/**
 * A directory npm can publish. Workspace libraries are copied under
 * `node_modules/@repo-prism` and named in `bundleDependencies`.
 */
export function stagePackage(rootDir, folder) {
  const src = join(rootDir, "packages", folder);
  const original = readPkg(src);
  if (original.private === true) fail(`${original.name} is private`);
  // realpath: /var/folders is a symlink, and npm then fails to see node_modules.
  const stage = realpathSync(mkdtempSync(join(tmpdir(), "prism-pack-")));
  copyDist(src, stage);

  const bundled = bundledClosure(rootDir, folder);
  for (const name of bundled) {
    const from = join(rootDir, "packages", folderOf(name));
    const dest = join(stage, "node_modules", "@repo-prism", folderOf(name));
    copyDist(from, dest);
    writePkg(dest, bundledManifest(readPkg(from)));
  }

  const dependencies = {};
  for (const [dep, spec] of Object.entries(original.dependencies ?? {})) {
    if (bundled.includes(dep)) continue;
    if (dep.startsWith("@repo-prism/")) {
      fail(`${original.name} depends on ${dep}, which is not in the bundle`);
    }
    dependencies[dep] = spec;
  }
  // Bundled libraries are also dependencies. npm packs a bundleDependency
  // only when it is an installed dependency edge.
  for (const name of bundled) {
    dependencies[name] = readPkg(
      join(rootDir, "packages", folderOf(name)),
    ).version;
  }
  Object.assign(dependencies, thirdPartyDeps(rootDir, bundled));
  for (const [dep, spec] of Object.entries(dependencies)) {
    if (String(spec).startsWith("workspace:")) {
      fail(`${original.name} still depends on ${dep} via ${spec}`);
    }
  }

  const published = {
    name: REGISTRY_NAME[folder] ?? original.name,
    version: original.version,
    ...(original.type ? { type: original.type } : {}),
    description: original.description,
    ...(original.mcpName ? { mcpName: original.mcpName } : {}),
    ...(original.bin ? { bin: original.bin } : {}),
    ...(original.exports ? { exports: original.exports } : {}),
    ...(original.files ? { files: original.files } : {}),
    dependencies,
    bundleDependencies: bundled,
    engines: original.engines,
    license: original.license,
    repository: original.repository,
    homepage: original.homepage,
    bugs: original.bugs,
    publishConfig: original.publishConfig,
  };
  writePkg(stage, published);
  return { stage, published };
}

/**
 * npm pack leaves `bundleDependencies` out of the tarball. Build the tarball
 * directly so the libraries sit at `package/node_modules/@repo-prism`.
 */
export function packTarball(stage, published) {
  const work = realpathSync(mkdtempSync(join(tmpdir(), "prism-tgz-")));
  const packed = join(work, "package");
  mkdirSync(packed, { recursive: true });
  cpSync(join(stage, "dist"), join(packed, "dist"), { recursive: true });
  if (existsSync(join(stage, "media"))) {
    cpSync(join(stage, "media"), join(packed, "media"), { recursive: true });
  }
  for (const file of ["package.json", "README.md", "LICENSE"]) {
    if (existsSync(join(stage, file)))
      cpSync(join(stage, file), join(packed, file));
  }
  for (const name of published.bundleDependencies) {
    const folder = folderOf(name);
    cpSync(
      join(stage, "node_modules", "@repo-prism", folder),
      join(packed, "node_modules", "@repo-prism", folder),
      { recursive: true },
    );
  }
  const filename = `${published.name.replace(/^@/, "").replace("/", "-")}-${published.version}.tgz`;
  const tarball = join(work, filename);
  // File entries only. macOS tar otherwise adds `._*` forks and a bare
  // `package/` directory, which the registry rejects (415 invalid path).
  const files = [];
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith("._")) continue;
      const abs = join(dir, name);
      const rel = `${prefix}/${name}`;
      if (statSync(abs).isDirectory()) walk(abs, rel);
      else files.push(rel);
    }
  };
  walk(packed, "package");
  const result = spawnSync("tar", ["-czf", tarball, "-C", work, "-T", "-"], {
    encoding: "utf8",
    input: `${files.join("\n")}\n`,
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });
  if (result.status !== 0) {
    fail(`tar failed: ${result.stderr || result.stdout}`);
  }
  return { work, tarball };
}

function npmVersionExists(name, version) {
  const result = spawnSync("npm", ["view", `${name}@${version}`, "version"], {
    encoding: "utf8",
    env: process.env,
  });
  return result.status === 0 && result.stdout.trim() === version;
}

const invokedDirectly =
  process.argv[1] &&
  (process.argv[1].endsWith("publish-npm.mjs") ||
    process.argv[1].endsWith("publish-npm.js"));

if (invokedDirectly) {
  const proof = spawnSync(
    process.execPath,
    [
      join(root, "scripts/bench/release-gate.mjs"),
      ...(process.env.PRISM_RELEASE_BENCH_DIR
        ? ["--current", process.env.PRISM_RELEASE_BENCH_DIR]
        : []),
    ],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  if (proof.status !== 0) {
    fail("release proof gate failed (scripts/bench/release-gate.mjs)");
  }

  await assertPublishable({
    root,
    againstNpm: true,
  });

  for (const folder of ORDER) {
    const original = readPkg(join(root, "packages", folder));
    const registryName = REGISTRY_NAME[folder] ?? original.name;
    if (npmVersionExists(registryName, original.version)) {
      console.log(
        `\n=== skip ${registryName}@${original.version} (already on npm) ===`,
      );
      continue;
    }
    const { stage, published } = stagePackage(root, folder);
    const { work, tarball } = packTarball(stage, published);
    const args = ["publish", tarball, "--access", "public"];
    if (dryRun) args.push("--dry-run");
    console.log(
      `\n=== ${dryRun ? "dry-run " : ""}publish ${published.name}@${published.version} ===`,
    );
    console.log(`    bundles ${published.bundleDependencies.length} libraries`);
    const result = spawnSync("npm", args, {
      stdio: "inherit",
      env: process.env,
    });
    rmSync(stage, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
    if (result.status !== 0) {
      fail(`npm publish failed for ${original.name} (exit ${result.status})`);
    }
  }

  console.log(
    dryRun
      ? "\npublish-npm: dry-run ok"
      : "\npublish-npm: published @prismapp/mcp-server and @prismapp/cli",
  );
}
