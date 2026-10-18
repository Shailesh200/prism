#!/usr/bin/env node
/**
 * Decides which release jobs a push should start.
 *
 * `publish` prints `true` when package code changed (not a README or other
 * markdown). `website` exits 1 when the site or the docs it builds changed,
 * and 0 when the build should be skipped. Vercel treats exit 0 as "ignore".
 *
 *   git diff --name-only BEFORE SHA | node scripts/release-paths.mjs publish
 *   git diff --name-only BEFORE SHA | node scripts/release-paths.mjs website
 */
import { readFileSync } from "node:fs";

const README = /(?:^|\/)README(?:\.[A-Za-z0-9]+)?$/i;

const PUBLISH_FILES = new Set([
  "scripts/publish-npm.mjs",
  "scripts/check-publish-exports.mjs",
  "scripts/check-mcp-start.mjs",
  "scripts/check-lockstep.mjs",
  "scripts/check-no-published-refs.mjs",
  "scripts/release-paths.mjs",
  "package.json",
  "bun.lock",
  ".github/workflows/publish-npm.yml",
  ".nvmrc",
]);

function isDoc(file) {
  return README.test(file) || /\.(?:md|mdx)$/i.test(file);
}

/** True when this push should publish the npm packages. */
export function shouldPublish(files) {
  return files.some((file) => {
    if (isDoc(file)) return false;
    if (file.startsWith("packages/")) return true;
    if (file.startsWith("scripts/bench/")) return true;
    return PUBLISH_FILES.has(file);
  });
}

/** True when this push should build the website. */
export function shouldDeployWebsite(files) {
  return files.some((file) => {
    if (README.test(file)) return false;
    return file.startsWith("apps/website/") || file.startsWith("docs/");
  });
}

function filesFromStdin() {
  return readFileSync(0, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const invoked =
  process.argv[1]?.endsWith("release-paths.mjs") ||
  process.argv[1]?.endsWith("release-paths.js");

if (invoked) {
  const mode = process.argv[2];
  const files = filesFromStdin();
  if (mode === "publish") {
    process.stdout.write(shouldPublish(files) ? "true" : "false");
  } else if (mode === "website") {
    process.exit(shouldDeployWebsite(files) ? 1 : 0);
  } else {
    console.error("usage: release-paths.mjs publish|website");
    process.exit(2);
  }
}
