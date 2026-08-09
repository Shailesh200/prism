/**
 * The command table (M-029).
 *
 * Twenty commands is enough surface that bespoke wiring per command would drift
 * — one would forget `--limit`, another would spell `--fail-on` differently,
 * and the README would describe a CLI that no longer exists. So each command
 * *declares* its arguments and options here and the program builds itself from
 * the declaration. A test compares this table to the README.
 */

import type { CommandHandler } from "./runtime.js";

export type ArgumentSpec = {
  /** Commander syntax: `<required>`, `[optional]`, `<many...>`. */
  readonly syntax: string;
  readonly description: string;
};

export type OptionSpec = {
  /** Commander syntax: `--limit <n>`, `--symbol`. */
  readonly flags: string;
  readonly description: string;
};

export type CommandSpec = {
  readonly name: string;
  /** One line. This is what `prism --help` shows. */
  readonly summary: string;
  readonly group: CommandGroup;
  readonly arguments?: readonly ArgumentSpec[];
  readonly options?: readonly OptionSpec[];
  readonly examples?: readonly string[];
  readonly handler: CommandHandler;
};

/** Grouped by what the user is trying to do, not by which Core method backs it. */
export const COMMAND_GROUPS = [
  "Understand a repository",
  "Assess a change",
  "Inspect structure",
  "Reports",
  "Diagnostics",
] as const;

export type CommandGroup = (typeof COMMAND_GROUPS)[number];

/** Shared option definitions, so their wording cannot drift between commands. */
export const LIMIT_OPTION: OptionSpec = {
  flags: "--limit <n>",
  description: "Maximum rows to print (default 50)",
};

export const FAIL_ON_BAND_OPTION: OptionSpec = {
  flags: "--fail-on <band>",
  description: "Exit 1 when the risk is at or above this band: low, mid, high",
};

export const FAIL_ON_COUNT_OPTION: OptionSpec = {
  flags: "--fail-on <count>",
  description: "Exit 1 at this many findings, or 'any' for one or more",
};

/** Shared by `review` and `cycles` for GitHub code scanning (M-060). */
export const FORMAT_OPTION: OptionSpec = {
  flags: "--format <fmt>",
  description: "Machine output format: sarif (GitHub code scanning)",
};

/**
 * `--in` narrows a symbol query on some commands and disambiguates a shared
 * name on others. One wording covers both, because a flag that means slightly
 * different things under different commands still has to read the same way.
 */
export const IN_OPTION: OptionSpec = {
  flags: "--in <path>",
  description: "File to look in, when several symbols share a name",
};

export const SYMBOL_OPTIONS: readonly OptionSpec[] = [
  {
    flags: "--symbol",
    description: "Treat the argument as a symbol name rather than a file path",
  },
  IN_OPTION,
];
