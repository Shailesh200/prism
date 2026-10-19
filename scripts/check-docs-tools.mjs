#!/usr/bin/env node
/**
 * DOC-W3 (plan P20): the default-tool column in docs/reference/mcp-tools.md
 * must equal DEFAULT_TOOL_NAMES from the built shared package.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const { DEFAULT_TOOL_NAMES } = await import(
  join(root, "packages/shared/dist/tool-names.js")
);
const md = readFileSync(join(root, "docs/reference/mcp-tools.md"), "utf8");
const defaults = [...md.matchAll(/\| \[`([a-z_]+)`\]\([^)]+\) \| yes \|/g)].map(
  (m) => m[1],
);
const a = [...DEFAULT_TOOL_NAMES].sort().join(",");
const b = [...defaults].sort().join(",");
if (a !== b) {
  console.error("docs-tools: DEFAULT_TOOL_NAMES drift");
  console.error(`  shared: ${a}`);
  console.error(`  docs:   ${b}`);
  process.exit(1);
}
console.log(`docs-tools: ok (${DEFAULT_TOOL_NAMES.length} default tools)`);
