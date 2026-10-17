/**
 * `prism strength [full|lite|off]` (plan P5): how much the hooks do.
 *
 *   full  today's behaviour: session rules + orientation, auto-Prepare, edit
 *         notes, the stop receipt (trivial prompts get nothing)
 *   lite  session rules and the stop receipt only
 *   off   hooks say nothing; MCP tools still answer when called
 *
 * Writes `~/.prism/config.json`, or the repository's `.prism/config.json`
 * with `--repo` (that one wins). No level: show the strength in effect.
 */

import { err, ok, PrismErrorCode, prismError } from "@repo-prism/shared";
import {
  resolveStrength,
  setStrength,
  STRENGTHS,
  type Strength,
} from "@repo-prism/shared/user-config";
import type { CommandHandler } from "../runtime.js";

export const strengthCommand: CommandHandler = async (context) => {
  const [level] = context.args.positionals;
  const root = context.workspace.path;
  if (level === undefined) {
    const current = resolveStrength(root);
    if (!current.ok) return current;
    return ok({
      data: current.value,
      human: () =>
        `Strength: ${current.value.strength} (${current.value.source === "default" ? "default" : current.value.source === "repo" ? "this repository" : "~/.prism/config.json"})`,
    });
  }
  if (!(STRENGTHS as readonly string[]).includes(level)) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `Strength must be one of ${STRENGTHS.join(", ")}.`,
      ),
    );
  }
  const strength = level as Strength;
  const written = setStrength(
    strength,
    context.args.flag("repo") ? { scope: "repo", root } : { scope: "user" },
  );
  if (!written.ok) return written;
  return ok({
    data: { strength, path: written.value.path },
    human: () => `Strength set to ${strength} in ${written.value.path}.`,
  });
};
