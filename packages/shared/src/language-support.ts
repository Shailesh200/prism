/**
 * Language support (plan §4.6): Prism 2.0 analyses TypeScript and JavaScript
 * only. Every answer about a file in another source language, or about a repo
 * where under 20% of the source files are TS/JS, is `PRISM_UNSUPPORTED`
 * (reason: language) — never a guessed blast, test list or pack.
 */
import { PrismErrorCode, prismError, type PrismError } from "./errors.js";

export const SUPPORTED_SOURCE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;

/** Minimum share of TS/JS among source files for a repo to be supported. */
export const MIN_SUPPORTED_SOURCE_SHARE = 0.2;

const OTHER_LANGUAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\.(?:py|pyi)$/i, "Python"],
  [/\.go$/i, "Go"],
  [/\.rs$/i, "Rust"],
  [/\.java$/i, "Java"],
  [/\.(?:kt|kts)$/i, "Kotlin"],
  [/\.rb$/i, "Ruby"],
  [/\.php$/i, "PHP"],
  [/\.cs$/i, "C#"],
  [/\.(?:c|h)$/i, "C"],
  [/\.(?:cc|cpp|cxx|hpp|hh)$/i, "C++"],
  [/\.swift$/i, "Swift"],
  [/\.scala$/i, "Scala"],
  [/\.(?:ex|exs)$/i, "Elixir"],
  [/\.dart$/i, "Dart"],
  [/\.lua$/i, "Lua"],
];

/**
 * The language of a source path: "TypeScript/JavaScript", another named
 * source language, or null for non-source (docs, config, assets).
 */
export function sourceLanguageOf(path: string): string | null {
  if (/\.d\.[cm]?ts$/i.test(path)) return "TypeScript/JavaScript";
  if (SUPPORTED_SOURCE_EXT.test(path)) return "TypeScript/JavaScript";
  for (const [re, name] of OTHER_LANGUAGES) if (re.test(path)) return name;
  return null;
}

export function isSupportedSourcePath(path: string): boolean {
  return SUPPORTED_SOURCE_EXT.test(path);
}

export type RepoLanguageSupport = {
  readonly supported: boolean;
  /** TS/JS share of source files (0..1); 1 when there is no source at all. */
  readonly share: number;
  /** Most common unsupported language, when there is one. */
  readonly dominantUnsupported?: string;
};

export function repoLanguageSupport(
  paths: readonly string[],
): RepoLanguageSupport {
  let supported = 0;
  let total = 0;
  const others = new Map<string, number>();
  for (const p of paths) {
    const lang = sourceLanguageOf(p);
    if (lang === null) continue;
    total += 1;
    if (lang === "TypeScript/JavaScript") supported += 1;
    else others.set(lang, (others.get(lang) ?? 0) + 1);
  }
  const share = total === 0 ? 1 : supported / total;
  const dominant = [...others.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]?.[0];
  return {
    supported: share >= MIN_SUPPORTED_SOURCE_SHARE,
    share,
    ...(dominant ? { dominantUnsupported: dominant } : {}),
  };
}

export const UNSUPPORTED_LANGUAGE_PREFIX =
  "Prism 2.0 supports TypeScript and JavaScript only.";

export function unsupportedLanguageError(language: string): PrismError {
  return prismError(
    PrismErrorCode.UNSUPPORTED,
    `${UNSUPPORTED_LANGUAGE_PREFIX} ${language} files are not analysed.`,
    { reason: "language", language },
  );
}

/**
 * The language gate for one question. `target` is the repo-relative path the
 * question is about (if any). Returns the error to answer with, or null.
 */
export function languageGate(
  inventoryPaths: readonly string[],
  target?: string,
): PrismError | null {
  if (target !== undefined) {
    const lang = sourceLanguageOf(target);
    if (lang !== null && lang !== "TypeScript/JavaScript")
      return unsupportedLanguageError(lang);
  }
  const repo = repoLanguageSupport(inventoryPaths);
  if (!repo.supported)
    return unsupportedLanguageError(repo.dominantUnsupported ?? "These");
  return null;
}
