import {
  DeveloperPersona,
  StackDomain,
  type DnaReport,
  type StackProfile,
  type StackSignal,
} from "@prism/shared";

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".dart": "dart",
  ".ipynb": "jupyter",
  ".tf": "hcl",
};

const PM_SIGNAL_TO_NAME: Record<string, string> = {
  "pm-bun": "bun",
  "pm-pnpm": "pnpm",
  "pm-yarn": "yarn",
  "pm-npm": "npm",
};

const TEST_SIGNAL_IDS = new Set(["test-vitest", "test-jest", "test-pytest"]);

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function languageShares(
  filePaths: readonly string[] | undefined,
): DnaReport["languages"] {
  if (!filePaths || filePaths.length === 0) return [];
  const counts = new Map<string, number>();
  let total = 0;
  for (const path of filePaths) {
    const base = path.includes("/")
      ? path.slice(path.lastIndexOf("/") + 1)
      : path;
    const dot = base.lastIndexOf(".");
    if (dot <= 0) continue;
    const ext = base.slice(dot).toLowerCase();
    const lang = EXT_TO_LANG[ext];
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return [];
  return [...counts.entries()]
    .map(([id, n]) => ({ id, share: n / total }))
    .sort((a, b) => b.share - a.share || a.id.localeCompare(b.id));
}

function frameworkIds(signals: readonly StackSignal[]): string[] {
  return uniqueSorted(
    signals
      .map((s) => s.id)
      .filter(
        (id) =>
          !id.startsWith("pm-") &&
          !id.startsWith("test-") &&
          !id.startsWith("mono-") &&
          id !== "nodejs-manifest" &&
          id !== "unknown",
      ),
  );
}

function packageManager(signals: readonly StackSignal[]): string | undefined {
  const ranked = ["pm-bun", "pm-pnpm", "pm-yarn", "pm-npm"] as const;
  for (const id of ranked) {
    if (signals.some((s) => s.id === id)) return PM_SIGNAL_TO_NAME[id];
  }
  if (signals.some((s) => s.id === "nodejs-manifest")) return "npm";
  return undefined;
}

function testRunners(signals: readonly StackSignal[]): string[] {
  return uniqueSorted(
    signals
      .filter((s) => TEST_SIGNAL_IDS.has(s.id))
      .map((s) => s.id.replace(/^test-/, "")),
  );
}

function architectureHints(profile: StackProfile): string[] {
  const hints: string[] = [];
  const domains = new Set(profile.domains);
  const ids = new Set(profile.signals.map((s) => s.id));

  if (
    ids.has("mono-turbo") ||
    ids.has("mono-nx") ||
    ids.has("mono-moon") ||
    ids.has("pm-pnpm")
  ) {
    hints.push("monorepo");
    hints.push("package_based");
  }
  if (domains.has(StackDomain.FRONTEND) && domains.has(StackDomain.BACKEND)) {
    hints.push("client_server");
  }
  if (ids.has("data-jupyter")) hints.push("notebook_heavy");
  if (
    domains.has(StackDomain.DEVOPS_PLATFORM) ||
    ids.has("devops-docker") ||
    ids.has("devops-terraform") ||
    ids.has("devops-k8s")
  ) {
    hints.push("infra_heavy");
  }
  if (domains.has(StackDomain.DATA_ML_AI)) hints.push("ml_ai_surfaces");
  return uniqueSorted(hints);
}

/**
 * Enrich a stack profile with derived personas (e.g. fullstack when FE+BE).
 */
export function enrichStackProfile(profile: StackProfile): StackProfile {
  const domains = new Set(profile.domains);
  const personas = new Set(profile.personas);
  if (
    domains.has(StackDomain.FRONTEND) &&
    domains.has(StackDomain.BACKEND) &&
    profile.signals.some(
      (s) => s.domain === StackDomain.FRONTEND && s.confidence >= 0.5,
    ) &&
    profile.signals.some(
      (s) => s.domain === StackDomain.BACKEND && s.confidence >= 0.5,
    )
  ) {
    personas.add(DeveloperPersona.FULLSTACK_ENGINEER);
  }
  const nextPersonas = uniqueSorted([...personas]);
  return {
    ...profile,
    packages: profile.packages ?? [],
    personas: nextPersonas,
    summary:
      profile.signals.length === 0
        ? "Partial DNA: no stack signals detected"
        : `Detected domains: ${profile.domains.join(", ") || "none"} (${profile.signals.length} signal(s)); personas: ${nextPersonas.join(", ") || "none"}`,
  };
}

export type AssembleDnaOptions = {
  readonly profile: StackProfile;
  /** Optional repo-relative paths (e.g. from last index) for language shares. */
  readonly filePaths?: readonly string[];
};

/** Assemble a DnaReport from a StackProfile (+ optional file paths). */
export function assembleDnaReport(options: AssembleDnaOptions): DnaReport {
  const profile = enrichStackProfile(options.profile);
  const frameworks = frameworkIds(profile.signals);
  const pm = packageManager(profile.signals);
  const runners = testRunners(profile.signals);
  const hints = architectureHints(profile);
  const languages = languageShares(options.filePaths);

  let summary: string;
  if (profile.signals.length === 0) {
    summary = "Partial DNA: no stack signals detected";
  } else {
    const parts = [
      profile.domains.length > 0
        ? `domains=${profile.domains.join(",")}`
        : null,
      frameworks.length > 0
        ? `frameworks=${frameworks.slice(0, 6).join(",")}`
        : null,
      pm ? `pm=${pm}` : null,
      profile.personas.length > 0
        ? `personas=${profile.personas.join(",")}`
        : null,
    ].filter(Boolean);
    summary = `Repository DNA: ${parts.join("; ")}`;
  }

  return {
    languages,
    frameworks,
    ...(pm === undefined ? {} : { packageManager: pm }),
    summary,
    stack: profile,
    architectureHints: hints,
    testRunners: runners,
  };
}
