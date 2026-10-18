/**
 * Which lens a task calls for (ADR-0059, plan §5.3). Local text only —
 * Prism does not call a model. Order:
 *   1. a lens named in the task wins, custom ones too. With several named,
 *      an explicit ask ("use the Dev lens") beats "Dev lens", which beats a
 *      bare mention ("the Architect plan"); among bare mentions the routing
 *      below picks, else the earliest;
 *   2. a custom lens whose trigger phrase appears (longest phrase wins; on a
 *      tie the most recently edited lens, and the conflict is reported);
 *   3. QA for a bug hunt ("find bugs", "why does X fail");
 *   4. Architect for a review of a PR or change, a new feature, or a plan;
 *   5. Dev.
 * Text inside code blocks and quotes is ignored (CL-8), and so is a negated
 * clause ("do not open a pull request" asks for no Architect pass; round 2).
 */

import type { LensDefinition } from "./lenses.js";

const ARCHITECT =
  /\b(pull request|pr review|new feature|big feature|architecture|architect|rfc)\b|\breview\b[^.?!]{0,60}\b(pr|pull request|this change|the change|my change|uncommitted change|diff|(?:last |latest |this )?commit|before i open a pr)\b|\bbefore i open a pr\b|\bplan(?:ning)? (?:a |the |this )?(?:new |big )?(?:feature|migration|redesign|system)\b/i;

const QA =
  /\b(?:find(?: any| the| all)? bugs?|bug hunt|hunt (?:for )?bugs?|regress\w*|what'?s broken|missing tests?|does this (?:break|fail)|why does [^.?!]{1,60}\b(?:fail|break|crash|throw)s?)\b|\bqa\b/i;

/** Built-in routing words a trigger may not use (CL-13). */
export const RESERVED_TRIGGER_WORDS = [
  "review",
  "bug",
  "bugs",
  "pr",
  "qa",
  "architect",
  "dev",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * An instruction not to do something, up to the end of its sentence: "do not
 * …", "don't …", "no need to …", or a sentence that opens with "never". A
 * description ("it never returns null") is kept.
 */
const NEGATED =
  /\b(?:do not|don't|dont|no need to)\b[^.!?\n]*|(?:^|(?<=[.!?\n]))\s*never\b[^.!?\n]*/gi;

/**
 * The task without its "do not …" clauses: what not to touch is not what the
 * task is about ("do not open a pull request" names no pull request). When
 * the negated clause is the whole task ("don't crash on empty input", a fix
 * phrased as a behaviour), it is the task and stays.
 */
export function stripNegatedClauses(task: string): string {
  const rest = task.replace(NEGATED, " ");
  return /[a-z]{3}/i.test(rest) ? rest : task;
}

/** The task with code blocks, inline code, quoted text and negated clauses blanked out. */
export function routableText(task: string): string {
  return task
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/^\s*>.*$/gm, " ")
    .replace(/"[^"\n]{0,400}"/g, " ")
    .replace(NEGATED, " ");
}

function phraseAt(text: string, phrase: string): number {
  const match = new RegExp(
    `(?<![\\w-])${escapeRegExp(phrase.trim()).replace(/\s+/g, "\\s+")}(?![\\w-])`,
    "i",
  ).exec(text);
  return match ? match.index : -1;
}

const ASKED_BEFORE =
  /\b(?:use|using|apply|switch to|with|as)\s+(?:the\s+|a\s+|prism'?s\s+)?$/i;

/**
 * The strongest whole-word mention: 2 an ask ("use the Dev lens", "as QA"),
 * 1 "<name> lens", 0 a bare mention; `at` is that mention's index, or -1.
 */
function mentionOf(
  task: string,
  lens: LensDefinition,
): { at: number; rank: number } {
  const names =
    lens.name.toLowerCase() === lens.id ? [lens.id] : [lens.name, lens.id];
  let best = { at: -1, rank: -1 };
  for (const name of names) {
    if (name.length < 2) continue;
    const pattern = new RegExp(
      `(?<![\\w-])${escapeRegExp(name.trim()).replace(/\s+/g, "\\s+")}(?![\\w-])`,
      "gi",
    );
    for (const match of task.matchAll(pattern)) {
      const at = match.index;
      const after = task.slice(at + match[0].length);
      const rank = ASKED_BEFORE.test(task.slice(Math.max(0, at - 30), at))
        ? 2
        : /^\s+lens\b/i.test(after)
          ? 1
          : 0;
      if (rank > best.rank || (rank === best.rank && at < best.at))
        best = { at, rank };
    }
  }
  return best;
}

/**
 * Why a trigger phrase is refused, or null when it is fine (CL-13): at
 * least two words, or one word of six letters or more, and no built-in
 * routing word.
 */
export function invalidTrigger(phrase: string): string | null {
  const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "a trigger cannot be empty";
  if (words.length === 1 && (words[0]?.length ?? 0) < 6) {
    return `"${phrase}" is too short: use two words, or one word of six letters or more`;
  }
  const reserved = words.find((w) =>
    (RESERVED_TRIGGER_WORDS as readonly string[]).includes(w),
  );
  if (reserved) {
    return `"${phrase}" uses "${reserved}", which built-in lens routing already uses`;
  }
  return null;
}

export type LensChoice = {
  readonly lens: LensDefinition;
  readonly by: "named" | "trigger" | "qa" | "architect" | "default";
  /** Every custom lens a trigger matched, when more than one did (CL-9/10). */
  readonly conflict?: readonly string[];
};

/** The one enabled lens for this task, and how it was chosen. */
export function chooseLensDetailed(
  task: string,
  lenses: readonly LensDefinition[],
): LensChoice | undefined {
  const enabled = lenses.filter((lens) => lens.enabled);
  if (enabled.length === 0) return undefined;
  const text = routableText(task);
  // A lens may be named in quotes ("use the "Security" lens"), not in code.
  const unquotedCode = task
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(NEGATED, " ");
  const named = enabled
    .map((lens) => ({ lens, ...mentionOf(unquotedCode, lens) }))
    .filter((row) => row.at >= 0)
    .sort((a, b) => b.rank - a.rank || a.at - b.at);
  const top = named[0];
  if (top && (top.rank > 0 || named.length === 1))
    return { lens: top.lens, by: "named" };
  if (top) {
    // Only bare mentions: the task's intent, minus the names, decides.
    const intent = named.reduce(
      (rest, row) =>
        [row.lens.name, row.lens.id].reduce(
          (t, name) =>
            t.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), " "),
          rest,
        ),
      text,
    );
    const routed = routeBuiltIn(
      intent,
      named.map((row) => row.lens),
    );
    return { lens: routed?.lens ?? top.lens, by: "named" };
  }

  const triggered = enabled
    .flatMap((lens) =>
      (lens.triggers ?? [])
        .filter((phrase) => phraseAt(text, phrase) >= 0)
        .map((phrase) => ({ lens, length: phrase.trim().length })),
    )
    .sort(
      (a, b) =>
        b.length - a.length ||
        (b.lens.updatedAt ?? "").localeCompare(a.lens.updatedAt ?? ""),
    );
  if (triggered[0]) {
    const ids = [...new Set(triggered.map((row) => row.lens.id))];
    return {
      lens: triggered[0].lens,
      by: "trigger",
      ...(ids.length > 1 ? { conflict: ids } : {}),
    };
  }

  return routeBuiltIn(text, enabled, enabled[0]);
}

/** QA for a bug hunt, Architect for a review or plan, else Dev (or `fallback`). */
function routeBuiltIn(
  text: string,
  lenses: readonly LensDefinition[],
  fallback?: LensDefinition,
): LensChoice | undefined {
  const byId = (id: string) => lenses.find((lens) => lens.id === id);
  // A bug hunt stays QA even when the task also names a pull request.
  const qa = byId("qa");
  if (QA.test(text) && qa) return { lens: qa, by: "qa" };
  const architect = byId("architect");
  if (ARCHITECT.test(text) && architect) {
    return { lens: architect, by: "architect" };
  }
  const dev = byId("dev") ?? fallback;
  return dev ? { lens: dev, by: "default" } : undefined;
}

/** The one enabled lens for this task. Undefined only when every lens is off. */
export function chooseLens(
  task: string,
  lenses: readonly LensDefinition[],
): LensDefinition | undefined {
  return chooseLensDetailed(task, lenses)?.lens;
}
