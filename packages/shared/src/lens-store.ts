/**
 * The lens store (ADR-0059): definitions, memory, and review history, private
 * under `~/.prism/workspaces/<key>/lenses/store.json`. Never in the repo.
 *
 * Node-only. Import from `@repo-prism/shared/lens-store`, never the barrel.
 * MCP, the Dashboard dev server, and the IDE host all read the same file.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { PrismError } from "./errors.js";
import {
  LENS_EVIDENCE,
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
import { workspacePrismDir } from "./prism-home.js";
import type { Result } from "./result.js";
import { isFixturePath, isTestPath } from "./test-paths.js";
import { offLimitReason } from "./work-order.js";

const StoreSchema = z.object({
  lenses: z.array(LensDefinitionSchema),
  facts: z.array(LensFactSchema),
  reviews: z.array(LensReviewRecordSchema),
});
export type LensStore = z.infer<typeof StoreSchema>;

const EMPTY: LensStore = { lenses: [], facts: [], reviews: [] };

export function lensStorePath(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(workspacePrismDir(workspaceRoot, env), "lenses", "store.json");
}

/** A missing or unreadable store is empty, never an error. */
export async function readLensStore(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LensStore> {
  try {
    const parsed = StoreSchema.safeParse(
      JSON.parse(await readFile(lensStorePath(workspaceRoot, env), "utf8")),
    );
    return parsed.success ? parsed.data : EMPTY;
  } catch {
    return EMPTY;
  }
}

async function writeLensStore(
  workspaceRoot: string,
  store: LensStore,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const path = lensStorePath(workspaceRoot, env);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

export const DEFAULT_LENSES: readonly LensDefinition[] = [
  {
    id: "architect",
    name: "Architect",
    role: "Checks structure: package boundaries, import cycles, and decisions already recorded.",
    focus:
      "A change should not add a new dependency between packages, a new cycle, or contradict an accepted ADR.",
    tone: "Direct. Cite a path.",
    checklist: [
      "The change adds no import edge into a package it did not already depend on.",
      "The change adds no import cycle.",
      "Generated and vendor paths are untouched.",
    ],
    evidence: ["boundaries", "cycles", "rationale", "off-limits"],
    enabled: true,
    seededDefault: true,
  },
  {
    id: "qa",
    name: "QA",
    role: "Checks proof: whether a test reaches the change and the repo's own checks pass.",
    focus: "A claim is true only if a test or a command shows it.",
    tone: "Name the test file or the command.",
    checklist: [
      "Every changed source file is reached by at least one test.",
      "The repo's typecheck and test commands pass on the change.",
    ],
    evidence: ["test-impact", "verify-plan", "test-layout", "blast"],
    enabled: true,
    seededDefault: true,
  },
  {
    id: "dev",
    name: "Dev",
    role: "Checks fit: reuse of existing code and the house style of nearby files.",
    focus: "Prefer the helper that already exists over a second copy.",
    tone: "Point to the existing symbol.",
    checklist: [
      "The change does not duplicate a helper that already exists.",
      "New code follows the patterns of the files beside it.",
    ],
    evidence: ["reuse", "house-style", "duplicates"],
    enabled: true,
    seededDefault: true,
  },
];

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
  const lenses = store.lenses.length > 0 ? store.lenses : [...DEFAULT_LENSES];
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
};

const CustomLensDraftSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z.string().trim().min(1).max(200),
  focus: z.string().trim().min(1).max(600),
  tone: z.string().trim().max(200).optional(),
  checklist: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  evidence: z.array(z.enum(LENS_EVIDENCE)).min(1),
});

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
