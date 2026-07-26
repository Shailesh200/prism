import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const media = join(root, "media");
const webOut = join(dist, "webview");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
mkdirSync(media, { recursive: true });
mkdirSync(webOut, { recursive: true });

const ext = await Bun.build({
  entrypoints: [join(root, "src/extension.ts")],
  outdir: dist,
  target: "node",
  format: "cjs",
  sourcemap: "external",
  naming: "extension.cjs",
  external: ["vscode", "better-sqlite3"],
});

if (!ext.success) {
  console.error(ext.logs);
  process.exit(1);
}

const web = await Bun.build({
  entrypoints: [join(root, "src/webview/app.tsx")],
  outdir: webOut,
  target: "browser",
  format: "esm",
  sourcemap: "external",
  naming: "[name].[ext]",
  minify: true,
});

if (!web.success) {
  console.error(web.logs);
  process.exit(1);
}

const uiDist = join(root, "../ui/dist");
const appShellDist = join(root, "../app-shell/dist");
cpSync(join(uiDist, "tokens.css"), join(dist, "tokens.css"));
cpSync(join(uiDist, "map.css"), join(dist, "map.css"));
cpSync(join(uiDist, "primitives.css"), join(dist, "primitives.css"));
cpSync(
  join(root, "../ui/assets/prism-mark-teal-256.png"),
  join(media, "prism-mark.png"),
);

writeFileSync(
  join(dist, "webview.css"),
  [
    readFileSync(join(root, "src/webview/webview.css"), "utf8"),
    readFileSync(join(uiDist, "primitives.css"), "utf8"),
    readFileSync(join(appShellDist, "styles.css"), "utf8"),
  ].join("\n"),
);

stageNativeModules();
stageOxcParser();
rewriteBundledAbsolutePaths(join(dist, "extension.cjs"));

const webFiles = readdirSync(webOut);
console.log(
  "vscode-extension: built",
  ["extension.cjs", ...webFiles.map((f) => `webview/${f}`)].join(", "),
);

/** Resolve Electron version for Cursor/VS Code native ABI. */
function detectElectronVersion(): string {
  const fromEnv = process.env.PRISM_ELECTRON_VERSION?.trim();
  if (fromEnv) return fromEnv;

  const candidates = [
    "/Applications/Cursor.app/Contents/Frameworks/Electron Framework.framework/Resources/Info.plist",
    "/Applications/Visual Studio Code.app/Contents/Frameworks/Electron Framework.framework/Resources/Info.plist",
  ];
  for (const plist of candidates) {
    if (!existsSync(plist)) continue;
    const text = readFileSync(plist, "utf8");
    const match = text.match(
      /<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/,
    );
    if (match?.[1]) return match[1];
  }
  // Cursor 3.12.x (Electron 40) — safe default for local Extension Host.
  return "40.10.3";
}

function packageRootFrom(name: string, fromPkgJson: string): string {
  const resolver = createRequire(fromPkgJson);
  const entry = resolver.resolve(name);
  let dir = dirname(entry);
  while (dir !== dirname(dir)) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      const parsed = JSON.parse(readFileSync(pkg, "utf8")) as { name?: string };
      if (parsed.name === name) return realpathSync(dir);
    }
    dir = dirname(dir);
  }
  throw new Error(`Could not resolve package root for ${name}`);
}

/**
 * Stage better-sqlite3 under dist/node_modules and install an Electron
 * prebuild so Cursor/VS Code Extension Host can load it — without rewriting
 * the monorepo's Node ABI copy used by indexer tests.
 *
 * Set PRISM_NATIVE_PLATFORM / PRISM_NATIVE_ARCH (e.g. darwin/arm64) when
 * packaging platform-specific VSIX from CI so the .node matches the target OS.
 */
function stageNativeModules(): void {
  const nm = join(dist, "node_modules");
  mkdirSync(nm, { recursive: true });

  const sqliteSrc = packageRootFrom(
    "better-sqlite3",
    join(root, "package.json"),
  );
  const bindingsSrc = packageRootFrom(
    "bindings",
    join(sqliteSrc, "package.json"),
  );
  const fileUriSrc = packageRootFrom(
    "file-uri-to-path",
    join(bindingsSrc, "package.json"),
  );

  cpSync(sqliteSrc, join(nm, "better-sqlite3"), { recursive: true });
  cpSync(bindingsSrc, join(nm, "bindings"), { recursive: true });
  cpSync(fileUriSrc, join(nm, "file-uri-to-path"), { recursive: true });

  const electronVersion = detectElectronVersion();
  const sqliteDest = join(nm, "better-sqlite3");
  rmSync(join(sqliteDest, "build"), { recursive: true, force: true });

  const platform = process.env.PRISM_NATIVE_PLATFORM?.trim();
  const arch = process.env.PRISM_NATIVE_ARCH?.trim();
  const prebuildArgs = [
    "prebuild-install",
    "--runtime",
    "electron",
    "--target",
    electronVersion,
  ];
  if (platform) prebuildArgs.push("--platform", platform);
  if (arch) prebuildArgs.push("--arch", arch);

  console.log(
    `vscode-extension: installing better-sqlite3 Electron ${electronVersion}` +
      (platform ? ` (${platform}/${arch ?? process.arch})` : "") +
      " prebuild…",
  );
  const result = spawnSync("bunx", prebuildArgs, {
    cwd: sqliteDest,
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(
      `prebuild-install failed for Electron ${electronVersion}. Set PRISM_ELECTRON_VERSION to your host Electron version.`,
    );
  }
  console.log(
    `vscode-extension: native module ready (Electron ${electronVersion})`,
  );
}

/** vsce --target / PRISM_NATIVE_* → @oxc-parser/binding-* package name. */
function oxcBindingPackageName(platform: string, arch: string): string {
  if (platform === "darwin" && arch === "arm64") {
    return "@oxc-parser/binding-darwin-arm64";
  }
  if (platform === "darwin" && arch === "x64") {
    return "@oxc-parser/binding-darwin-x64";
  }
  if (platform === "linux" && arch === "x64") {
    return "@oxc-parser/binding-linux-x64-gnu";
  }
  if (platform === "linux" && arch === "arm64") {
    return "@oxc-parser/binding-linux-arm64-gnu";
  }
  if (platform === "win32" && arch === "x64") {
    return "@oxc-parser/binding-win32-x64-msvc";
  }
  if (platform === "win32" && arch === "arm64") {
    return "@oxc-parser/binding-win32-arm64-msvc";
  }
  throw new Error(
    `Unsupported oxc binding platform ${platform}/${arch} for extension packaging`,
  );
}

function tryPackageRoot(name: string, fromPkgJson: string): string | null {
  try {
    return packageRootFrom(name, fromPkgJson);
  } catch {
    return null;
  }
}

/**
 * Fetch a platform-specific optional dependency when cross-compiling the VSIX
 * (e.g. Linux CI packaging darwin-arm64).
 */
function fetchNpmPackage(name: string, version: string, destDir: string): void {
  const tmp = join(dist, ".npm-pack-tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const spec = `${name}@${version}`;
  console.log(`vscode-extension: fetching ${spec} for VSIX…`);
  const pack = spawnSync("npm", ["pack", spec, "--pack-destination", tmp], {
    encoding: "utf8",
    env: { ...process.env },
  });
  if (pack.status !== 0) {
    console.error(pack.stdout);
    console.error(pack.stderr);
    throw new Error(`npm pack failed for ${spec}`);
  }
  const tgz = readdirSync(tmp).find((f) => f.endsWith(".tgz"));
  if (!tgz) throw new Error(`npm pack produced no tarball for ${spec}`);
  const extract = spawnSync("tar", ["-xzf", join(tmp, tgz), "-C", tmp], {
    encoding: "utf8",
  });
  if (extract.status !== 0) {
    throw new Error(`Failed to extract ${tgz}`);
  }
  const packed = join(tmp, "package");
  if (!existsSync(packed)) {
    throw new Error(`npm pack extract missing package/ for ${spec}`);
  }
  mkdirSync(dirname(destDir), { recursive: true });
  rmSync(destDir, { recursive: true, force: true });
  cpSync(packed, destDir, { recursive: true });
  rmSync(tmp, { recursive: true, force: true });
}

/**
 * Ship oxc-parser + its NAPI binding inside the VSIX.
 * Bun inlines oxc's JS with absolute createRequire paths; those are rewritten
 * to __dirname-relative paths so the Extension Host does not depend on the
 * build machine's monorepo layout.
 */
function stageOxcParser(): void {
  const nm = join(dist, "node_modules");
  mkdirSync(nm, { recursive: true });

  const analyzerPkg = join(root, "../analyzer/package.json");
  const oxcSrc = packageRootFrom("oxc-parser", analyzerPkg);
  const oxcPkg = JSON.parse(
    readFileSync(join(oxcSrc, "package.json"), "utf8"),
  ) as {
    version: string;
  };

  cpSync(oxcSrc, join(nm, "oxc-parser"), { recursive: true });

  const platform =
    process.env.PRISM_NATIVE_PLATFORM?.trim() || process.platform;
  const arch = process.env.PRISM_NATIVE_ARCH?.trim() || process.arch;
  const bindingName = oxcBindingPackageName(platform, arch);
  const bindingDest = join(nm, ...bindingName.split("/"));
  const bindingSrc = tryPackageRoot(bindingName, join(oxcSrc, "package.json"));
  if (bindingSrc) {
    mkdirSync(dirname(bindingDest), { recursive: true });
    cpSync(bindingSrc, bindingDest, { recursive: true });
  } else {
    fetchNpmPackage(bindingName, oxcPkg.version, bindingDest);
  }

  const nodeFile = readdirSync(bindingDest).find((f) => f.endsWith(".node"));
  if (!nodeFile) {
    throw new Error(`oxc binding package ${bindingName} has no .node binary`);
  }
  console.log(
    `vscode-extension: staged oxc-parser@${oxcPkg.version} + ${bindingName} (${nodeFile})`,
  );
}

/**
 * Rewrite Bun-inlined absolute file URLs so native requires resolve inside the
 * packaged extension (dist/node_modules/…), not the CI/dev machine path.
 */
function rewriteBundledAbsolutePaths(bundlePath: string): void {
  let code = readFileSync(bundlePath, "utf8");
  const before = code;

  // file:///…/node_modules/oxc-parser/<rel> → runtime path under __dirname
  code = code.replace(
    /"file:\/\/\/[^"]+\/node_modules\/oxc-parser\/([^"]+)"/g,
    (_m, rel: string) =>
      `require("node:url").pathToFileURL(require("node:path").join(__dirname, "node_modules/oxc-parser/${rel}")).href`,
  );

  // Drop any leftover absolute lighthouse import.meta.url candidate strings
  code = code.replace(/,\s*"file:\/\/\/[^"]+\/lighthouse-runner\.js"/g, "");

  if (code === before) {
    console.warn(
      "vscode-extension: no absolute oxc/lighthouse paths rewritten (bundle shape may have changed)",
    );
  } else {
    writeFileSync(bundlePath, code);
    console.log(
      "vscode-extension: rewrote absolute native module paths in extension.cjs",
    );
  }
}
