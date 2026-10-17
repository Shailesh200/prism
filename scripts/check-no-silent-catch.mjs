#!/usr/bin/env node
/**
 * No silent catch (plan §2.5). In the hook, daemon and snapshot code a caught
 * error must either be handled (return a value that is the answer, rethrow)
 * or recorded as an event. Banned: an empty or comment-only catch block and
 * `.catch(() => undefined | null | {})`.
 *
 * Usage: node scripts/check-no-silent-catch.mjs   (exit 1 on a finding)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");

/** Files and directories the rule covers (relative to the repo). */
export const SCOPE = [
  "packages/plugin/hooks",
  "packages/daemon/src",
  "packages/mcp-server/src/safety/snapshot.ts",
  "packages/mcp-server/src/daemon.ts",
  "packages/mcp-server/src/daemon-attach.ts",
  "packages/mcp-server/src/session.ts",
];

const EMPTY_CATCH =
  /catch\s*(?:\([^)]*\))?\s*\{(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*\}/g;
const SWALLOW = /\.catch\(\s*\(\s*\)\s*=>\s*(?:undefined|null|\{\s*\})\s*\)/g;

function files(path) {
  const abs = join(root, path);
  if (/\.(m?js|ts)$/.test(path)) return [abs];
  return readdirSync(abs, { recursive: true })
    .map(String)
    .filter((f) => /\.(m?js|ts)$/.test(f) && !/\.test\.|\.d\.ts$/.test(f))
    .map((f) => join(abs, f));
}

export function findSilentCatches(text) {
  const hits = [];
  for (const re of [EMPTY_CATCH, SWALLOW]) {
    for (const m of text.matchAll(re)) {
      hits.push(text.slice(0, m.index).split("\n").length);
    }
  }
  return hits.sort((a, b) => a - b);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let bad = 0;
  for (const scope of SCOPE) {
    for (const file of files(scope)) {
      for (const line of findSilentCatches(readFileSync(file, "utf8"))) {
        bad += 1;
        console.error(
          `${relative(root, file)}:${line}: silent catch (plan §2.5): record an event or handle it`,
        );
      }
    }
  }
  if (bad > 0) process.exit(1);
  console.log("no-silent-catch: clean");
}
