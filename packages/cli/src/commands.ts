/**
 * The command table (M-028 spine, filled out in M-029).
 *
 * One declaration per command, in the order they appear in the README. A test
 * compares the two, so a command cannot ship undocumented and the README
 * cannot describe a command that does not exist.
 */

import { agentsMdCommand } from "./commands/agents-md.js";
import { dataCommand } from "./commands/data-prune.js";
import { envelopeCommand } from "./commands/envelope.js";
import { graphCommand } from "./commands/graph.js";
import { receiptsCommand } from "./commands/receipts.js";
import {
  forgetCommand,
  memoriesCommand,
  rememberCommand,
} from "./commands/memory.js";
import { findingsCommand } from "./commands/findings.js";
import {
  blastCommand,
  prepareCommand,
  renameCommand,
  reviewCommand,
  safeDeleteCommand,
  testImpactCommand,
} from "./commands/change.js";
import { overviewCommand } from "./commands/overview.js";
import { doctorCommand } from "./commands/doctor.js";
import { indexCommand } from "./commands/index-command.js";
import {
  cyclesCommand,
  depsCommand,
  refsCommand,
  routeCommand,
  packagesCommand,
  symbolCommand,
} from "./commands/structure.js";
import { explainCommand, exploreCommand } from "./commands/understand.js";
import {
  FAIL_ON_BAND_OPTION,
  FAIL_ON_COUNT_OPTION,
  FORMAT_OPTION,
  LIMIT_OPTION,
  IN_OPTION,
  SYMBOL_OPTIONS,
  type CommandSpec,
} from "./registry.js";

export const COMMANDS: readonly CommandSpec[] = [
  {
    name: "doctor",
    group: "Diagnostics",
    summary: "Check the environment, workspace and index",
    handler: doctorCommand,
    options: [
      {
        flags: "--ci",
        description:
          "Extra CI checks (e.g. warn on shallow clones that truncate history)",
      },
      {
        flags: "--surfaces",
        description:
          "Show which Prism each editor launches. Fails inside this repo if any of them is the published package.",
      },
    ],
    examples: ["prism doctor", "prism doctor --ci", "prism doctor --surfaces"],
  },
  {
    name: "data",
    group: "Diagnostics",
    summary: "Prune Prism's local library (dry run unless --yes)",
    handler: dataCommand,
    arguments: [
      {
        syntax: "prune",
        description:
          "List empty workspace folders, caches of deleted checkouts, and untracked worktrees",
      },
    ],
    examples: ["prism data prune", "prism data prune --yes"],
  },
  {
    name: "index",
    group: "Diagnostics",
    summary: "Build or refresh the repository index",
    handler: indexCommand,
    examples: ["prism index"],
  },
  {
    name: "graph",
    group: "Diagnostics",
    summary: "The background daemon that keeps the graph fresh",
    handler: graphCommand,
    arguments: [
      {
        syntax: "[action]",
        description: "status (default), serve, stop, refresh, or export",
      },
    ],
    options: [
      {
        flags: "--out <dir>",
        description: "export: where to write graph.json",
      },
    ],
    examples: [
      "prism graph",
      "prism graph serve",
      "prism graph export --out .prism/graph",
    ],
  },
  {
    name: "completions",
    group: "Diagnostics",
    summary: "Print shell completion script (bash, zsh, or fish)",
    handler: async (context) => {
      const { completionsCommand } = await import("./commands/completions.js");
      return completionsCommand(context);
    },
    arguments: [
      {
        syntax: "<shell>",
        description: "Shell to generate for: bash, zsh, or fish",
      },
    ],
    examples: [
      "prism completions bash >> ~/.bashrc",
      "prism completions zsh > ~/.zfunc/_prism",
    ],
  },

  {
    name: "overview",
    group: "Understand a repository",
    summary: "What this repository is: DNA, stack and landmarks",
    handler: overviewCommand,
    options: [LIMIT_OPTION],
    examples: ["prism overview --json | jq '.data.dna.frameworks'"],
  },
  {
    name: "explain",
    group: "Understand a repository",
    summary: "What a file or folder is for, and who owns it",
    handler: explainCommand,
    arguments: [{ syntax: "<path>", description: "File or folder to explain" }],
    examples: ["prism explain src/server"],
  },
  {
    name: "explore",
    group: "Understand a repository",
    summary: "Usages, ownership and similar code for a file or symbol",
    handler: exploreCommand,
    arguments: [
      { syntax: "<target>", description: "File path, or symbol with --symbol" },
    ],
    options: [...SYMBOL_OPTIONS, LIMIT_OPTION],
    examples: ["prism explore src/index.ts"],
  },
  {
    name: "packages",
    group: "Understand a repository",
    summary: "Every package in the workspace and where it lives",
    handler: packagesCommand,
    options: [LIMIT_OPTION],
    examples: ["prism packages"],
  },

  {
    name: "prepare",
    group: "Assess a change",
    summary: "Files, reuse, and House Style for a task — never file bodies",
    handler: prepareCommand,
    arguments: [
      {
        syntax: "<task...>",
        description: "What you are about to change, in plain language",
      },
    ],
    options: [
      {
        flags: "--budget <n>",
        description:
          "Token budget for the whole answer (default 2000, max 6000)",
      },
    ],
    examples: ['prism prepare --json "add caching to fetchUser"'],
  },
  {
    name: "blast",
    group: "Assess a change",
    summary: "What breaks if this file or symbol changes",
    handler: blastCommand,
    arguments: [
      { syntax: "<target>", description: "File path, or symbol with --symbol" },
    ],
    options: [
      ...SYMBOL_OPTIONS,
      {
        flags: "--delete",
        description: "Assess a deletion rather than an edit",
      },
      FAIL_ON_BAND_OPTION,
      LIMIT_OPTION,
    ],
    examples: ["prism blast src/core/index.ts --fail-on high"],
  },
  {
    name: "review",
    group: "Assess a change",
    summary: "Risk of the current changes, or of the paths you name",
    handler: reviewCommand,
    arguments: [
      {
        syntax: "[paths...]",
        description: "Files to review (default: the working-tree diff)",
      },
    ],
    options: [
      { flags: "--base <rev>", description: "Diff against a git revision" },
      FAIL_ON_BAND_OPTION,
      LIMIT_OPTION,
      FORMAT_OPTION,
    ],
    examples: [
      "prism review --base origin/main --fail-on high",
      "prism review --base origin/main --format sarif",
    ],
  },
  {
    name: "safe-delete",
    group: "Assess a change",
    summary: "Whether a file or symbol can be removed",
    handler: safeDeleteCommand,
    arguments: [
      { syntax: "<target>", description: "File path, or symbol with --symbol" },
    ],
    options: [...SYMBOL_OPTIONS, LIMIT_OPTION],
    examples: ["prism safe-delete src/legacy/old.ts"],
  },
  {
    name: "rename",
    group: "Assess a change",
    summary: "Every edit site a rename would touch",
    handler: renameCommand,
    arguments: [
      { syntax: "<target>", description: "File path, or symbol with --symbol" },
      { syntax: "[newName]", description: "Proposed new name" },
    ],
    options: [...SYMBOL_OPTIONS, LIMIT_OPTION],
    examples: ["prism rename src/util.ts src/helpers.ts"],
  },
  {
    name: "test-impact",
    group: "Assess a change",
    summary: "Tests that a change can reach",
    handler: testImpactCommand,
    arguments: [
      { syntax: "<target>", description: "File path, or symbol with --symbol" },
    ],
    options: [...SYMBOL_OPTIONS, FAIL_ON_COUNT_OPTION, LIMIT_OPTION],
    examples: ["prism test-impact src/core/index.ts"],
  },

  {
    name: "deps",
    group: "Inspect structure",
    summary: "Dependency graph size and its most connected nodes",
    handler: depsCommand,
    options: [
      { flags: "--packages", description: "Aggregate files into packages" },
      LIMIT_OPTION,
    ],
    examples: ["prism deps --packages"],
  },
  {
    name: "cycles",
    group: "Inspect structure",
    summary: "Import and re-export cycles",
    handler: cyclesCommand,
    options: [
      { flags: "--packages", description: "Aggregate files into packages" },
      FAIL_ON_COUNT_OPTION,
      LIMIT_OPTION,
      FORMAT_OPTION,
    ],
    examples: ["prism cycles --fail-on any", "prism cycles --format sarif"],
  },
  {
    name: "symbol",
    group: "Inspect structure",
    summary: "Find where a symbol is declared",
    handler: symbolCommand,
    arguments: [{ syntax: "<name>", description: "Symbol name" }],
    options: [
      IN_OPTION,
      { flags: "--kind <kind>", description: "Filter by kind, e.g. function" },
      LIMIT_OPTION,
    ],
    examples: ["prism symbol createWorkspace"],
  },
  {
    name: "refs",
    group: "Inspect structure",
    summary: "Find who references a symbol",
    handler: refsCommand,
    arguments: [{ syntax: "<name>", description: "Symbol name" }],
    options: [IN_OPTION, LIMIT_OPTION],
    examples: ["prism refs riskToBand"],
  },
  {
    name: "route",
    group: "Inspect structure",
    summary: "How one file reaches another through dependencies",
    handler: routeCommand,
    arguments: [
      { syntax: "<from>", description: "Starting file" },
      { syntax: "<to>", description: "Destination file" },
    ],
    options: [
      {
        flags: "--alternatives <n>",
        description: "How many distinct routes to return",
      },
    ],
    examples: ["prism route src/cli.ts src/output.ts"],
  },

  {
    name: "agents-md",
    group: "Understand a repository",
    summary:
      "Generate or verify the Living AGENTS.md (never written to the repo)",
    handler: agentsMdCommand,
    arguments: [
      {
        syntax: "<action>",
        description: "generate or check",
      },
    ],
    examples: ["prism agents-md generate", "prism agents-md check"],
  },
  {
    name: "findings",
    group: "Understand a repository",
    summary: "Unused exports, duplicate implementations, wrapper functions",
    handler: findingsCommand,
    arguments: [
      { syntax: "<action>", description: "list, mute, or unmute" },
      {
        syntax: "[fingerprint]",
        description: "Required for mute/unmute — a finding's fingerprint field",
      },
    ],
    options: [
      {
        flags: "--all",
        description: "list: include findings already muted",
      },
    ],
    examples: ["prism findings list", "prism findings mute a3f8c5f0c392dbeb"],
  },
  {
    name: "envelope",
    group: "Assess a change",
    summary:
      "What Prism put into agents' context here, by tool, and what ran over budget",
    handler: envelopeCommand,
    options: [
      { flags: "--days <n>", description: "Window to report (default 7)" },
    ],
    examples: ["prism envelope", "prism envelope --days 30 --json"],
  },
  {
    name: "receipts",
    group: "Assess a change",
    summary: "List the change receipts the stop hook wrote, or show one",
    handler: receiptsCommand,
    arguments: [
      { syntax: "[action]", description: "list (default) or show" },
      { syntax: "[n]", description: "show: which receipt, 1 is the newest" },
    ],
    options: [
      { flags: "--as <format>", description: "show: text, markdown, or svg" },
      LIMIT_OPTION,
    ],
    examples: [
      "prism receipts",
      "prism receipts show 1 --as markdown > receipt.md",
    ],
  },
  {
    name: "remember",
    group: "Memory",
    summary: "Save a note about this repository for Prepare to hand back",
    handler: rememberCommand,
    arguments: [
      { syntax: "<note...>", description: "The note, in plain language" },
    ],
    options: [
      { flags: "--symbol <name>", description: "Anchor the note to a symbol" },
      { flags: "--path <path>", description: "Anchor the note to a path" },
    ],
    examples: [
      'prism remember "use lruCache, never a bare Map" --symbol lruCache',
    ],
  },
  {
    name: "forget",
    group: "Memory",
    summary: "Forget memories by id or by matching text",
    handler: forgetCommand,
    arguments: [
      {
        syntax: "<id-or-text...>",
        description: "A memory id or part of its text",
      },
    ],
    examples: ["prism forget 3f9a2c1b7e04", "prism forget lruCache"],
  },
  {
    name: "memories",
    group: "Memory",
    summary: "List the notes saved for this repository",
    handler: memoriesCommand,
    examples: ["prism memories", "prism memories --json"],
  },
];

export const COMMANDS_BY_NAME = new Map(
  COMMANDS.map((command) => [command.name, command]),
);
