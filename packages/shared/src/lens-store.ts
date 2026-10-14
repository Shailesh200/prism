/**
 * The lens store (ADR-0059, plan §5.3 "Storage"). Two files, never in a repo:
 *
 * - Lens definitions (built-in and custom) are global, per user:
 *   `~/.prism/lenses/lenses.json`. A lens added in one repository is there
 *   in every other one.
 * - Facts and review history are about one repository, so they stay in
 *   `~/.prism/workspaces/<key>/lenses/store.json`.
 *
 * Node-only. Import from `@repo-prism/shared/lens-store`, never the barrel.
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { PrismError } from "./errors.js";
import { recordEvent } from "./events.js";
import {
  LENS_CHECK_IDS,
  LENS_EVIDENCE,
  LensCheckIdSchema,
  LensDefinitionSchema,
  LensFactSchema,
  LensReviewRecordSchema,
  type LensDefinition,
  type LensEvidence,
  type LensFact,
  type LensReviewRecord,
  type LensVerdictValue,
  type LensView,
} from "./lenses.js";
import { invalidTrigger } from "./lens-route.js";
import { prismHomeDir, workspacePrismDir } from "./prism-home.js";
import type { Result } from "./result.js";
import { isFixturePath, isTestPath } from "./test-paths.js";
import { offLimitReason } from "./work-order.js";

const StoreSchema = z.object({
  lenses: z.array(LensDefinitionSchema),
  facts: z.array(LensFactSchema),
  reviews: z.array(LensReviewRecordSchema),
});
export type LensStore = z.infer<typeof StoreSchema>;

const DefinitionsSchema = z.object({ lenses: z.array(LensDefinitionSchema) });
const WorkspaceSchema = z.object({
  facts: z.array(LensFactSchema).default([]),
  reviews: z.array(LensReviewRecordSchema).default([]),
});

/** Per-repository facts and reviews. */
export function lensStorePath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(workspaceRoot, env), "lenses", "store.json");
}

/** Global lens definitions, shared by every repository (plan §5.3). */
export function lensDefinitionsPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(prismHomeDir(env), "lenses", "lenses.json");
}

type Loaded<T> = { readonly value: T | null };

/**
 * A missing file is empty. An unreadable or invalid one is also read as
 * empty, but it is moved aside and logged first, so the next write cannot
 * overwrite the owner's lenses without a trace.
 */
async function readJson<T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  env: NodeJS.ProcessEnv,
): Promise<Loaded<T>> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { value: null };
    throw error;
  }
  let parsed: z.SafeParseReturnType<unknown, T> | null = null;
  try {
    parsed = schema.safeParse(JSON.parse(text));
  } catch (error) {
    await quarantine(
      path,
      error instanceof Error ? error.message : String(error),
      env,
    );
    return { value: null };
  }
  if (!parsed.success) {
    await quarantine(path, parsed.error.message.slice(0, 200), env);
    return { value: null };
  }
  return { value: parsed.data };
}

async function quarantine(
  path: string,
  reason: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const aside = `${path}.corrupt-${Date.now()}`;
  await rename(path, aside);
  recordEvent(
    {
      event: "lens.store_corrupt",
      outcome: "degraded",
      reason,
      detail: { path, aside },
    },
    { env },
  );
}

export async function readLensStore(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LensStore> {
  const [definitions, workspace] = await Promise.all([
    readJson(lensDefinitionsPath(env), DefinitionsSchema, env),
    readJson(
      lensStorePath(workspaceRoot, env),
      StoreSchema.partial().passthrough(),
      env,
    ),
  ]);
  const local = WorkspaceSchema.parse({
    facts: workspace.value?.facts ?? [],
    reviews: workspace.value?.reviews ?? [],
  });
  // 1.x kept definitions per workspace. They are never read in 2.0 (§3.1a):
  // definitions come only from the global file.
  return {
    lenses: definitions.value?.lenses ?? [],
    facts: local.facts,
    reviews: local.reviews,
  };
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function writeLensStore(
  workspaceRoot: string,
  store: LensStore,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  await atomicWrite(lensDefinitionsPath(env), { lenses: store.lenses });
  await atomicWrite(lensStorePath(workspaceRoot, env), {
    facts: store.facts,
    reviews: store.reviews,
  });
}

const ARCHITECT_PROCEDURE = `You are the Architect lens: the senior pass on structure. Use it for a new feature, a plan, or a pull request. Read the repo's shape before you propose anything.

1. A recorded decision (an ADR or a package boundary) already covers this? Follow it, and cite it.
2. A package already owns this work? Put the change there. Do not open a new package or a parallel abstraction.
3. The change would add a dependency between packages, or a cycle? Do not, unless the task requires it. Name the edge if you must add one.
4. The smallest design that fits the layers this repo already has. No new framework.
5. On a pull request, read the code the change touches, not only the diff. Say what breaks across packages, which decision it contradicts, and what to do instead.

Never cut: an accepted decision, an off-limits path, or a boundary the repo already enforces.`;

const QA_PROCEDURE = `You are the QA lens. Find bugs. Do not redesign the feature.

1. Read the code the task names and the tests that reach it.
2. State a concrete failure: the input, what the code does, what goes wrong, and who it hits.
3. A bug with no test is still open. Name the test that should fail, or say that none reaches the file.
4. Check the edges the change did not touch but that depend on it: empty, duplicate, the wrong type.
5. Stop at findings. Each one cites a path. No new framework and no drive-by refactor.

A green command on the wrong files is not proof.`;

const DEV_PROCEDURE = `You are the Dev lens, for a daily fix. Finish the task with the smallest complete change.

1. Does this need to exist? Skip options and flexibility nobody asked for, and name what you skipped.
2. A helper, pattern, or type already in this codebase does it? Use that, the way the files beside it do.
3. Can one line say it? One line.
4. Otherwise the minimum that works, in the house style of the nearby files. No wrapper, config, or code for later.
5. A bug fix: find the callers, then fix the root cause once in the shared code.
6. New logic — a branch, a loop, money, or security — leaves one small test. A typo or a comment does not.

Never cut: validation, error handling, security, or anything the user asked for.`;

/** The three defaults as first shipped, so an unedited install can take the skill text. */
const PREVIOUS_DEFAULTS: readonly Pick<
  LensDefinition,
  "id" | "role" | "focus" | "checklist"
>[] = [
  {
    id: "architect",
    role: "Checks structure: package boundaries, import cycles, and decisions already recorded.",
    focus:
      "A change should not add a new dependency between packages, a new cycle, or contradict an accepted ADR.",
    checklist: [
      "The change adds no import edge into a package it did not already depend on.",
      "The change adds no import cycle.",
      "Generated and vendor paths are untouched.",
    ],
  },
  {
    id: "qa",
    role: "Checks proof: whether a test reaches the change and the repo's own checks pass.",
    focus: "A claim is true only if a test or a command shows it.",
    checklist: [
      "Every changed source file is reached by at least one test.",
      "The repo's typecheck and test commands pass on the change.",
    ],
  },
  {
    id: "dev",
    role: "Checks fit: reuse of existing code and the house style of nearby files.",
    focus: "Prefer the helper that already exists over a second copy.",
    checklist: [
      "The change does not duplicate a helper that already exists.",
      "New code follows the patterns of the files beside it.",
    ],
  },
];

export const DEFAULT_LENSES: readonly LensDefinition[] = [
  {
    id: "architect",
    name: "Architect",
    role: "Senior structure review for a new feature, a plan, or a pull request.",
    focus:
      "A change should land in the package that already owns it, add no new cycle, and follow a decision the repo already recorded.",
    tone: "Direct. Cite a path or a decision.",
    checklist: [
      "The change adds no import edge into a package it did not already depend on.",
      "The change adds no import cycle.",
      "Generated and vendor paths are untouched.",
      "The change does not contradict an accepted ADR.",
    ],
    evidence: ["boundaries", "cycles", "rationale", "off-limits"],
    enabled: true,
    seededDefault: true,
    triggers: [],
    checks: ["new_cross_package_edge", "new_value_cycle", "off_limits_touched"],
    overrules: [],
    procedure: ARCHITECT_PROCEDURE,
  },
  {
    id: "qa",
    name: "QA",
    role: "Senior bug hunt: a concrete failure, the path, and the test that should catch it.",
    focus:
      "A bug is real when you can name the input, the wrong result, and whether a test reaches it.",
    tone: "Name the test file or say that none reaches it.",
    checklist: [
      "Every changed source file is reached by at least one test, or the gap is named.",
      "A finding cites a path and a concrete failure.",
      "The check named is one this repo already runs.",
    ],
    evidence: ["test-impact", "verify-plan", "test-layout", "blast"],
    enabled: true,
    seededDefault: true,
    triggers: [],
    checks: [
      "untested_changed_symbol",
      "dependents_not_in_diff",
      "test_reaches_but_not_run",
    ],
    overrules: [],
    procedure: QA_PROCEDURE,
  },
  {
    id: "dev",
    name: "Dev",
    role: "Daily changes: the smallest complete fix, using what the repo already has.",
    focus:
      "Prefer the helper that already exists. New logic leaves one small test; a typo does not.",
    tone: "Point to the existing symbol.",
    checklist: [
      "The change does not duplicate a helper that already exists.",
      "New code follows the patterns of the files beside it.",
      "New non-trivial logic has one test, or the change is trivial.",
    ],
    evidence: ["reuse", "house-style", "duplicates"],
    enabled: true,
    seededDefault: true,
    triggers: [],
    checks: ["reuse_missed", "new_dependency_added", "untested_new_branch"],
    overrules: [],
    procedure: DEV_PROCEDURE,
  },
];

function sameChecklist(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length && left.every((item, i) => item === right[i])
  );
}

/**
 * Unedited Architect / QA / Dev pick up the skill text. A definition the owner
 * changed keeps their words; a missing procedure is filled in either way.
 */
export function applyDefaultProcedures(
  lenses: readonly LensDefinition[],
): LensDefinition[] {
  return lenses.map((lens) => {
    const fresh = DEFAULT_LENSES.find((row) => row.id === lens.id);
    if (!fresh || !lens.seededDefault) return lens;
    const previous = PREVIOUS_DEFAULTS.find((row) => row.id === lens.id);
    // Plan §5.3 upgrade safety: replace the shipped text only when the owner
    // changed nothing, including the name. Otherwise keep their words and
    // only fill what is empty.
    const untouched =
      previous !== undefined &&
      lens.name === fresh.name &&
      lens.role === previous.role &&
      lens.focus === previous.focus &&
      sameChecklist(lens.checklist, previous.checklist);
    if (untouched) {
      return {
        ...fresh,
        enabled: lens.enabled,
        triggers: lens.triggers,
        overrules: lens.overrules,
      };
    }
    return {
      ...lens,
      procedure: lens.procedure.trim() ? lens.procedure : fresh.procedure,
      checks: lens.checks.length > 0 ? lens.checks : fresh.checks,
    };
  });
}

/** What seeding reads. `PrismWorkspace` from Core satisfies this. */
export type LensSeedSource = {
  readonly rootPath: string;
  getIndex(): Result<
    { readonly files: readonly { readonly path: string }[] },
    PrismError
  >;
  getCycles(): Result<readonly (readonly string[])[], PrismError>;
  getDna(): Promise<
    Result<
      {
        readonly packageManager?: string | undefined;
        readonly frameworks: readonly string[];
        readonly testRunners: readonly string[];
        readonly languages: readonly {
          readonly id: string;
          readonly share: number;
        }[];
      },
      PrismError
    >
  >;
};

function seeded(
  lens: string,
  text: string,
  source: string,
  at: string,
): LensFact {
  return {
    id: randomUUID(),
    lens,
    text,
    origin: "seeded",
    source,
    createdAt: at,
  };
}

const ADR_FILE = /(?:^|\/)(?:plans\/adr|docs\/adr|adr)\/\d{3,4}-[^/]+\.md$/i;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function stripFile(id: string): string {
  return id.replace(/^file:/, "");
}

/**
 * Facts read from the index. Each cites the file or folder it came from.
 * Fixtures are test data, so they never become a fact about the repo.
 */
export async function seedFactsFrom(
  source: LensSeedSource,
  at: string = new Date().toISOString(),
): Promise<LensFact[]> {
  const facts: LensFact[] = [];
  const index = source.getIndex();
  const paths = (index.ok ? index.value.files.map((f) => f.path) : []).filter(
    (p) => !isFixturePath(p) && !p.includes("node_modules/"),
  );

  const manifests = paths.filter((p) => p.endsWith("/package.json"));
  if (manifests.length > 0) {
    facts.push(
      seeded(
        "architect",
        `${plural(manifests.length, "workspace package")} besides the root.`,
        manifests[0]!,
        at,
      ),
    );
  }

  const cycles = source.getCycles();
  if (cycles.ok) {
    const real = cycles.value
      .map((cycle) => cycle.map(stripFile))
      .filter(
        (cycle) => cycle.length > 0 && cycle.every((p) => !isFixturePath(p)),
      );
    const first = real[0];
    const base = (p: string) => p.replace(/^.*\//, "");
    facts.push(
      first
        ? seeded(
            "architect",
            `${plural(real.length, "import cycle")} today: ${[...first, first[0]!].map(base).join(" → ")}.`,
            first[0]!,
            at,
          )
        : seeded("architect", "No import cycles today.", "package.json", at),
    );
  }

  const adrs = paths.filter((p) => ADR_FILE.test(p));
  if (adrs.length > 0) {
    const byFolder = new Map<string, number>();
    for (const p of adrs) {
      const folder = p.replace(/\/[^/]+$/, "");
      byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);
    }
    const [folder, count] = [...byFolder.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0]!;
    facts.push(
      seeded(
        "architect",
        `${plural(count, "recorded decision")} in ${folder}.`,
        folder,
        at,
      ),
    );
  }

  const offLimits = paths.filter((p) => offLimitReason(p) !== undefined);
  if (offLimits.length > 0) {
    facts.push(
      seeded(
        "architect",
        `${plural(offLimits.length, "generated or vendor file")} off-limits.`,
        offLimits[0]!,
        at,
      ),
    );
  }

  const dna = await source.getDna();
  if (dna.ok && dna.value.testRunners.length > 0) {
    facts.push(
      seeded(
        "qa",
        `Tests run with ${dna.value.testRunners.join(", ")}.`,
        "package.json",
        at,
      ),
    );
  }
  const tests = paths.filter((p) => isTestPath(p));
  const sources = paths.filter(
    (p) =>
      /\.(tsx?|jsx?|mts|cts)$/.test(p) &&
      !isTestPath(p) &&
      !p.endsWith(".d.ts"),
  );
  if (tests.length > 0) {
    facts.push(
      seeded(
        "qa",
        `${plural(tests.length, "test file")} for ${plural(sources.length, "source file")}.`,
        tests[0]!,
        at,
      ),
    );
  } else if (sources.length > 0) {
    facts.push(seeded("qa", "No test files are indexed.", "package.json", at));
  }

  if (dna.ok) {
    if (dna.value.packageManager) {
      facts.push(
        seeded(
          "dev",
          `Package manager: ${dna.value.packageManager}.`,
          "package.json",
          at,
        ),
      );
    }
    const languages = dna.value.languages
      .filter((l) => l.share >= 0.05)
      .map((l) => `${l.id} ${Math.round(l.share * 100)}%`);
    if (languages.length > 0) {
      facts.push(
        seeded(
          "dev",
          `Languages: ${languages.join(", ")}.`,
          "package.json",
          at,
        ),
      );
    }
  }
  return facts;
}

/**
 * Create the default lenses if none exist, and refresh seeded facts.
 * Learned and user facts, definitions the user edited, and history are kept.
 */
export async function seedLenses(
  source: LensSeedSource,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LensStore> {
  const store = await readLensStore(source.rootPath, env);
  const lenses = applyDefaultProcedures(
    store.lenses.length > 0 ? store.lenses : [...DEFAULT_LENSES],
  );
  const kept = store.facts.filter((row) => row.origin !== "seeded");
  const next: LensStore = {
    lenses,
    facts: [...kept, ...(await seedFactsFrom(source))],
    reviews: store.reviews,
  };
  await writeLensStore(source.rootPath, next, env);
  return next;
}

export function lensViews(store: LensStore): LensView[] {
  return store.lenses.map((definition) => ({
    definition,
    facts: store.facts.filter((row) => row.lens === definition.id),
    history: store.reviews
      .filter((row) => row.lens === definition.id)
      .sort((a, b) => b.at.localeCompare(a.at)),
  }));
}

/**
 * The lenses as of the current index: creates the defaults on first use and
 * re-reads seeded facts every time. Learned facts, user facts, edited
 * definitions, and review history are kept.
 */
export async function loadLenses(
  source: LensSeedSource,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LensView[]> {
  return lensViews(await seedLenses(source, env));
}

export type LensVerdictInput = {
  readonly lens: string;
  readonly verdict: LensVerdictValue;
  readonly reasoning?: string | undefined;
  readonly failedChecks?: readonly string[] | undefined;
  readonly sequential?: boolean | undefined;
};

/** Store verdicts the host model returned. Unknown lens ids are dropped. */
export async function recordLensReviews(
  workspaceRoot: string,
  subject: string,
  evidence: readonly string[],
  verdicts: readonly LensVerdictInput[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<LensReviewRecord[]> {
  const store = await readLensStore(workspaceRoot, env);
  const known = new Set(store.lenses.map((row) => row.id));
  const at = new Date().toISOString();
  const recorded: LensReviewRecord[] = verdicts
    .filter((row) => known.has(row.lens))
    .map((row) => ({
      id: randomUUID(),
      lens: row.lens,
      at,
      subject: subject.slice(0, 500),
      evidence: evidence.slice(0, 60),
      verdict: row.verdict,
      reasoning: (row.reasoning ?? "").slice(0, 8000),
      failedChecks: (row.failedChecks ?? []).slice(0, 20),
      sequential: row.sequential ?? false,
    }));
  if (recorded.length > 0) {
    await writeLensStore(
      workspaceRoot,
      { ...store, reviews: [...store.reviews, ...recorded] },
      env,
    );
  }
  return recorded;
}

/** A lens the owner added. `seededDefault` stays false. */
export type CustomLensDraft = {
  readonly name: string;
  readonly role: string;
  readonly focus: string;
  readonly tone?: string | undefined;
  readonly checklist: readonly string[];
  readonly evidence: readonly LensEvidence[];
  readonly triggers?: readonly string[] | undefined;
  /** Data-backed checks this lens runs (plan §5.3); ids from LENS_CHECK_IDS. */
  readonly checks?: readonly string[] | undefined;
};

const CustomLensDraftSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z.string().trim().min(1).max(200),
  focus: z.string().trim().min(1).max(600),
  tone: z.string().trim().max(200).optional(),
  checklist: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  evidence: z.array(z.enum(LENS_EVIDENCE)).min(1),
  triggers: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  checks: z.array(z.string().trim().min(1)).max(20).optional(),
});

/** CL-5: an unknown check id is refused with the list of valid ones. */
export function unknownLensChecks(checks: readonly string[]): string | null {
  const valid = new Set<string>(LENS_CHECK_IDS);
  const unknown = checks.filter((id) => !valid.has(id));
  return unknown.length === 0
    ? null
    : `Unknown check ${unknown.join(", ")}. Valid checks: ${LENS_CHECK_IDS.join(", ")}.`;
}

/** Stable id from a display name, avoiding ids already in the store. */
export function lensIdFromName(
  name: string,
  taken: ReadonlySet<string>,
): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const stem = slug.length > 0 && /^[a-z]/.test(slug) ? slug : "lens";
  let id = stem.slice(0, 40);
  let n = 2;
  while (taken.has(id)) {
    const suffix = `-${n}`;
    id = `${stem.slice(0, 40 - suffix.length)}${suffix}`;
    n += 1;
  }
  return id;
}

/**
 * Append an owner-written lens. Inherited Architect / QA / Dev stay.
 * Does not re-seed facts; the next load does that.
 */
export async function addCustomLens(
  workspaceRoot: string,
  draft: CustomLensDraft,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LensView[]> {
  const parsed = CustomLensDraftSchema.safeParse(draft);
  if (!parsed.success) {
    throw new Error(
      "A custom lens needs a name, what it is, how it judges, at least one check, and at least one thing it reads.",
    );
  }
  const input = parsed.data;
  for (const phrase of input.triggers ?? []) {
    const refused = invalidTrigger(phrase);
    if (refused) throw new Error(`Trigger refused: ${refused}.`);
  }
  const unknownChecks = unknownLensChecks(input.checks ?? []);
  if (unknownChecks) throw new Error(unknownChecks);
  const store = await readLensStore(workspaceRoot, env);
  const lenses =
    store.lenses.length > 0 ? [...store.lenses] : [...DEFAULT_LENSES];
  if (
    lenses.some((row) => row.name.toLowerCase() === input.name.toLowerCase())
  ) {
    throw new Error(`A lens named ${input.name} already exists.`);
  }
  const definition = LensDefinitionSchema.parse({
    id: lensIdFromName(input.name, new Set(lenses.map((row) => row.id))),
    name: input.name,
    role: input.role,
    focus: input.focus,
    tone: input.tone ?? "",
    checklist: input.checklist,
    evidence: input.evidence,
    enabled: true,
    seededDefault: false,
    triggers: input.triggers ?? [],
    checks: input.checks ?? [],
    updatedAt: new Date().toISOString(),
  });
  const next: LensStore = { ...store, lenses: [...lenses, definition] };
  await writeLensStore(workspaceRoot, next, env);
  return lensViews(next);
}

/** Replace the written definition. The id stays, so memory and reviews stay with it. */
export async function updateLens(
  workspaceRoot: string,
  id: string,
  draft: CustomLensDraft,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LensView[]> {
  const parsed = CustomLensDraftSchema.safeParse(draft);
  if (!parsed.success) {
    throw new Error(
      "A lens needs a name, what it is, how it judges, at least one check, and at least one thing it reads.",
    );
  }
  const input = parsed.data;
  const store = await readLensStore(workspaceRoot, env);
  const lenses =
    store.lenses.length > 0 ? [...store.lenses] : [...DEFAULT_LENSES];
  const index = lenses.findIndex((row) => row.id === id);
  if (index < 0) throw new Error(`No lens named ${id}.`);
  if (
    lenses.some(
      (row, i) =>
        i !== index && row.name.toLowerCase() === input.name.toLowerCase(),
    )
  ) {
    throw new Error(`A lens named ${input.name} already exists.`);
  }
  const current = lenses[index]!;
  lenses[index] = LensDefinitionSchema.parse({
    ...current,
    name: input.name,
    role: input.role,
    focus: input.focus,
    tone: input.tone ?? "",
    checklist: input.checklist,
    evidence: input.evidence,
  });
  await writeLensStore(workspaceRoot, { ...store, lenses }, env);
  return lensViews({ ...store, lenses });
}

/** Drop a custom lens and its memory. Inherited lenses stay. */
export async function removeLens(
  workspaceRoot: string,
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LensView[]> {
  const store = await readLensStore(workspaceRoot, env);
  const lens = store.lenses.find((row) => row.id === id);
  if (!lens) throw new Error(`No lens named ${id}.`);
  if (lens.seededDefault) {
    throw new Error("Inherited lenses stay. Edit one instead of deleting it.");
  }
  const next: LensStore = {
    lenses: store.lenses.filter((row) => row.id !== id),
    facts: store.facts.filter((row) => row.lens !== id),
    reviews: store.reviews.filter((row) => row.lens !== id),
  };
  await writeLensStore(workspaceRoot, next, env);
  return lensViews(next);
}

/** Overrule a verdict. The note becomes a learned fact on that lens. */
export async function overrideLensReview(
  workspaceRoot: string,
  reviewId: string,
  note: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LensFact | null> {
  const store = await readLensStore(workspaceRoot, env);
  const review = store.reviews.find((row) => row.id === reviewId);
  if (!review) return null;
  const at = new Date().toISOString();
  const text = note.trim().slice(0, 500);
  const learned: LensFact = {
    id: randomUUID(),
    lens: review.lens,
    text,
    origin: "learned",
    source: `review ${reviewId.slice(0, 8)}`,
    createdAt: at,
  };
  await writeLensStore(
    workspaceRoot,
    {
      ...store,
      reviews: store.reviews.map((row) =>
        row.id === reviewId ? { ...row, override: { at, note: text } } : row,
      ),
      facts: [...store.facts, learned],
    },
    env,
  );
  return learned;
}

/** Content hash an overrule is pinned to (CL-2); null when the file is gone. */
export function contentFingerprint(root: string, path: string): string | null {
  const abs = join(root, path);
  if (!existsSync(abs)) return null;
  return createHash("sha256")
    .update(readFileSync(abs))
    .digest("hex")
    .slice(0, 16);
}

/** The fingerprint string an overrule stores for a path. */
export function pathFingerprint(path: string, hash: string): string {
  return `path:${path}:${hash}`;
}

/**
 * `prism lens override` (CL-2): remember that the owner overruled `check`
 * on `path` as it is now. The same finding on the same content reads
 * `overruled` with the note; any edit to the file re-opens it (CL-3).
 */
export async function addLensOverrule(
  workspaceRoot: string,
  input: {
    readonly lens: string;
    readonly check: string;
    readonly path: string;
    readonly note: string;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<LensDefinition> {
  const check = LensCheckIdSchema.safeParse(input.check);
  if (!check.success) {
    throw new Error(
      `Unknown check ${input.check}. Valid checks: ${LENS_CHECK_IDS.join(", ")}.`,
    );
  }
  const note = input.note.trim();
  if (!note) throw new Error("An overrule needs a note saying why.");
  const hash = contentFingerprint(workspaceRoot, input.path);
  if (!hash) throw new Error(`No file at ${input.path}.`);
  const store = await readLensStore(workspaceRoot, env);
  const lenses = applyDefaultProcedures(
    store.lenses.length > 0 ? store.lenses : DEFAULT_LENSES,
  );
  const index = lenses.findIndex((row) => row.id === input.lens);
  if (index < 0) throw new Error(`No lens named ${input.lens}.`);
  const current = lenses[index]!;
  const fingerprint = pathFingerprint(input.path, hash);
  const updated = LensDefinitionSchema.parse({
    ...current,
    overrules: [
      ...current.overrules.filter(
        (row) =>
          !(
            row.check === check.data &&
            row.fingerprint.startsWith(`path:${input.path}:`)
          ),
      ),
      {
        check: check.data,
        fingerprint,
        note: note.slice(0, 500),
        at: new Date().toISOString(),
      },
    ].slice(-200),
    updatedAt: new Date().toISOString(),
  });
  lenses[index] = updated;
  await writeLensStore(workspaceRoot, { ...store, lenses }, env);
  return updated;
}
