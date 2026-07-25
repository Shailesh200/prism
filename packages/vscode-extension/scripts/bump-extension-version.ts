#!/usr/bin/env bun
/**
 * Sync extension version to max(local, VS Marketplace, Open VSX), then bump.
 * Usage: bun run scripts/bump-extension-version.ts [patch|minor|major]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const pkgPath = join(root, "packages/vscode-extension/package.json");
const kind = (process.argv[2] ?? "patch") as "patch" | "minor" | "major";

function parse(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmp(a: string, b: string): number {
  const A = parse(a);
  const B = parse(b);
  for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i]! - B[i]!;
  return 0;
}

function bump(v: string, k: "patch" | "minor" | "major"): string {
  let [maj, min, pat] = parse(v);
  if (k === "major") return `${maj + 1}.0.0`;
  if (k === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function capture(cmd: string, args: string[]): string | null {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    env: process.env,
    cwd: root,
  });
  if (r.status !== 0) return null;
  return r.stdout ?? "";
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
const local = pkg.version ?? "0.0.0";
let remote = "0.0.0";

const show = capture("bunx", [
  "@vscode/vsce",
  "show",
  "prismhq.repo-prism",
  "--json",
]);
if (show) {
  try {
    const data = JSON.parse(show) as {
      version?: string;
      versions?: Array<{ version: string }>;
    };
    for (const v of [
      data.version,
      ...(data.versions ?? []).map((x) => x.version),
    ]) {
      if (v && cmp(v, remote) > 0) remote = v;
    }
  } catch {
    /* ignore */
  }
}

const ovsx = capture("curl", [
  "-fsS",
  "https://open-vsx.org/api/prismhq/repo-prism",
]);
if (ovsx) {
  try {
    const data = JSON.parse(ovsx) as {
      version?: string;
      allVersions?: Record<string, string>;
    };
    const versions = Object.keys(data.allVersions ?? {}).filter(
      (k) => k !== "latest",
    );
    if (data.version) versions.push(data.version);
    for (const v of versions) if (cmp(v, remote) > 0) remote = v;
  } catch {
    /* ignore */
  }
}

const base = cmp(remote, local) > 0 ? remote : local;
const next = bump(base, kind);
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log(`base=${base} (local=${local}, remote=${remote}) → ${next}`);

if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, `version=${next}\n`, { flag: "a" });
}
