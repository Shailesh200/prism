/**
 * Prefix every hub-screens selector with `.console-hub` so daemon leftovers
 * cannot restyle the Dashboard header, Jobs KPIs, or body copy.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = join(here, "../src/hub-screens.css");
const outPath = join(here, "../src/hub-scoped.css");
const PREFIX = ".console-hub";

function prefixSelectorList(raw: string, prefix: string): string {
  return raw
    .split(",")
    .map((part) => {
      const lead = part.match(/^\s*/)?.[0] ?? "";
      const body = part.trim();
      if (!body) return part;
      if (body.startsWith(prefix)) return part;
      /* Drawers and skill-delete confirmation portal onto document.body. */
      if (
        body.startsWith(".prism-drawer") ||
        body.includes(".skills-delete-pop")
      ) {
        return part;
      }
      if (
        body.startsWith(".prepare-") ||
        body.startsWith(".prepare-md") ||
        body.startsWith(".console__facts") ||
        body.startsWith(".intel-heading") ||
        body.startsWith("h3.intel-heading") ||
        body.startsWith("h4.intel-heading") ||
        body.startsWith(".envelope__empty")
      ) {
        return part;
      }
      if (
        body === ":root" ||
        body === "html" ||
        body === "body" ||
        body === "#root"
      ) {
        return `${lead}${prefix}`;
      }
      return `${lead}${prefix} ${body}`;
    })
    .join(",");
}

export function prefixHubCss(css: string, prefix = PREFIX): string {
  let result = "";
  let i = 0;
  const n = css.length;

  const emitThrough = (end: number): void => {
    result += css.slice(i, end);
    i = end;
  };

  const skipComment = (): boolean => {
    if (!css.startsWith("/*", i)) return false;
    const end = css.indexOf("*/", i + 2);
    emitThrough(end === -1 ? n : end + 2);
    return true;
  };

  const skipString = (): boolean => {
    const quote = css[i];
    if (quote !== '"' && quote !== "'") return false;
    i += 1;
    result += quote;
    while (i < n) {
      const ch = css[i] ?? "";
      result += ch;
      i += 1;
      if (ch === "\\") {
        if (i < n) {
          result += css[i];
          i += 1;
        }
        continue;
      }
      if (ch === quote) break;
    }
    return true;
  };

  const copyBalancedBlock = (): void => {
    let depth = 1;
    while (i < n) {
      if (skipComment() || skipString()) continue;
      const ch = css[i] ?? "";
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        result += ch;
        i += 1;
        if (depth === 0) return;
        continue;
      }
      result += ch;
      i += 1;
    }
  };

  while (i < n) {
    if (skipComment()) continue;
    if (/\s/.test(css[i] ?? "")) {
      result += css[i];
      i += 1;
      continue;
    }
    if (css[i] === "}") {
      result += "}";
      i += 1;
      continue;
    }
    const next = css.slice(i);
    if (/^\s*$/.test(next)) {
      result += next;
      break;
    }
    const brace = css.indexOf("{", i);
    if (brace === -1) {
      result += css.slice(i);
      break;
    }
    const before = css.slice(i, brace);
    const trimmed = before.trim();
    if (trimmed.startsWith("@keyframes")) {
      result += before;
      result += "{";
      i = brace + 1;
      copyBalancedBlock();
      continue;
    }
    if (
      trimmed.startsWith("@media") ||
      trimmed.startsWith("@supports") ||
      trimmed.startsWith("@layer")
    ) {
      result += before;
      result += "{";
      i = brace + 1;
      continue;
    }
    result += prefixSelectorList(before, prefix);
    result += "{";
    i = brace + 1;
    copyBalancedBlock();
  }
  return result;
}

const header = `/**
 * Generated from hub-screens.css — do not edit by hand.
 * Every selector is scoped under .console-hub so it cannot leak.
 * Regenerate: bun packages/app-shell/scripts/scope-hub-css.ts
 */

`;

const runningAsScript =
  typeof import.meta.main === "boolean"
    ? import.meta.main
    : process.argv[1] !== undefined &&
      fileURLToPath(import.meta.url) === process.argv[1];

if (runningAsScript) {
  const raw = readFileSync(srcPath, "utf8");
  writeFileSync(outPath, header + prefixHubCss(raw), "utf8");
}
