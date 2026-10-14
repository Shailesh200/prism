/**
 * Which lens a task calls for (ADR-0059). Local text only — Prism does not
 * call a model. A named lens wins, including one the owner added. Otherwise
 * a plan or a pull request is Architect, a bug hunt is QA, and the rest is Dev.
 */

import type { LensDefinition } from "./lenses.js";

const ARCHITECT =
  /\b(pull request|pr review|review (?:this |the |a )?pr|new feature|big feature|architecture|architect|rfc)\b|\bplan(?:ning)? (?:a |the |this )?(?:new |big )?(?:feature|migration|redesign|system)\b/i;

const QA =
  /\b(?:find(?: any| the)? bugs?|bug hunt|regress\w*|what'?s broken|missing tests?|does this (?:break|fail))|\bqa\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Index of a whole-word mention, or -1. */
function mentionAt(task: string, lens: LensDefinition): number {
  const names = lens.name.toLowerCase() === lens.id ? [lens.id] : [lens.name, lens.id];
  let at = -1;
  for (const name of names) {
    if (name.length < 2) continue;
    const match = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").exec(task);
    if (match && (at < 0 || match.index < at)) at = match.index;
  }
  return at;
}

/**
 * The one enabled lens for this task. Undefined only when every lens is off.
 */
export function chooseLens(
  task: string,
  lenses: readonly LensDefinition[],
): LensDefinition | undefined {
  const enabled = lenses.filter((lens) => lens.enabled);
  if (enabled.length === 0) return undefined;
  const named = enabled
    .map((lens) => ({ lens, at: mentionAt(task, lens) }))
    .filter((row) => row.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (named[0]) return named[0].lens;
  const byId = (id: string) => enabled.find((lens) => lens.id === id);
  // A bug hunt stays QA even when the task also names a pull request.
  if (QA.test(task) && byId("qa")) return byId("qa");
  if (ARCHITECT.test(task) && byId("architect")) return byId("architect");
  return byId("dev") ?? enabled[0];
}
