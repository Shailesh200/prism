/**
 * `prism lens` (plan §5.3): the lenses every repository shares, stored only
 * in `~/.prism/lenses` (CL-14). The MCP `lens` tool stays opt-in.
 *
 *   prism lens list
 *   prism lens show <id>
 *   prism lens add <id> [--name …] [--role …] [--focus …] [--checklist …] [--checks …] [--trigger …]
 *                  [--evidence …] [--trigger "<phrase>"]…
 *   prism lens remove <id>
 *   prism lens override <id> --check <check> --path <file> --note "…"
 */

import {
  err,
  LENS_CHECK_IDS,
  LENS_EVIDENCE,
  ok,
  PrismErrorCode,
  prismError,
  type LensDefinition,
  type LensEvidence,
} from "@repo-prism/shared";
import {
  addCustomLens,
  addLensOverrule,
  applyDefaultProcedures,
  DEFAULT_LENSES,
  lensDefinitionsPath,
  readLensStore,
  removeLens,
} from "@repo-prism/shared/lens-store";
import { renderHeading } from "../output.js";
import type { CommandContext, CommandHandler } from "../runtime.js";

const USAGE =
  'Usage: prism lens list | show <id> | add <id> [--name "…"] [--role "…"] [--focus "…"] [--checklist "…"] [--checks a,b] [--evidence a,b] [--trigger "phrase"]… | remove <id> | override <id> --check <check> --path <file> --note "…"';

const usage = (message = USAGE) =>
  err(prismError(PrismErrorCode.VALIDATION, message));

/** Comma-separated or repeated values, trimmed, empty dropped. */
function list(context: CommandContext, name: string): string[] {
  return context.args
    .values(name)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function current(root: string) {
  const store = await readLensStore(root);
  return applyDefaultProcedures(
    store.lenses.length > 0 ? store.lenses : DEFAULT_LENSES,
  );
}

function renderLens(lens: LensDefinition): string {
  const quoted = (items: readonly string[]) =>
    items.map((item) => `"${item}"`).join(", ");
  return [
    `${lens.id} — ${lens.name}${lens.seededDefault ? "" : " (custom)"}${lens.enabled ? "" : " — off"}`,
    `  role: ${lens.role}`,
    `  focus: ${lens.focus}`,
    ...(lens.checklist.length > 0
      ? [
          "  checklist:",
          ...lens.checklist.map((item, i) => `    ${i + 1}. ${item}`),
        ]
      : []),
    ...(lens.evidence.length > 0
      ? [`  evidence: ${lens.evidence.join(", ")}`]
      : []),
    ...(lens.checks.length > 0 ? [`  checks: ${lens.checks.join(", ")}`] : []),
    ...(lens.triggers.length > 0
      ? [`  triggers: ${quoted(lens.triggers)}`]
      : []),
    ...(lens.overrules.length > 0
      ? [`  overrules: ${lens.overrules.length}`]
      : []),
  ].join("\n");
}

export const lensCommand: CommandHandler = async (context) => {
  const root = context.workspace.path;
  const [action = "list", target] = context.args.positionals;

  if (action === "list") {
    const lenses = await current(root);
    return ok({
      data: { path: lensDefinitionsPath(), lenses },
      human: ({ color }) =>
        [
          renderHeading(`Lenses (${lenses.length})`, color),
          "",
          ...lenses.map((lens) =>
            [
              `${lens.id.padEnd(12)} ${lens.name}${lens.seededDefault ? "" : " (custom)"}${lens.enabled ? "" : " — off"}`,
              lens.triggers.length > 0
                ? `${" ".repeat(13)}triggers: ${lens.triggers.map((t) => `"${t}"`).join(", ")}`
                : "",
              lens.checks.length > 0
                ? `${" ".repeat(13)}checks: ${lens.checks.join(", ")}`
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
          ),
          "",
          `Stored in ${lensDefinitionsPath()}`,
        ].join("\n"),
    });
  }

  if (action === "show") {
    if (!target) return usage();
    const lenses = await current(root);
    const needle = target.toLowerCase();
    const lens = lenses.find(
      (row) => row.id === needle || row.name.toLowerCase() === needle,
    );
    if (!lens) {
      return usage(
        `No lens named "${target}". Lenses: ${lenses.map((row) => row.id).join(", ")}.`,
      );
    }
    return ok({ data: lens, human: () => renderLens(lens) });
  }

  if (action === "add") {
    if (!target) return usage();
    // Only the id and one of --checks, --checklist or --trigger are required
    // (CL-1, CL-6); the prose fields default from what was given.
    const name = context.args.option("name") ?? target;
    const checks = list(context, "checks");
    const triggers = context.args.values("trigger");
    const given = list(context, "checklist");
    if (checks.length === 0 && given.length === 0 && triggers.length === 0) {
      return usage(
        "prism lens add needs at least one of --checks, --checklist or --trigger.",
      );
    }
    const checklist =
      given.length > 0
        ? given
        : checks.length > 0
          ? checks.map((id) => `Check ${id}`)
          : triggers.map((phrase) => `Applies to: ${phrase}`);
    const role = context.args.option("role") ?? `${name} (custom lens)`;
    const focus =
      context.args.option("focus") ??
      (checks.length > 0
        ? `Judges the change with ${checks.join(", ")}.`
        : `Chosen when the prompt says ${triggers.map((t) => `"${t}"`).join(" or ")}.`);
    const evidence = list(context, "evidence");
    const unknownEvidence = evidence.filter(
      (value) => !(LENS_EVIDENCE as readonly string[]).includes(value),
    );
    if (unknownEvidence.length > 0) {
      return usage(
        `Unknown evidence ${unknownEvidence.join(", ")}. Valid evidence: ${LENS_EVIDENCE.join(", ")}.`,
      );
    }
    try {
      const views = await addCustomLens(root, {
        name,
        role,
        focus,
        checklist,
        evidence: (evidence.length > 0
          ? evidence
          : ["blast"]) as LensEvidence[],
        triggers,
        checks,
      });
      const added = views[views.length - 1]!.definition;
      return ok({
        data: added,
        human: () =>
          `Added lens ${added.id} (${added.name}) to ${lensDefinitionsPath()}.`,
      });
    } catch (error) {
      return usage(error instanceof Error ? error.message : String(error));
    }
  }

  if (action === "remove") {
    if (!target) return usage();
    try {
      await removeLens(root, target);
      return ok({
        data: { removed: target },
        human: () => `Removed lens ${target}.`,
      });
    } catch (error) {
      return usage(error instanceof Error ? error.message : String(error));
    }
  }

  if (action === "override") {
    const check = context.args.option("check");
    const path = context.args.option("path");
    const note = context.args.option("note");
    if (!target || !check || !path || !note) {
      return usage(
        `prism lens override <id> --check <${LENS_CHECK_IDS.join("|")}> --path <file> --note "why"`,
      );
    }
    try {
      const lens = await addLensOverrule(root, {
        lens: target,
        check,
        path,
        note,
      });
      return ok({
        data: lens.overrules[lens.overrules.length - 1],
        human: () =>
          `Remembered: ${target} ${check} on ${path} is overruled until the file changes.`,
      });
    } catch (error) {
      return usage(error instanceof Error ? error.message : String(error));
    }
  }

  return usage();
};
