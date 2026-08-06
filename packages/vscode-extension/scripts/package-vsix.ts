/**
 * Stage a Marketplace-ready folder and run @vscode/vsce package.
 *
 * Workspace package stays `@repo-prism/vscode-extension` (Bun workspaces).
 * Marketplace id is `publisher.repo-prism` with unscoped name `repo-prism`.
 *
 * Platform-specific VSIX (required for better-sqlite3):
 *   bun run scripts/package-vsix.ts --target darwin-arm64
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "../..");
const stage = join(root, ".vsix-stage");
const outDir = root;

const MARKETPLACE_NAME = "repo-prism";
const REPO_URL = "https://github.com/Shailesh200/prism";
const SITE_URL = "https://www.prismhq.in";

/** vsce --target → prebuild-install platform/arch */
const TARGET_NATIVE: Record<string, { platform: string; arch: string }> = {
  "darwin-arm64": { platform: "darwin", arch: "arm64" },
  "darwin-x64": { platform: "darwin", arch: "x64" },
  "linux-x64": { platform: "linux", arch: "x64" },
  "linux-arm64": { platform: "linux", arch: "arm64" },
  "win32-x64": { platform: "win32", arch: "x64" },
  "win32-arm64": { platform: "win32", arch: "arm64" },
};

type WorkspacePkg = {
  name?: string;
  displayName?: string;
  description?: string;
  version?: string;
  publisher?: string;
  engines?: Record<string, string>;
  categories?: string[];
  keywords?: string[];
  activationEvents?: string[];
  main?: string;
  contributes?: unknown;
  icon?: string;
  [key: string]: unknown;
};

function run(
  cmd: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): void {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: env ?? process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function bumpSemver(
  version: string,
  kind: "patch" | "minor" | "major",
): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (kind === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

const skipBuild = process.argv.includes("--skip-build");
const doPublish = process.argv.includes("--publish");
const bumpKind = argValue("--bump") as "patch" | "minor" | "major" | null;
const target = argValue("--target");

if (target && !TARGET_NATIVE[target]) {
  console.error(
    `package-vsix: unknown --target ${target}. Expected one of: ${Object.keys(TARGET_NATIVE).join(", ")}`,
  );
  process.exit(1);
}

const pkgPath = join(root, "package.json");
let workspacePkg = JSON.parse(readFileSync(pkgPath, "utf8")) as WorkspacePkg;

if (bumpKind) {
  if (!["patch", "minor", "major"].includes(bumpKind)) {
    console.error(`package-vsix: invalid --bump ${bumpKind}`);
    process.exit(1);
  }
  const prev = workspacePkg.version ?? "0.0.0";
  const next = bumpSemver(prev, bumpKind);
  workspacePkg = { ...workspacePkg, version: next };
  writeFileSync(pkgPath, JSON.stringify(workspacePkg, null, 2) + "\n");
  console.log(`package-vsix: bumped version ${prev} → ${next}`);
}

const native = target ? TARGET_NATIVE[target]! : null;
const buildEnv: NodeJS.ProcessEnv = {
  ...process.env,
  ...(native
    ? {
        PRISM_NATIVE_PLATFORM: native.platform,
        PRISM_NATIVE_ARCH: native.arch,
      }
    : {}),
};

if (!skipBuild) {
  console.log(
    "package-vsix: building dependencies + extension (moon)" +
      (target ? ` for ${target}` : "") +
      "…",
  );
  run(
    "bun",
    ["run", "moon", "run", "vscode-extension:build"],
    repoRoot,
    buildEnv,
  );
} else if (native) {
  // Rebuild only native staging when dist already exists.
  console.log(`package-vsix: re-staging native modules for ${target}…`);
  run("bun", ["run", "scripts/build.ts"], root, buildEnv);
}

const distExt = join(root, "dist", "extension.cjs");
if (!existsSync(distExt)) {
  console.error("package-vsix: missing dist/extension.cjs — run build first");
  process.exit(1);
}

const publisher = workspacePkg.publisher ?? "prismhq";
const version = workspacePkg.version ?? "0.1.0";

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

cpSync(join(root, "dist"), join(stage, "dist"), { recursive: true });
cpSync(join(root, "media"), join(stage, "media"), { recursive: true });
cpSync(join(root, "README.md"), join(stage, "README.md"));
cpSync(join(repoRoot, "LICENSE"), join(stage, "LICENSE"));

const marketplacePkg = {
  name: MARKETPLACE_NAME,
  displayName: workspacePkg.displayName ?? "Prism",
  description:
    workspacePkg.description ??
    "Local-first Software Intelligence — Repository Map for VS Code",
  version,
  publisher,
  license: "MIT",
  engines: workspacePkg.engines ?? { vscode: "^1.90.0" },
  categories: workspacePkg.categories ?? ["Other", "Visualization"],
  keywords: workspacePkg.keywords ?? [
    "prism",
    "repository-map",
    "local-first",
    "blast-radius",
    "code-intelligence",
  ],
  icon: "media/prism-mark.png",
  galleryBanner: {
    color: "#0B1220",
    theme: "dark",
  },
  repository: {
    type: "git",
    url: REPO_URL,
  },
  bugs: {
    url: `${REPO_URL}/issues`,
  },
  homepage: SITE_URL,
  activationEvents: workspacePkg.activationEvents ?? ["onStartupFinished"],
  main: "./dist/extension.cjs",
  contributes: workspacePkg.contributes,
};

writeFileSync(
  join(stage, "package.json"),
  JSON.stringify(marketplacePkg, null, 2) + "\n",
);

writeFileSync(
  join(stage, ".vscodeignore"),
  ["**/*.map", "**/*.ts", "**/tsconfig*.json", "**/.DS_Store", ""].join("\n"),
);

console.log(
  `package-vsix: staging ${publisher}.${MARKETPLACE_NAME}@${version}` +
    (target ? ` (${target})` : "") +
    "…",
);

const vsixName = target
  ? `${MARKETPLACE_NAME}-${version}@${target}.vsix`
  : `${MARKETPLACE_NAME}-${version}.vsix`;
const vsixPath = join(outDir, vsixName);
const vscePat = process.env.VSCE_PAT?.trim();
const vsceArgs = doPublish
  ? [
      "@vscode/vsce",
      "publish",
      "--no-dependencies",
      ...(target ? ["--target", target] : []),
      ...(vscePat ? ["-p", vscePat] : []),
    ]
  : [
      "@vscode/vsce",
      "package",
      "--no-dependencies",
      ...(target ? ["--target", target] : []),
      "--out",
      vsixPath,
    ];

run("bunx", vsceArgs, stage);

if (process.env.GITHUB_OUTPUT) {
  writeFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\nvsix=${vsixPath}\ntarget=${target ?? ""}\n`,
    { flag: "a" },
  );
}

if (!doPublish) {
  console.log(`package-vsix: wrote ${vsixPath}`);
  console.log(
    `package-vsix: sideload with: cursor --install-extension ${vsixPath}`,
  );
}

console.log(`PACKAGE_VERSION=${version}`);
