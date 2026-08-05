/**
 * The command table (M-028 spine, filled out in M-029).
 *
 * One declaration per command, in the order they appear in the README. A test
 * compares the two, so a command cannot ship undocumented and the README
 * cannot describe a command that does not exist.
 */

import {
  blastCommand,
  renameCommand,
  reviewCommand,
  safeDeleteCommand,
  testImpactCommand,
} from "./commands/change.js";
import { dnaCommand } from "./commands/dna.js";
import { doctorCommand } from "./commands/doctor.js";
import { indexCommand } from "./commands/index-command.js";
import {
  backendCommand,
  bundleCommand,
  engineeringCommand,
  packagesCommand,
  securityCommand,
  testingCommand,
} from "./commands/reports.js";
import {
  cyclesCommand,
  depsCommand,
  refsCommand,
  routeCommand,
  symbolCommand,
} from "./commands/structure.js";
import {
  explainCommand,
  exploreCommand,
  featuresCommand,
  healthCommand,
  landmarksCommand,
  mapCommand,
  stackCommand,
} from "./commands/understand.js";
import {
  FAIL_ON_BAND_OPTION,
  FAIL_ON_COUNT_OPTION,
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
    examples: ["prism doctor"],
  },
  {
    name: "index",
    group: "Diagnostics",
    summary: "Build or refresh the repository index",
    handler: indexCommand,
    examples: ["prism index"],
  },

  {
    name: "dna",
    group: "Understand a repository",
    summary: "Identify languages, frameworks, domains and stack",
    handler: dnaCommand,
    examples: ["prism dna --json | jq '.data.frameworks'"],
  },
  {
    name: "health",
    group: "Understand a repository",
    summary: "Overall health score and the factors behind it",
    handler: healthCommand,
    options: [FAIL_ON_BAND_OPTION],
    examples: ["prism health --fail-on high"],
  },
  {
    name: "map",
    group: "Understand a repository",
    summary: "Repository map: clusters, landmarks and layers",
    handler: mapCommand,
    options: [
      { flags: "--zoom <level>", description: "Zoom level to render" },
      LIMIT_OPTION,
    ],
    examples: ["prism map --zoom package"],
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
    name: "stack",
    group: "Understand a repository",
    summary: "Detected stack signals, domains and personas",
    handler: stackCommand,
    examples: ["prism stack"],
  },
  {
    name: "features",
    group: "Understand a repository",
    summary: "Inferred features and their confidence",
    handler: featuresCommand,
    options: [LIMIT_OPTION],
    examples: ["prism features --limit 10"],
  },
  {
    name: "landmarks",
    group: "Understand a repository",
    summary: "Entrypoints, package roots and feature anchors",
    handler: landmarksCommand,
    options: [LIMIT_OPTION],
    examples: ["prism landmarks"],
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
    ],
    examples: ["prism review --base origin/main --fail-on high"],
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
    ],
    examples: ["prism cycles --fail-on any"],
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
    name: "engineering",
    group: "Reports",
    summary: "Entropy, drift, debt, churn and hotspots",
    handler: engineeringCommand,
    options: [FAIL_ON_BAND_OPTION, LIMIT_OPTION],
    examples: ["prism engineering --fail-on high"],
  },
  {
    name: "testing",
    group: "Reports",
    summary: "Test structure and on-disk coverage",
    handler: testingCommand,
    options: [FAIL_ON_BAND_OPTION, LIMIT_OPTION],
    examples: ["prism testing"],
  },
  {
    name: "security",
    group: "Reports",
    summary: "Left-shift tooling and configuration checklist",
    handler: securityCommand,
    options: [FAIL_ON_BAND_OPTION, LIMIT_OPTION],
    examples: ["prism security --fail-on mid"],
  },
  {
    name: "backend",
    group: "Reports",
    summary: "Routes, data layer, env vars and background jobs",
    handler: backendCommand,
    options: [LIMIT_OPTION],
    examples: ["prism backend"],
  },
  {
    name: "bundle",
    group: "Reports",
    summary: "Bundle weight from an ingested stats artifact",
    handler: bundleCommand,
    options: [
      { flags: "--artifact <id>", description: "Ingested stats artifact id" },
      LIMIT_OPTION,
    ],
    examples: ["prism bundle --artifact <id>"],
  },
];

export const COMMANDS_BY_NAME = new Map(
  COMMANDS.map((command) => [command.name, command]),
);
