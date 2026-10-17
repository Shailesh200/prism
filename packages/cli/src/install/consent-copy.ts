/**
 * Every user-facing string of `prism start`'s consent step, word for word
 * from Muse's `prism-start-consent-copy-v1.md` (the 8 cases), plus the 1.x
 * move line `wipe1x` prints. Change wording here only: logic and tests read
 * the plan data, and tests only check that these strings are what is shown.
 */

/** Roles of the files Prism writes; each has its label in the list. */
export type WriteRole =
  | "mcp"
  | "hooks"
  | "skill"
  | "rule"
  | "plugin"
  | "receipt"
  | "file";

export type ListRow = {
  /** `HOST_NAMES` value, or "Prism" for Prism's own config. */
  readonly agent: string;
  /** Display path, home shown as `~`; folders end in `/`. */
  readonly path: string;
  readonly role: WriteRole;
  /** Skill folder name, for the `skill` role. */
  readonly name?: string;
  /** Display path of a symlinked config's target, written through. */
  readonly linkTo?: string;
};

export type WipeLines = {
  /** Display path of the 1.x folder, e.g. `~/.prism`. */
  readonly home: string;
  /** Display path of the backup, ending in `/`. */
  readonly backupDir: string;
  readonly workspaces: number;
  readonly daemon: boolean;
  readonly hub: boolean;
  readonly customLenses: number;
  readonly keepsConfig: boolean;
  readonly invalidLenses: number;
  /** 1.x config keys this version does not know (or values it rejects). */
  readonly droppedConfigKeys?: readonly string[];
};

const AGENT_COL = 13;
const PATH_COL = 35;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Claude Code, Cursor, Codex and opencode". */
export function hostsSentence(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function roleLabel(row: Pick<ListRow, "role" | "name">): string {
  switch (row.role) {
    case "mcp":
      return "prism MCP server";
    case "hooks":
      return "Prism hooks";
    case "skill":
      return `${row.name ?? "prism"} skill`;
    case "rule":
      return "Prism rule";
    case "plugin":
      return "Prism plugin";
    case "receipt":
      return "turn on the receipt tool";
    case "file":
      return "Prism file";
  }
}

/** The file list: agent once per group, label after the path or below it. */
export function fileList(rows: readonly ListRow[]): string[] {
  const out: string[] = [];
  let last = "";
  for (const row of rows) {
    const agent = (row.agent === last ? "" : row.agent).padEnd(AGENT_COL);
    last = row.agent;
    // Both full paths (Muse): the link, and the target the write goes to.
    const path = row.linkTo
      ? `${row.path} ${CONSENT_COPY.symlinkNote(row.linkTo)}`
      : row.path;
    const label = roleLabel(row);
    if (path.length <= PATH_COL - 2) {
      out.push(`  ${agent}${path.padEnd(PATH_COL)}${label}`);
    } else {
      out.push(`  ${agent}${path}`);
      out.push(`${" ".repeat(2 + AGENT_COL + PATH_COL)}${label}`);
    }
  }
  return out;
}

/** Case 8 block, shown in the list before the question and in the dry run. */
export function wipeBlock(plan: WipeLines): string[] {
  const pad = (left: string) => `  ${left.padEnd(37)}→ `;
  const moved = [
    plural(plan.workspaces, "workspace index", "workspace indexes"),
    ...(plan.daemon ? ["daemon"] : []),
    ...(plan.hub ? ["hub"] : []),
  ].join(", ");
  const kept = [
    ...(plan.customLenses > 0
      ? [plural(plan.customLenses, "custom lens", "custom lenses")]
      : []),
    ...(plan.keepsConfig ? ["config"] : []),
  ].join(", ");
  return [
    `Prism 1.x data found in ${plan.home}. It will be moved, not deleted:`,
    `${pad(moved)}${plan.backupDir}`,
    ...(kept ? [`${pad(kept)}copied back for this version`] : []),
    ...(plan.invalidLenses > 0
      ? [
          `${pad(`${plural(plan.invalidLenses, "lens file", "lens files")} not compatible`)}stays in the backup only`,
        ]
      : []),
    ...(plan.droppedConfigKeys?.length
      ? [
          `${pad(`config ${plan.droppedConfigKeys.length === 1 ? "key" : "keys"} ${plan.droppedConfigKeys.join(", ")}`)}dropped (stays in the backup)`,
        ]
      : []),
  ];
}

export const CONSENT_COPY = {
  /** Case 1 */
  intro: (names: readonly string[]) =>
    `Prism will set up ${hostsSentence(names)}, then index this repo.`,
  willWrite: "It will write:",
  backedUpFirst: (dir: string) => `Each file is backed up first, to ${dir}.`,
  staysLocal: "Everything stays on this machine.",
  prompt: "Continue? [y/N] ",
  /** Case 2: exit 0 */
  declined: [
    "No changes made.",
    "To see the repo map without setting up agents, run `prism`.",
  ],
  /** Case 3 */
  backingUp: (count: number, dir: string) =>
    `Backing up ${plural(count, "file", "files")} to ${dir} …`,
  backupsAre: (dir: string) => `Backups are in ${dir}.`,
  /** After the path when the config is a symlink (Arc review; Muse: both full paths). */
  symlinkNote: (target: string) => `(symlink → ${target})`,
  /** Under the backup line: writes go through a symlink, so its target is what is backed up (Muse). */
  symlinkBackup: (targets: readonly string[]) =>
    `These are symlinks, so Prism backs up and changes the files they point to: ${targets.join(", ")}.`,
  uninstallHint: "`prism uninstall` removes what was added.",
  /** Case 4 */
  dryRunHead: "Dry run: nothing will be written.",
  dryIntro: (names: readonly string[]) =>
    `Prism would set up ${hostsSentence(names)}:`,
  dryBackedUp:
    "Each file would be backed up first, to ~/.prism-backups/<time>/.",
  dryFooter:
    "To set up, run `prism start`. In scripts, use `prism start --yes`.",
  /** Case 5 */
  yesIntro: (names: readonly string[]) =>
    `Prism will set up ${hostsSentence(names)} (--yes).`,
  /** Case 6: stderr, exit 1 */
  noTty: [
    "Prism needs a yes before it changes agent configs, and there is no terminal to",
    "ask in. No changes made.",
    "To see what it would write: prism start --dry-run",
    "To set up from a script:    prism start --yes",
  ],
  /** `--json` without `--yes` (Atlas, 16:38): the error message in the JSON. */
  jsonYesRequired:
    "--yes is required with --json: Prism did not change anything. The planned changes are in error.details.plan.",
  /** Case 7 */
  alreadySetUp: (version: string, names: readonly string[]) =>
    `Prism ${version} is already set up for ${names.join(", ")}. Nothing to change.`,
  /** Errors (unchanged) */
  noHosts:
    "No coding agent found (Claude Code, Cursor, Codex, opencode). Indexing anyway; run `prism install <client>` once one is set up.",
  /** Case 8, after `y` (replaces "cleared 1.x data") */
  wipeDone: (done: {
    readonly backupDir: string;
    readonly customLenses: number;
    readonly keepsConfig: boolean;
    readonly droppedConfigKeys: readonly string[];
  }) => {
    const kept = [
      ...(done.customLenses > 0
        ? [plural(done.customLenses, "custom lens", "custom lenses")]
        : []),
      ...(done.keepsConfig ? ["config"] : []),
    ];
    const parts = [
      `Moved 1.x data to ${done.backupDir}`,
      ...(kept.length > 0 ? [`kept ${kept.join(" and ")}`] : []),
      ...(done.droppedConfigKeys.length > 0
        ? [`config keys not carried over: ${done.droppedConfigKeys.join(", ")}`]
        : []),
    ];
    return `${parts.join("; ")}.`;
  },
} as const;

/**
 * What `prism install` and `prism start` print once an agent is set up, one
 * line per agent (Muse, final). Only Claude Code's stop waits for the
 * verdict; Codex and opencode get it with the next receipt, and Cursor has
 * no stop hook yet, so no agent but Claude Code is counted as giving a
 * verdict at stop.
 */
export const HOST_SETUP_COPY: Readonly<Record<string, string>> = {
  "Claude Code": "Claude Code: set up. Verdict when the agent stops.",
  Codex: "Codex: set up. The verdict comes with your next receipt.",
  opencode: "opencode: set up. The verdict comes with your next receipt.",
  Cursor:
    "Cursor: set up for receipts. There's no verdict when the agent stops yet. Ask it for a receipt.",
};

/** One `HOST_SETUP_COPY` line per agent set up, in the order given. */
export function installedLines(names: readonly string[]): string[] {
  return names.map((name) => HOST_SETUP_COPY[name] ?? `${name}: set up.`);
}

/** After `prism install`: the files it changed (Arc). Needs Muse's OK. */
export const INSTALL_COPY = {
  wrote: "Prism wrote:",
  nothingWritten: "No agent config changed.",
} as const;

/** The commands that ask before they write agent configs (`confirmAndWrite`). */
export type ConsentCommand =
  | "prism start"
  | "prism doctor --fix"
  | "prism upgrade";

/**
 * The lines that name the command. `prism start` keeps Muse's v1 words;
 * the `prism doctor --fix` lines are Muse's (round 2). The `prism upgrade`
 * lines are new and need Muse's OK.
 */
export function commandCopy(command: ConsentCommand): {
  readonly intro: (names: readonly string[]) => string;
  readonly yesIntro: (names: readonly string[]) => string;
  readonly dryIntro: (names: readonly string[]) => string;
  readonly dryFooter: string;
  readonly noTty: readonly string[];
  readonly declined: readonly string[];
} {
  if (command === "prism start")
    return {
      intro: CONSENT_COPY.intro,
      yesIntro: CONSENT_COPY.yesIntro,
      dryIntro: CONSENT_COPY.dryIntro,
      dryFooter: CONSENT_COPY.dryFooter,
      noTty: CONSENT_COPY.noTty,
      declined: CONSENT_COPY.declined,
    };
  if (command === "prism upgrade")
    return {
      intro: (names) =>
        `Prism will update its setup for ${hostsSentence(names)} to match the installed version.`,
      yesIntro: (names) =>
        `Prism will update its setup for ${hostsSentence(names)} (--yes).`,
      dryIntro: (names) =>
        `Prism would update its setup for ${hostsSentence(names)}:`,
      dryFooter:
        "To upgrade, run prism upgrade. In scripts, use prism upgrade --yes.",
      noTty: [
        "Prism needs a yes before it changes agent configs, and there is no terminal to",
        "ask in. No changes made.",
        "To see what it would write: prism upgrade --dry-run",
        "To upgrade from a script:   prism upgrade --yes",
      ],
      declined: ["No changes made."],
    };
  return {
    intro: (names) =>
      `Prism will update its setup for ${hostsSentence(names)} to match the installed version.`,
    yesIntro: (names) =>
      `Prism will update its setup for ${hostsSentence(names)} (--yes).`,
    dryIntro: (names) =>
      `Prism would update its setup for ${hostsSentence(names)}:`,
    // No backticks (Muse): a terminal shows them as literal characters.
    dryFooter:
      "To update, run prism doctor --fix. In scripts, use prism doctor --fix --yes.",
    noTty: [
      "Prism needs a yes before it changes agent configs, and there is no terminal to",
      "ask in. No changes made.",
      "To see what it would write: prism doctor --fix --dry-run",
      "To update from a script:    prism doctor --fix --yes",
    ],
    declined: ["No changes made."],
  };
}
