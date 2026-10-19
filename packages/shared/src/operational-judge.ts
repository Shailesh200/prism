/**
 * Judgment of files that nothing imports: workflows, Vercel config.
 * A blast-radius sort never ranks them, and that is how a command that
 * skips every deploy stays invisible. Pure: callers pass the text.
 */

import {
  REVIEW_ANALYSED_CAP,
  REVIEW_LARGE_DIFF,
  type Finding,
} from "./schemas.js";

/** How many operational files a large review reads, on top of the source cap. */
export const OPERATIONAL_REVIEW_CAP = 40;

const WORKFLOW = /^\.github\/workflows\/.+\.ya?ml$/;
const VERCEL = /(?:^|\/)vercel\.json$/;

/** A file whose text decides what runs, even when no source file imports it. */
export function isOperationalPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return WORKFLOW.test(normalized) || VERCEL.test(normalized);
}

/**
 * Which paths a review analyses. A diff over {@link REVIEW_LARGE_DIFF} keeps
 * the source files with the most importers, and also the operational files.
 * Those are extra: they are not swapped in for a source file.
 */
export function selectReviewPaths(
  paths: readonly string[],
  importerCount: (path: string) => number,
): {
  readonly analysed: readonly string[];
  readonly truncated?: { readonly total: number; readonly analysed: number };
} {
  if (paths.length <= REVIEW_LARGE_DIFF) return { analysed: paths };
  const operational = paths
    .filter(isOperationalPath)
    .slice(0, OPERATIONAL_REVIEW_CAP);
  const kept = new Set(operational);
  const ranked = paths
    .filter((path) => !kept.has(path))
    .sort((a, b) => importerCount(b) - importerCount(a) || a.localeCompare(b))
    .slice(0, REVIEW_ANALYSED_CAP);
  const analysed = [...operational, ...ranked];
  return {
    analysed,
    truncated: { total: paths.length, analysed: analysed.length },
  };
}

function pathspecs(command: string): string[] {
  const mark = command.lastIndexOf(" -- ");
  const tail = mark >= 0 ? command.slice(mark + 4) : "";
  return tail
    .split(/\s+/)
    .filter((part) => part.length > 0 && !part.startsWith("-"));
}

/**
 * Vercel runs `ignoreCommand` in the project root (the directory that holds
 * `vercel.json` when Root Directory is set). Exit 0 skips the build.
 * `git diff --quiet` exits 0 when the pathspec matches nothing. A pathspec
 * that is the project directory itself matches nothing from inside it.
 */
function ignoreCommandSkipsBuild(path: string, text: string): Finding | null {
  let parsed: { ignoreCommand?: unknown };
  try {
    parsed = JSON.parse(text) as { ignoreCommand?: unknown };
  } catch {
    return null;
  }
  if (typeof parsed.ignoreCommand !== "string") return null;
  const command = parsed.ignoreCommand;
  if (!/\bgit\s+diff\b/.test(command) || !/--quiet\b/.test(command))
    return null;
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (!dir) return null;
  const hit = pathspecs(command).find(
    (spec) => spec === dir || spec === `./${dir}`,
  );
  if (!hit) return null;
  return {
    what: `The website build is skipped on every push. Vercel runs this command inside ${dir}, and \`${hit}\` is not a path there, so git diff exits 0.`,
    where: path,
    fix: "Use `git diff --quiet HEAD^ HEAD -- .`",
    riskIfSkipped: "high",
    sources: ["judge:ignore-command"],
  };
}

/** A workflow job with `if: false` never runs. */
function jobNeverRuns(path: string, text: string): Finding | null {
  const hit = text.split("\n").some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) return false;
    return /^if:\s*['"]?false['"]?\s*(?:#.*)?$/.test(trimmed);
  });
  if (!hit) return null;
  return {
    what: "A job in this workflow has `if: false`, so the job never runs.",
    where: path,
    fix: "Remove `if: false` so the job runs.",
    riskIfSkipped: "high",
    sources: ["judge:workflow-disabled"],
  };
}

/** Concrete wrong results Prism can see without a model. Empty when the text is fine. */
export function judgeOperational(
  path: string,
  text: string,
): readonly Finding[] {
  const normalized = path.replace(/\\/g, "/");
  if (!isOperationalPath(normalized)) return [];
  const found: Finding[] = [];
  if (VERCEL.test(normalized)) {
    const skip = ignoreCommandSkipsBuild(normalized, text);
    if (skip) found.push(skip);
  }
  if (WORKFLOW.test(normalized)) {
    const dead = jobNeverRuns(normalized, text);
    if (dead) found.push(dead);
  }
  return found;
}
