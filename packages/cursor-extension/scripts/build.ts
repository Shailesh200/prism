/**
 * Stage the shared VS Code extension build into this Cursor packaging overlay
 * (ADR-0020). No separate analysis path — same dist artifacts, Cursor branding.
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
const vscodeExt = join(root, "../vscode-extension");
const dist = join(root, "dist");
const media = join(root, "media");

function run(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status ?? 1);
  }
}

console.log("cursor-extension: building @prism/vscode-extension…");
run("bun", ["run", "--filter", "@prism/vscode-extension", "build"], repoRoot);

const srcDist = join(vscodeExt, "dist");
const srcMedia = join(vscodeExt, "media");
if (!existsSync(join(srcDist, "extension.cjs"))) {
  console.error(
    "cursor-extension: missing vscode-extension dist/extension.cjs",
  );
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
rmSync(media, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
mkdirSync(media, { recursive: true });

cpSync(srcDist, dist, { recursive: true });
if (existsSync(srcMedia)) {
  cpSync(srcMedia, media, { recursive: true });
}

writeFileSync(
  join(dist, "CURSOR_OVERLAY.json"),
  JSON.stringify(
    {
      overlay: "@prism/cursor-extension",
      implements: "@prism/vscode-extension",
      core: "@prism/core",
      adr: "0020",
    },
    null,
    2,
  ) + "\n",
);

console.log("cursor-extension: compiling package exports…");
run("bun", ["run", "tsc", "-p", "tsconfig.json"], root);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  displayName?: string;
};
console.log(
  `cursor-extension: staged overlay "${pkg.displayName ?? "@prism/cursor-extension"}" from vscode-extension dist`,
);
