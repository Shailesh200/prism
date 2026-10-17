/**
 * The block the prompt-submit hook injects (ADR-0065, round 2). Plain text,
 * because it lands in the model's context and JSON keys are tokens too.
 *
 * Round 2 rules: at most three files Prism is sure of (the task named them),
 * each with a one-line reason; signatures for the top one only. No file list
 * when Prism is not sure (a guess from words in the prompt misleads more often
 * than it helps),
 * when the prompt already names every file Prism would list, or when every
 * file was already shown earlier in the session (session memory: a follow-up
 * gets only what is new, "Same as before" for the rest).
 *
 * Round 4: a clear top pick (`lead`) counts as sure; an unsure change gets
 * one line asking for prepare_change; a risky change (a safety check,
 * config or settings, a high-blast file) gets a short plan cue; and every
 * block says what it held in `summary`, for the line the user sees.
 */

import { partialIndexLine } from "./partial-index.js";
import { claudeToolId } from "./tool-ids.js";
import type { ContextFile, PrepareChange } from "./schemas.js";

/** Most files the prompt block lists. */
export const PROMPT_PACK_FILES = 3;

/** A test file is not a house-style exemplar for source code. */
const TEST_LIKE =
  /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

/** Reuse hits weaker than this are a name overlap, not a helper to use. */
const REUSE_MIN_SCORE = 0.6;

/** Signatures shown for the top file. */
const PROMPT_PACK_SIGNATURES = 3;

/** Reasons that tie a file to the task itself, not only to another pick. */
const ANCHOR_WHY = new Set([
  "named in task",
  "seed file",
  "path matches task",
  "name matches task",
]);

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** The lens injected once per session with its procedure (§5.3). */
export type PromptPackLens = {
  readonly id: string;
  readonly name: string;
  readonly procedure: string;
  readonly conflict?: readonly string[];
};

export type PromptPackInput = {
  /** Prepare's answer; null for a prompt that gets a lens only (a review). */
  readonly prep: PrepareChange | null;
  readonly prompt: string;
  /** Paths already shown to the agent this session (session memory). */
  readonly surfaced?: ReadonlySet<string>;
  readonly lens?: PromptPackLens;
  /** Built for prepare_change itself: no nudge to call it. */
  readonly fromTool?: boolean;
};

export type PromptPack = {
  /** The block, or null: say nothing. */
  readonly text: string | null;
  /** What was decided, for the event log. */
  readonly reason: string;
  /** Files shown for the first time: remember them for the session. */
  readonly shown: readonly ContextFile[];
  /** Files the agent already has from earlier in the session. */
  readonly same: readonly string[];
  /** The prompt named a file Prism would list. */
  readonly named: boolean;
  /** What the block held besides the lens, in words, for the user's line. */
  readonly summary: readonly string[];
  /** The plan-first lines for a risky change, also inside `text`. */
  readonly cue: readonly string[];
};

/**
 * A pick Prism is sure of: a file the task named (a pasted path, a failing
 * test's subject, a declared symbol). On the B4 golden set those were right
 * 15 times in 18; a text match ("seed file") about 1 in 6, and a neighbour of
 * a named file 1 in 40, so neither goes in a short block (round 2).
 */
export function confidentFile(file: ContextFile): boolean {
  return file.why.includes("named in task") || file.lead === true;
}

/** The line an unsure change request gets instead of a file list (round 4). */
export const PREPARE_NUDGE = `Prism · no confident file pick. Call ${claudeToolId("prepare_change")} with the task before editing code you have not read.`;

/** A change done to the thing named next, in the same clause (website round). */
const CHANGED = String.raw`\b(?:add|remove|skip|disable|bypass|drop|delete|turn (?:on|off)|enable|change|loosen|relax|weaken|flip|override|edit|update|set|without|no)\b[^.?!\n]{0,40}?\b`;
const SAFETY_WORDS = new RegExp(
  `${CHANGED}(?:confirm\\w*|guards?|safety|safeguards?|protect\\w*|permissions?)\\b`,
  "i",
);
/** A setting, not a settings page: "the settings page" is a UI edit. */
const CONFIG_WORDS = new RegExp(
  `${CHANGED}(?:config\\w*|settings?|env|environment variables?|feature flags?)\\b(?!\\s+(?:page|screen|panel|tab|dialog|modal|view|button|icon|form|menu|ui|layout|link)s?\\b)`,
  "i",
);
/** A config file, not a component named Settings.tsx. */
const CONFIG_FILE =
  /(^|\/)(?:config|settings)(?:\.[\w-]+)*\.(?:json|jsonc|ya?ml|toml|ini|[cm]?[jt]s)$|(^|\/)\.env/;

/** A task that repairs something (round 5): fix, failing, bug, broken, regression. */
const FIX_TASK = /\b(?:fix\w*|fail\w*|bug\w*|broken|regress\w*)\b/i;

/**
 * Why a change is risky enough for a plan cue, or null (round 4): it changes
 * a safety check or a setting (the prompt says what it does to it), lists a
 * config file, or a high-blast file Prism would list. A high-blast file alone
 * does not count on a fix (round 5): the fix should stay small, and a "plan
 * first" cue there led Sonnet to rewrite working code beside the bug.
 */
export function changeRisk(
  prompt: string,
  prep: PrepareChange,
  files: readonly ContextFile[],
): string | null {
  if (SAFETY_WORDS.test(prompt)) return "safety check";
  if (CONFIG_WORDS.test(prompt) || files.some((f) => CONFIG_FILE.test(f.path)))
    return "config or settings";
  if (FIX_TASK.test(prompt)) return null;
  const blast = new Set(prep.order?.needsSignOff ?? []);
  const hit = files.find((f) => blast.has(f.path));
  return hit ? `high blast: ${hit.path}` : null;
}

// The blast_radius / test_impact reminder that sat here moved to the
// after-edit hook (round 4): it lands with the edit's result, when the agent
// picks its next step, instead of before any file is open.
function riskLines(risk: string): string[] {
  return [
    `Risky change (${risk}): plan first with the Architect lens. Name the files, the setting or guard involved, and what depends on them.`,
  ];
}

/** A follow-up that widens the scope, so the lens is worth sending again. */
export function widensScope(prompt: string): boolean {
  return /\b(everything|everywhere|anything|anywhere|all|every|whole|entire|across)\b/i.test(
    prompt,
  );
}

const baseName = (path: string): string => path.split("/").pop() ?? path;

/** True when the prompt names `path`, by its path or its file name. */
export function promptNames(prompt: string, path: string): boolean {
  if (prompt.includes(path)) return true;
  const base = path.split("/").pop() ?? path;
  return new RegExp(
    `(^|[^\\w./-])${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\w-])`,
  ).test(prompt);
}

/** True when the pack is anchored on something the task named. */
export function prepareIsAnchored(prep: PrepareChange): boolean {
  return prep.pack.files.some((file) =>
    file.why.some((why) => ANCHOR_WHY.has(why)),
  );
}

/** Two paths share their first two folders (or the one folder the shorter has). */
export function nearby(a: string, b: string): boolean {
  const da = a.split("/").slice(0, -1);
  const db = b.split("/").slice(0, -1);
  const need = Math.min(2, da.length, db.length);
  return da.slice(0, need).join("/") === db.slice(0, need).join("/");
}

function fileLines(file: ContextFile, top: boolean): string[] {
  const why = file.why.filter((w) => w !== "stale index").slice(0, 2);
  const lines = [`- ${file.path}${why.length ? `: ${why.join(", ")}` : ""}`];
  if (!top) return lines;
  for (const sig of (file.signatures ?? []).slice(0, PROMPT_PACK_SIGNATURES)) {
    lines.push(`  ${sig.line}: ${clip(sig.signature || sig.name, 110)}`);
  }
  return lines;
}

function lensLines(lens: PromptPackLens): string[] {
  const conflict =
    lens.conflict && lens.conflict.length > 1
      ? ` (lenses ${lens.conflict.join(", ")} all match; name one to choose)`
      : "";
  return [
    `Lens: ${lens.name}${conflict}`,
    ...(lens.procedure.trim() ? [clip(lens.procedure.trim(), 1400)] : []),
  ];
}

export function buildPromptPack(input: PromptPackInput): PromptPack {
  const surfaced = input.surfaced ?? new Set<string>();
  const lens = input.lens ? lensLines(input.lens) : [];
  const prep = input.prep;
  const sure = prep
    ? prep.pack.files.filter(confidentFile).slice(0, PROMPT_PACK_FILES)
    : [];
  const risk = prep ? changeRisk(input.prompt, prep, sure) : null;
  const cue = risk ? riskLines(risk) : [];
  const cueSummary = risk ? [`plan cue (${risk})`] : [];
  const only = (
    reason: string,
    summary: readonly string[],
    extra: readonly string[] = [],
    named = false,
  ): PromptPack => {
    const lines = [...extra, ...cue, ...lens];
    return {
      text: lines.length > 0 ? lines.join("\n") : null,
      reason: lens.length > 0 ? `${reason}; lens ${input.lens!.id}` : reason,
      shown: [],
      same: [],
      named,
      summary: [...summary, ...cueSummary],
      cue,
    };
  };
  if (!prep) return only("no pack for this prompt", []);

  // A capped index ranks nothing as sure; say why, and how to finish it.
  if (prep.partialIndex) {
    return only(
      "index is partial",
      ["partial index (asked for prism index)"],
      [partialIndexLine(prep.partialIndex)],
    );
  }
  if (sure.length === 0) {
    return input.fromTool
      ? only("not sure of any file", ["no sure file (read before editing)"])
      : only(
          "not sure of any file",
          ["no sure file (asked for prepare_change)"],
          [PREPARE_NUDGE],
        );
  }
  const named = sure.some((f) => promptNames(input.prompt, f.path));
  const same = sure.filter((f) => surfaced.has(f.path)).map((f) => f.path);
  const fresh = sure.filter(
    (f) => !surfaced.has(f.path) && !promptNames(input.prompt, f.path),
  );
  if (fresh.length === 0) {
    return same.length > 0
      ? only(
          "nothing new since earlier in the session",
          ["nothing new (same files as before)"],
          [],
          named,
        )
      : only(
          "the prompt names every file",
          ["nothing new (you named the files)"],
          [],
          named,
        );
  }

  const stale = prep.pack.files.some((f) => f.why.includes("stale index"));
  const lines = [
    // In the hook the block says what it is, so the session rules need not
    // (round 4). An answer to the tool itself needs no source.
    `Prism · files for this task${input.fromTool ? "" : `, from ${claudeToolId("prepare_change")}; start with these`}${stale ? " (index updating; confirm line numbers)" : ""}:`,
    ...fresh.flatMap((file, i) => fileLines(file, i === 0)),
  ];
  if (same.length > 0) lines.push(`Same as before: ${same.join(", ")}`);
  const listed = new Set(sure.map((f) => f.path));
  // Reuse beside the code being changed; a name overlap across the repo is noise.
  const reuse = prep.reuse
    .filter(
      (r) =>
        !listed.has(r.path) &&
        r.score >= REUSE_MIN_SCORE &&
        // Already imported by the code being changed: nothing to suggest.
        !r.evidence.includes("already imported") &&
        fresh.some((f) => nearby(r.path, f.path)),
    )
    .slice(0, 2);
  if (reuse.length > 0) {
    lines.push(
      `Reuse: ${reuse.map((r) => `${r.symbol} (${r.path})`).join(", ")}`,
    );
  }
  // House style is a standing pointer: the session's first block only, and
  // only an exemplar beside a listed file (a far one is not this code's style).
  const style =
    surfaced.size === 0
      ? prep.conventions?.find(
          (c) =>
            !TEST_LIKE.test(c.path) &&
            fresh.some((f) => nearby(c.path, f.path)),
        )
      : undefined;
  if (style) lines.push(`House style: ${style.path} (${style.symbol})`);
  // Tests and run commands for the listed files only; the named tests lead
  // the first run command, so a second one is about something else.
  const tests = prep.pack.tests
    .filter(
      (t) =>
        !promptNames(input.prompt, t) && sure.some((f) => nearby(t, f.path)),
    )
    .slice(0, 3);
  if (tests.length > 0) lines.push(`Tests: ${tests.join(", ")}`);
  for (const run of (prep.pack.run ?? []).slice(0, 1)) {
    lines.push(
      `Run: ${run.cwd && run.cwd !== "." ? `cd ${run.cwd} && ` : ""}${run.command}`,
    );
  }
  lines.push(...cue, ...lens);
  return {
    text: lines.join("\n"),
    reason: `${fresh.length} new file${fresh.length === 1 ? "" : "s"}${same.length ? `, ${same.length} same as before` : ""}${input.lens ? `; lens ${input.lens.id}` : ""}`,
    shown: fresh,
    same,
    named,
    summary: [
      `${fresh.length} file${fresh.length === 1 ? "" : "s"} (${fresh.map((f) => baseName(f.path)).join(", ")})`,
      ...(same.length > 0 ? ["same files as before"] : []),
      ...cueSummary,
    ],
    cue,
  };
}

/** "Dev lens" for a lens named "Dev" or "Dev lens". */
export function lensLabel(name: string): string {
  return `${name.replace(/\s*lens$/i, "")} lens`;
}

/**
 * The one line the user sees for what Prism gave the agent (round 4): the
 * prompt hook's `systemMessage`, and prepare_change's `prism` for hosts
 * without that hook. A change always gets a line; anything else only with parts.
 */
export function promptSummaryLine(
  parts: readonly string[],
  isChange: boolean,
): string | null {
  if (parts.length > 0) return `Prism · ${parts.join(" + ")}`;
  return isChange ? "Prism · nothing to add" : null;
}
