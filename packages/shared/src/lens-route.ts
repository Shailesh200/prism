/**
 * Which lens a task calls for (ADR-0059, plan §5.3). Local text only —
 * Prism does not call a model. Order:
 *   1. a lens named in the task (earliest mention) wins, custom ones too;
 *   2. a custom lens whose trigger phrase appears (longest phrase wins; on a
 *      tie the most recently edited lens, and the conflict is reported);
 *   3. QA for a bug hunt ("find bugs", "why does X fail");
 *   4. Architect for a review of a PR or change, a new feature, or a plan;
 *   5. Dev.
 * Text inside code blocks and quotes is ignored (CL-8).
 */

import type { LensDefinition } from "./lenses.js";

const ARCHITECT =
  /\b(pull request|pr review|new feature|big feature|architecture|architect|rfc)\b|\breview\b[^.?!]{0,60}\b(pr|pull request|this change|the change|my change|uncommitted change|diff|before i open a pr)\b|\bbefore i open a pr\b|\bplan(?:ning)? (?:a |the |this )?(?:new |big )?(?:feature|migration|redesign|system)\b/i;

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

/** The task with code blocks, inline code and quoted text blanked out. */
export function routableText(task: string): string {
  return task
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/^\s*>.*$/gm, " ")
    .replace(/"[^"\n]{0,400}"/g, " ");
}

function phraseAt(text: string, phrase: string): number {
  const match = new RegExp(
    `(?<![\\w-])${escapeRegExp(phrase.trim()).replace(/\s+/g, "\\s+")}(?![\\w-])`,
    "i",
  ).exec(text);
  return match ? match.index : -1;
}

/** Index of a whole-word mention, or -1. */
function mentionAt(task: string, lens: LensDefinition): number {
  const names =
    lens.name.toLowerCase() === lens.id ? [lens.id] : [lens.name, lens.id];
  let at = -1;
  for (const name of names) {
    if (name.length < 2) continue;
    const found = phraseAt(task, name);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  return at;
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
    .replace(/`[^`]*`/g, " ");
  const named = enabled
    .map((lens) => ({ lens, at: mentionAt(unquotedCode, lens) }))
    .filter((row) => row.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (named[0]) return { lens: named[0].lens, by: "named" };

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

  const byId = (id: string) => enabled.find((lens) => lens.id === id);
  // A bug hunt stays QA even when the task also names a pull request.
  const qa = byId("qa");
  if (QA.test(text) && qa) return { lens: qa, by: "qa" };
  const architect = byId("architect");
  if (ARCHITECT.test(text) && architect) {
    return { lens: architect, by: "architect" };
  }
  const fallback = byId("dev") ?? enabled[0];
  return fallback ? { lens: fallback, by: "default" } : undefined;
}

/** The one enabled lens for this task. Undefined only when every lens is off. */
export function chooseLens(
  task: string,
  lenses: readonly LensDefinition[],
): LensDefinition | undefined {
  return chooseLensDetailed(task, lenses)?.lens;
}
