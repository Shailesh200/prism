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
