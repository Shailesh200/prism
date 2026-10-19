/**
 * Habits (plan P15, ADR-0068): routines the user names once, such as
 * "start my day", that any agent can ask Prism for. Prism stores and returns
 * the steps; the agent runs them with its own connected tools. Prism makes no
 * network call and executes nothing.
 *
 * A habit is a kind of skill: one `~/.prism/skills/<slug>/SKILL.md` each
 * (mode 0600), with the steps in a fixed layout. The `habits` MCP tool reads
 * those files, so hosts without skills can still run them. Secrets are
 * refused on save and never echoed back; events record only the name and
 * step count. The old `~/.prism/habits.json` is migrated once, kept as a
 * backup.
 *
 * Node-only. Import from `@repo-prism/shared/habits`, never the barrel.
 */

import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { prismError, PrismErrorCode, type PrismError } from "./errors.js";
import { recordEvent } from "./events.js";
import { prismHomeDir } from "./prism-home.js";
import { err, ok, type Result } from "./result.js";

export const HABIT_SOURCES = [
  "github",
  "linear",
  "notion",
  "slack",
  "gmail",
  "calendar",
  "jira",
  "shell",
] as const;
export const HABIT_OUTPUT_FORMATS = [
  "standup",
  "summary",
  "checklist",
  "table",
  "free",
] as const;

export const HabitStepSchema = z.object({
  /** Free label; the known sources above only drive hints. */
  source: z.string().trim().min(1).max(40),
  action: z.string().trim().min(1).max(300),
  filter: z.string().trim().min(1).max(200).optional(),
});
export const HabitSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional(),
  steps: z.array(HabitStepSchema).min(1).max(20),
  output: z.object({
    format: z.enum(HABIT_OUTPUT_FORMATS),
    template: z.string().trim().max(500).optional(),
  }),
});
export const HabitsFileSchema = z.object({
  version: z.literal(1),
  habits: z.array(HabitSchema),
});
export type HabitStep = z.infer<typeof HabitStepSchema>;
export type Habit = z.infer<typeof HabitSchema>;
export type HabitsFile = z.infer<typeof HabitsFileSchema>;

/** Where habits live: one skill folder each in Prism's user skills folder. */
export function habitsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHomeDir(env), "skills");
}

/** The old single-file store, migrated once by {@link migrateLegacyHabits}. */
export function legacyHabitsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHomeDir(env), "habits.json");
}

const SECRET_PATTERNS: readonly {
  readonly kind: string;
  readonly re: RegExp;
}[] = [
  { kind: "OpenAI/Anthropic-style key", re: /\bsk-[A-Za-z0-9_-]{16,}/ },
  {
    kind: "GitHub token",
    re: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  },
  { kind: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { kind: "Linear API key", re: /\blin_api_[A-Za-z0-9]{20,}/ },
  { kind: "Notion secret", re: /\b(secret_|ntn_)[A-Za-z0-9]{20,}/ },
  { kind: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    kind: "JWT",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  },
  { kind: "Bearer token", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i },
  {
    kind: "URL with credentials",
    re: /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i,
  },
  { kind: "long hex string", re: /\b[0-9a-f]{33,}\b/i },
];

/** 33+ chars of base64 with upper, lower and digits: a key, not a word or slug. */
function looksLikeEncodedKey(text: string): boolean {
  return (text.match(/[A-Za-z0-9+/_]{33,}={0,2}/g) ?? []).some(
    (run) => /[A-Z]/.test(run) && /[a-z]/.test(run) && /[0-9]/.test(run),
  );
}

/** Names the kind of secret found, never the secret itself. */
export function findSecret(text: string): string | undefined {
  for (const { kind, re } of SECRET_PATTERNS) {
    if (re.test(text)) return kind;
  }
  return looksLikeEncodedKey(text) ? "long base64 string" : undefined;
}

function invalid(message: string): PrismError {
  return prismError(PrismErrorCode.VALIDATION, message);
}

/** Validate one habit, then refuse it if any field looks like a secret. */
export function validateHabit(input: unknown): Result<Habit, PrismError> {
  const parsed = HabitSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return err(
      invalid(
        `Invalid habit: ${issue?.path.join(".") || "habit"}: ${issue?.message ?? "invalid"}`,
      ),
    );
  }
  const habit = parsed.data;
  const fields: [string, string | undefined][] = [
    ["name", habit.name],
    ["description", habit.description],
    ["output.template", habit.output.template],
    ...habit.steps.flatMap((step, i): [string, string | undefined][] => [
      [`steps.${i + 1}.source`, step.source],
      [`steps.${i + 1}.action`, step.action],
      [`steps.${i + 1}.filter`, step.filter],
    ]),
  ];
  for (const [field, value] of fields) {
    // The SKILL.md layout is one line per field.
    if (value && /[\r\n]/.test(value)) {
      return err(invalid(`Invalid habit: ${field} must be one line.`));
    }
    const kind = value ? findSecret(value) : undefined;
    if (kind) {
      return err(
        invalid(
          `Refused: ${field} looks like a secret (${kind}). Habits never hold credentials; your agent's connected tools already have access.`,
        ),
      );
    }
  }
  return ok(habit);
}

export function normaliseHabitName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

const PREAMBLE =
  "Run these steps in order with your own connected tools (MCP servers, CLIs). If a source is not connected, say so in one line and continue. Prism does not fetch anything. Then write the result in the output format below.";

/** `github: list my open PRs | repo:me/x` → {source, action, filter}. */
export function parseStep(text: string): HabitStep | undefined {
  const colon = text.indexOf(":");
  if (colon <= 0) return undefined;
  const source = text.slice(0, colon).trim();
  const [action = "", ...rest] = text.slice(colon + 1).split("|");
  const filter = rest.join("|").trim();
  if (!source || !action.trim()) return undefined;
  return { source, action: action.trim(), ...(filter ? { filter } : {}) };
}

/** Skill folder name: `start my day` → `start-my-day`. */
export function habitSlug(name: string): string {
  return (
    normaliseHabitName(name)
      .replace(/[^a-z0-9 ]/g, "")
      .trim()
      .replace(/ +/g, "-") || "habit"
  );
}

/** Marks a SKILL.md as a habit; other skills in the folder are left alone. */
const HABIT_KIND = "  kind: prism-habit";

/**
 * A habit as a SKILL.md. The body has a fixed layout so Prism can read it
 * back: `# name`, an optional `Description:` line, the preamble, `## Steps`
 * as `N. source: action | filter`, and `## Output` as `format: template`.
 */
export function habitSkillMarkdown(habit: Habit): string {
  const when = `Use when the user asks to run "${habit.name}".`;
  return [
    "---",
    `name: ${habitSlug(habit.name)}`,
    `description: ${JSON.stringify(`Habit: ${habit.description ? `${habit.description.replace(/[.!?]+$/, "")}. ` : ""}${when}`)}`,
    "metadata:",
    HABIT_KIND,
    "---",
    "",
    `# ${habit.name}`,
    "",
    ...(habit.description ? [`Description: ${habit.description}`, ""] : []),
    PREAMBLE,
    "",
    "## Steps",
    "",
    ...habit.steps.map(
      (step, i) =>
        `${i + 1}. ${step.source}: ${step.action}${step.filter ? ` | ${step.filter}` : ""}`,
    ),
    "",
    "## Output",
    "",
    habit.output.template
      ? `${habit.output.format}: ${habit.output.template}`
      : habit.output.format,
    "",
  ].join("\n");
}

/** `undefined` when the file is some other skill, not a habit. */
export function parseHabitSkill(
  text: string,
): Result<Habit, PrismError> | undefined {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!front || !front[1]!.split("\n").includes(HABIT_KIND)) return undefined;
  const body = text.slice(front[0].length);
  const section = (heading: string) =>
    (body.split(`\n## ${heading}\n`)[1] ?? "").split("\n## ")[0]!;
  const steps = section("Steps")
    .split("\n")
    .flatMap((line) => {
      const item = /^\d+\.\s+(.+)$/.exec(line.trim());
      return item ? [parseStep(item[1]!) ?? { source: "", action: "" }] : [];
    });
  const outputLine =
    section("Output")
      .split("\n")
      .find((line) => line.trim()) ?? "";
  const colon = outputLine.indexOf(":");
  const format = (colon < 0 ? outputLine : outputLine.slice(0, colon)).trim();
  const template = colon < 0 ? "" : outputLine.slice(colon + 1).trim();
  const description = /^Description: (.+)$/m.exec(body)?.[1]?.trim();
  return validateHabit({
    name: /^# (.+)$/m.exec(body)?.[1]?.trim(),
    ...(description ? { description } : {}),
    steps,
    output: { format, ...(template ? { template } : {}) },
  });
}

type HabitEntry = { readonly habit: Habit; readonly dir: string };

async function readHabitEntries(
  env: NodeJS.ProcessEnv,
): Promise<Result<HabitEntry[], PrismError>> {
  const root = habitsDir(env);
  let names: string[];
  try {
    names = (await readdir(root)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return ok([]);
    throw error;
  }
  const entries: HabitEntry[] = [];
  for (const name of names) {
    const dir = join(root, name);
    let text: string;
    try {
      text = await readFile(join(dir, "SKILL.md"), "utf8");
    } catch {
      continue;
    }
    const habit = parseHabitSkill(text);
    if (!habit) continue;
    if (!habit.ok) {
      return err(
        invalid(
          `${join(dir, "SKILL.md")} is not a valid habit: ${habit.error.message}`,
        ),
      );
    }
    entries.push({ habit: habit.value, dir });
  }
  return ok(entries);
}

async function writeHabitSkill(
  habit: Habit,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const dir = join(habitsDir(env), habitSlug(habit.name));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "SKILL.md");
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, habitSkillMarkdown(habit), { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
  return dir;
}

/** Deletes the habit's SKILL.md, and its folder when nothing else is in it. */
async function removeHabitSkill(dir: string): Promise<void> {
  await rm(join(dir, "SKILL.md"), { force: true });
  await rmdir(dir).catch(() => undefined);
}

/** Refuses a new slug that already holds another skill. */
function slugTaken(
  habit: Habit,
  env: NodeJS.ProcessEnv,
): Result<never, PrismError> | undefined {
  const dir = join(habitsDir(env), habitSlug(habit.name));
  return existsSync(dir)
    ? err(invalid(`${dir} already holds another skill. Pick another name.`))
    : undefined;
}

/**
 * One-time move of `~/.prism/habits.json` into habit skills. Habits already
 * present as skills are kept as they are; the old file is renamed to a
 * timestamped backup, so a second run finds nothing to do.
 */
export async function migrateLegacyHabits(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<number, PrismError>> {
  const legacy = legacyHabitsPath(env);
  let raw: string;
  try {
    raw = await readFile(legacy, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return ok(0);
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return err(
      invalid(`${legacy} is not valid JSON: ${(error as Error).message}`),
    );
  }
  const parsed = HabitsFileSchema.safeParse(json);
  if (!parsed.success) {
    return err(invalid(`${legacy} does not match the habits schema`));
  }
  const existing = await readHabitEntries(env);
  if (!existing.ok) return existing;
  const have = new Set(
    existing.value.map((e) => normaliseHabitName(e.habit.name)),
  );
  let moved = 0;
  for (const habit of parsed.data.habits) {
    if (have.has(normaliseHabitName(habit.name))) continue;
    const valid = validateHabit(habit);
    if (!valid.ok) return err(invalid(`${legacy}: ${valid.error.message}`));
    if (slugTaken(valid.value, env)) {
      return err(
        invalid(
          `${legacy}: habit "${habit.name}" clashes with an existing skill folder.`,
        ),
      );
    }
    await writeHabitSkill(valid.value, env);
    have.add(normaliseHabitName(habit.name));
    moved += 1;
  }
  await rename(legacy, `${legacy}.migrated-${Date.now()}.bak`).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    },
  );
  recordEvent(
    { event: "habit.migrate", outcome: "ok", detail: { habits: moved } },
    { env },
  );
  return ok(moved);
}

export async function readHabits(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<HabitsFile, PrismError>> {
  const migrated = await migrateLegacyHabits(env);
  if (!migrated.ok) return migrated;
  const entries = await readHabitEntries(env);
  if (!entries.ok) return entries;
  return ok({ version: 1, habits: entries.value.map((e) => e.habit) });
}

export type HabitMatch =
  | { readonly kind: "found"; readonly habit: Habit }
  | { readonly kind: "missing"; readonly near: readonly string[] };

/** Exact (normalised) name wins; then a unique prefix/substring match. */
export function findHabit(habits: readonly Habit[], name: string): HabitMatch {
  const wanted = normaliseHabitName(name);
  const exact = habits.find((h) => normaliseHabitName(h.name) === wanted);
  if (exact) return { kind: "found", habit: exact };
  const squash = (s: string) => normaliseHabitName(s).replace(/ /g, "");
  const loose = habits.filter(
    (h) =>
      squash(h.name).includes(squash(name)) ||
      squash(name).includes(squash(h.name)),
  );
  if (loose.length === 1) return { kind: "found", habit: loose[0]! };
  const words = new Set(wanted.split(" "));
  const near = habits
    .filter((h) =>
      normaliseHabitName(h.name)
        .split(" ")
        .some((w) => words.has(w)),
    )
    .map((h) => h.name);
  return {
    kind: "missing",
    near: loose.length > 1 ? loose.map((h) => h.name) : near,
  };
}

function logEvent(event: string, habit: Habit, env: NodeJS.ProcessEnv): void {
  // Name and step count only: never step text (HAB-11).
  recordEvent(
    {
      event,
      outcome: "ok",
      detail: { habit: habit.name, steps: habit.steps.length },
    },
    { env },
  );
}

export async function addHabit(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<Habit, PrismError>> {
  const valid = validateHabit(input);
  if (!valid.ok) return valid;
  const file = await readHabits(env);
  if (!file.ok) return file;
  const key = normaliseHabitName(valid.value.name);
  if (file.value.habits.some((h) => normaliseHabitName(h.name) === key)) {
    return err(
      invalid(
        `A habit named "${valid.value.name}" already exists. Use \`prism habit edit\`.`,
      ),
    );
  }
  const taken = slugTaken(valid.value, env);
  if (taken) return taken;
  await writeHabitSkill(valid.value, env);
  logEvent("habit.add", valid.value, env);
  return ok(valid.value);
}

export async function replaceHabit(
  name: string,
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<Habit, PrismError>> {
  const valid = validateHabit(input);
  if (!valid.ok) return valid;
  const migrated = await migrateLegacyHabits(env);
  if (!migrated.ok) return migrated;
  const entries = await readHabitEntries(env);
  if (!entries.ok) return entries;
  const key = normaliseHabitName(name);
  const entry = entries.value.find(
    (e) => normaliseHabitName(e.habit.name) === key,
  );
  if (!entry) return err(invalid(`No habit named "${name}".`));
  const newKey = normaliseHabitName(valid.value.name);
  if (
    newKey !== key &&
    entries.value.some((e) => normaliseHabitName(e.habit.name) === newKey)
  ) {
    return err(invalid(`A habit named "${valid.value.name}" already exists.`));
  }
  const moved = join(habitsDir(env), habitSlug(valid.value.name)) !== entry.dir;
  if (moved) {
    const taken = slugTaken(valid.value, env);
    if (taken) return taken;
  }
  await writeHabitSkill(valid.value, env);
  if (moved) await removeHabitSkill(entry.dir);
  logEvent("habit.edit", valid.value, env);
  return ok(valid.value);
}

export async function removeHabit(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<Habit, PrismError>> {
  const migrated = await migrateLegacyHabits(env);
  if (!migrated.ok) return migrated;
  const entries = await readHabitEntries(env);
  if (!entries.ok) return entries;
  const key = normaliseHabitName(name);
  const entry = entries.value.find(
    (e) => normaliseHabitName(e.habit.name) === key,
  );
  if (!entry) return err(invalid(`No habit named "${name}".`));
  await removeHabitSkill(entry.dir);
  logEvent("habit.remove", entry.habit, env);
  return ok(entry.habit);
}

/** What the `habits` MCP tool returns for one habit. */
export function habitInstructions(habit: Habit) {
  const known = new Set<string>(HABIT_SOURCES);
  return {
    name: habit.name,
    ...(habit.description ? { description: habit.description } : {}),
    preamble: PREAMBLE,
    steps: habit.steps.map((step, i) => ({
      n: i + 1,
      source: step.source,
      action: step.action,
      ...(step.filter ? { filter: step.filter } : {}),
      ...(known.has(step.source.toLowerCase())
        ? {}
        : { note: "unknown source label: use whichever tool fits" }),
    })),
    output: habit.output,
  };
}
