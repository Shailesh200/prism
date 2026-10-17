/**
 * JSR "slow types" (round 5): a package published to JSR must write the
 * return type of every exported function. `jsr publish` rejects one that
 * leaves it to inference, while tsc, lint and the tests all still pass
 * (hono 6a0607a9 exported `tryDecodeURI` with no return type). This is a
 * syntax scan, not a type check: it only reads exported function
 * declarations and `export const x = (...) =>` / `function` literals, so a
 * hit is certain and anything it cannot read is left alone.
 */

const TS_SOURCE = /\.(?:[cm]?ts|tsx)$/;
const DECLARATION = /\.d\.[cm]?ts$/;

/** A TypeScript source JSR would type-check (not a .d.ts). */
export function isSlowTypeCandidate(path: string): boolean {
  return TS_SOURCE.test(path) && !DECLARATION.test(path);
}

/** True for jsr.json, or a deno.json(c) that lists exports. */
export function publishesToJsr(read: (name: string) => string | null): boolean {
  if (read("jsr.json") !== null) return true;
  for (const name of ["deno.json", "deno.jsonc"]) {
    const text = read(name);
    if (text && /"exports"\s*:/.test(text)) return true;
  }
  return false;
}

/** Index just past the bracket that closes the one at `start`, or -1. */
function closeOf(src: string, start: number): number {
  const open = src[start];
  const close = open === "(" ? ")" : open === "<" ? ">" : "";
  if (!close) return -1;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = src.indexOf(ch, i + 1);
      if (end < 0) return -1;
      i = end;
      continue;
    }
    // `=>` inside generics or parameters is not a closing angle bracket.
    if (ch === ">" && src[i - 1] === "=") continue;
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i + 1;
  }
  return -1;
}

function skipSpace(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i]!)) i++;
  return i;
}

/** After optional generics at `i`: the parameter list, then what follows it. */
function afterParams(src: string, i: number): string | null {
  i = skipSpace(src, i);
  if (src[i] === "<") {
    const end = closeOf(src, i);
    if (end < 0) return null;
    i = skipSpace(src, end);
  }
  if (src[i] !== "(") return null;
  const end = closeOf(src, i);
  if (end < 0) return null;
  return src.slice(skipSpace(src, end), skipSpace(src, end) + 2);
}

const FUNCTION_DECL =
  /^[ \t]*export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm;
const CONST_DECL = /^[ \t]*export\s+const\s+([A-Za-z_$][\w$]*)\s*(:)?\s*=\s*/gm;

/** Exported functions in `source` whose return type is left to inference. */
export function slowTypeExports(source: string): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(FUNCTION_DECL)) {
    const next = afterParams(source, m.index + m[0].length);
    // `{` starts the body with no return type; `:` writes one; `;` is an
    // overload signature without one, which JSR also rejects.
    if (next && (next[0] === "{" || next[0] === ";")) out.add(m[1]!);
  }
  for (const m of source.matchAll(CONST_DECL)) {
    if (m[2]) continue; // `export const x: Type = …` is annotated.
    let i = m.index + m[0].length;
    const rest = source.slice(i);
    const asyncWord = /^async\s+/.exec(rest);
    if (asyncWord) i += asyncWord[0].length;
    const fn = /^function\s*\*?\s*(?:[A-Za-z_$][\w$]*)?/.exec(source.slice(i));
    if (fn) {
      const next = afterParams(source, i + fn[0].length);
      if (next && next[0] === "{") out.add(m[1]!);
      continue;
    }
    // `x => …`: one bare parameter can never carry a return type.
    if (/^[A-Za-z_$][\w$]*\s*=>/.test(source.slice(i))) {
      out.add(m[1]!);
      continue;
    }
    const next = afterParams(source, i);
    if (next === "=>") out.add(m[1]!);
  }
  return [...out];
}

/** Exports this change made slow: slow now, and not slow at HEAD. */
export function newSlowTypeExports(
  current: string,
  head: string | null,
): string[] {
  const before = new Set(head ? slowTypeExports(head) : []);
  return slowTypeExports(current).filter((name) => !before.has(name));
}
