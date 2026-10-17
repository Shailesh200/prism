/**
 * Per-repo prepare feedback (plan P6): which files prepare suggested vs which
 * the session actually edited. Paths and task stems only — never file content.
 *
 * Stored at `~/.prism/workspaces/<id>/feedback.jsonl`. Rows older than
 * {@link FEEDBACK_TTL_MS} are ignored for ranking and dropped by prune.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { workspacePrismDir } from "./prism-home.js";

/** Keep feedback for 30 days (plan P6 decay). */
export const FEEDBACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Cap so feedback cannot dominate lexical/import/co-change (plan P6). */
export const FEEDBACK_WEIGHT_CAP = 0.12;

export type FeedbackRow = {
  readonly ts: string;
  /** Top pack paths prepare suggested (≤ 10). */
  readonly suggested: readonly string[];
  /** Paths edited this session (from the receipt). */
  readonly edited: readonly string[];
  /** Task stems (no raw task text beyond short stems). */
  readonly terms: readonly string[];
};

export function feedbackPath(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(root, env), "feedback.jsonl");
}

/** Stem a task the same way ranking does (lowercase alnum runs). */
export function feedbackTerms(task: string, max = 12): string[] {
  const stems = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((s) => s.length >= 2);
  return [...new Set(stems)].slice(0, max);
}

export function appendFeedback(
  root: string,
  row: FeedbackRow,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (row.suggested.length === 0 && row.edited.length === 0) return;
  const path = feedbackPath(root, env);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, "utf8");
}

export function readFeedbackRows(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): FeedbackRow[] {
  const path = feedbackPath(root, env);
  if (!existsSync(path)) return [];
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const cutoff = now - FEEDBACK_TTL_MS;
  const rows: FeedbackRow[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line) as FeedbackRow;
      const at = Date.parse(raw.ts);
      if (!Number.isFinite(at) || at < cutoff) continue;
      if (!Array.isArray(raw.suggested) || !Array.isArray(raw.edited)) continue;
      rows.push({
        ts: raw.ts,
        suggested: raw.suggested.filter((p) => typeof p === "string"),
        edited: raw.edited.filter((p) => typeof p === "string"),
        terms: Array.isArray(raw.terms)
          ? raw.terms.filter((t) => typeof t === "string")
          : [],
      });
    } catch {
      // skip corrupt line
    }
  }
  return rows;
}

/**
 * Smoothed scores in [0, 1] per path: how often the file was edited when
 * suggested, plus a bonus for edits *outside* top-3 (anti feedback-loop).
 */
export function feedbackScores(
  root: string,
  task: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): Map<string, number> {
  const rows = readFeedbackRows(root, env, now);
  const terms = new Set(feedbackTerms(task));
  const suggestedHits = new Map<string, { hit: number; n: number }>();
  const extraHits = new Map<string, number>();
  for (const row of rows) {
    const edited = new Set(row.edited);
    const top3 = new Set(row.suggested.slice(0, 3));
    const termMatch = terms.size === 0 || row.terms.some((t) => terms.has(t));
    for (const path of row.suggested.slice(0, 10)) {
      const cur = suggestedHits.get(path) ?? { hit: 0, n: 0 };
      cur.n += 1;
      if (edited.has(path)) cur.hit += 1;
      suggestedHits.set(path, cur);
    }
    if (termMatch) {
      for (const path of row.edited) {
        if (!top3.has(path)) {
          extraHits.set(path, (extraHits.get(path) ?? 0) + 1);
        }
      }
    }
  }
  const out = new Map<string, number>();
  const maxExtra = Math.max(1, ...extraHits.values());
  for (const [path, { hit, n }] of suggestedHits) {
    // Laplace smoothing: (hit+1)/(n+2)
    out.set(path, (hit + 1) / (n + 2));
  }
  for (const [path, count] of extraHits) {
    const bonus = 0.5 * (count / maxExtra);
    out.set(path, Math.min(1, (out.get(path) ?? 0) + bonus));
  }
  return out;
}

/** Drop rows older than the TTL. Returns number of lines removed. */
export function pruneFeedback(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): number {
  const path = feedbackPath(root, env);
  if (!existsSync(path)) return 0;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return 0;
  }
  const cutoff = now - FEEDBACK_TTL_MS;
  const keep: string[] = [];
  let dropped = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line) as { ts?: string };
      const at = Date.parse(raw.ts ?? "");
      if (!Number.isFinite(at) || at < cutoff) {
        dropped += 1;
        continue;
      }
      keep.push(line);
    } catch {
      dropped += 1;
    }
  }
  writeFileSync(path, keep.length ? `${keep.join("\n")}\n` : "", "utf8");
  return dropped;
}

/** True when every row has only paths/terms (no content-like fields). */
export function feedbackIsPathsOnly(row: FeedbackRow): boolean {
  const allowed = new Set(["ts", "suggested", "edited", "terms"]);
  if (Object.keys(row).some((k) => !allowed.has(k))) return false;
  return (
    row.suggested.every((p) => typeof p === "string" && !p.includes("\n")) &&
    row.edited.every((p) => typeof p === "string" && !p.includes("\n")) &&
    row.terms.every((t) => typeof t === "string" && t.length < 64)
  );
}
