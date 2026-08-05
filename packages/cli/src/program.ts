/**
 * Argument parsing and command wiring (M-028, generalised in M-029).
 *
 * Commander is configured to *return* rather than exit, because the exit-code
 * discipline lives in `exit.ts` and a framework calling `process.exit(1)` for a
 * bad flag would quietly break the contract that says usage errors are 2.
 *
 * The program is built from the command table rather than hand-wired, so a new
 * command gets `--limit`, `--json` and its help text by declaring them.
 */

import { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "@repo-prism/core";
import { Command, CommanderError } from "commander";
import { COMMANDS, COMMANDS_BY_NAME } from "./commands.js";
import { ExitCode } from "./exit.js";
import { COMMAND_GROUPS } from "./registry.js";
import { shouldUseColor, type Writer } from "./output.js";
import {
  runCommand,
  type CommandArgs,
  type GlobalOptions,
  type RunOptions,
} from "./runtime.js";

export const CLI_NAME = "prism";

type RawGlobals = {
  workspace?: string;
  json?: boolean;
  color?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  yes?: boolean;
};

function buildProgram(): Command {
  const program = new Command();

  program
    .name(CLI_NAME)
    .description(
      "Prism — local-first repository intelligence.\n\n" +
        "All analysis runs on your machine. Nothing is uploaded.",
    )
    .version(
      `${CLI_NAME} (core ${PRISM_CORE_VERSION}, API level ${PRISM_API_LEVEL})`,
      "-V, --version",
      "Print the Core version and API level",
    )
    .option(
      "-w, --workspace <path>",
      "Repository to analyse (default: nearest git root, else cwd)",
    )
    .option("--json", "Emit JSON on stdout instead of human-readable output")
    .option("--no-color", "Disable ANSI colour (also honours NO_COLOR)")
    .option("-q, --quiet", "Suppress progress output on stderr")
    .option("--verbose", "Include extra detail")
    .option(
      "-y, --yes",
      "Consent to operations that would otherwise be refused",
    )
    // Global flags are accepted after the subcommand too, because
    // `prism blast x --json` is what people type and refusing it would be
    // pedantry rather than help.
    .enablePositionalOptions()
    .addHelpText("after", helpFooter());

  for (const spec of COMMANDS) {
    const command = program.command(spec.name).description(spec.summary);

    for (const argument of spec.arguments ?? []) {
      command.argument(argument.syntax, argument.description);
    }
    for (const option of spec.options ?? []) {
      command.option(option.flags, option.description);
    }
    // Repeating the globals on each subcommand is what makes them work in
    // either position; Commander does not inherit them otherwise.
    command
      .option("-w, --workspace <path>", "Repository to analyse")
      .option("--json", "Emit JSON on stdout")
      .option("--no-color", "Disable ANSI colour")
      .option("-q, --quiet", "Suppress progress output")
      .option("--verbose", "Include extra detail")
      .option("-y, --yes", "Consent to gated operations");

    if (spec.examples?.length) {
      command.addHelpText(
        "after",
        `\nExample${spec.examples.length > 1 ? "s" : ""}:\n${spec.examples
          .map((example) => `  ${example}`)
          .join("\n")}`,
      );
    }
  }

  return program;
}

function helpFooter(): string {
  const lines = [
    "",
    "Exit codes:",
    "  0  success",
    "  1  ran successfully; the analysis found what you asked about",
    "  2  usage error (unknown flag, bad argument)",
    "  3  Prism failed",
  ];

  for (const group of COMMAND_GROUPS) {
    const names = COMMANDS.filter((command) => command.group === group).map(
      (command) => command.name,
    );
    if (names.length > 0) lines.push("", `${group}:`, `  ${names.join(", ")}`);
  }

  lines.push(
    "",
    "Examples:",
    `  ${CLI_NAME} doctor`,
    `  ${CLI_NAME} dna --json | jq '.data.frameworks'`,
    `  ${CLI_NAME} blast src/index.ts --fail-on high`,
    `  ${CLI_NAME} review --base origin/main --fail-on high`,
  );

  return lines.join("\n");
}

/**
 * Parse and run. Returns the exit code rather than exiting, so the same path is
 * exercised by tests and by the binary.
 */
export async function run(
  argv: readonly string[],
  options: RunOptions,
): Promise<ExitCode> {
  const program = buildProgram();

  // Commander prints help and reports success for a bare invocation. We keep
  // that behaviour: `prism` with no args is how people discover commands, so
  // exit 0. Unknown commands and bad flags still exit 2 (usage error).
  if (argv.length === 0) {
    options.writer.err(program.helpInformation());
    return ExitCode.OK;
  }

  // Applied to subcommands as well as the root. Commander copies these
  // settings when a subcommand is *created*, and ours are created before this
  // runs — so without the loop, `prism route /` would print straight to the
  // real stderr and exit 1, which the exit-code contract reserves for "the
  // analysis found something". A missing argument is a usage error, not a
  // finding, and a CI job cannot be asked to tell those apart.
  for (const command of [program, ...program.commands]) {
    command.exitOverride();
    command.configureOutput({
      writeOut: (text) => options.writer.out(text.replace(/\n$/, "")),
      writeErr: (text) => options.writer.err(text.replace(/\n$/, "")),
    });
  }

  let parsed: Command;
  try {
    parsed = program.parse([...argv], { from: "user" });
  } catch (cause) {
    if (cause instanceof CommanderError) {
      // `--help` and `--version` come through here as "errors" having already
      // printed what the user asked for.
      const handled =
        cause.code === "commander.helpDisplayed" ||
        cause.code === "commander.help" ||
        cause.code === "commander.version";
      return handled ? ExitCode.OK : ExitCode.USAGE;
    }
    throw cause;
  }

  const commandName = parsed.args[0];
  if (commandName === undefined) {
    options.writer.err(program.helpInformation());
    return ExitCode.OK;
  }

  const spec = COMMANDS_BY_NAME.get(commandName);
  const sub = parsed.commands.find((child) => child.name() === commandName);
  if (spec === undefined || sub === undefined) {
    const suggestion = suggestCommand(commandName);
    const hint = suggestion ? `\n(Did you mean ${suggestion}?)` : "";
    options.writer.err(`error: unknown command '${commandName}'${hint}`);
    return ExitCode.USAGE;
  }

  const subOptions = sub.opts<Record<string, unknown>>();
  const rootOptions = parsed.opts<RawGlobals>();
  const raw: RawGlobals = {
    ...rootOptions,
    // A global given after the subcommand lands on the subcommand. Commander
    // defaults `--no-color` to `true`, so only an explicit `false` overrides.
    ...(subOptions.workspace === undefined
      ? {}
      : { workspace: String(subOptions.workspace) }),
    ...(subOptions.json === true ? { json: true } : {}),
    ...(subOptions.color === false ? { color: false } : {}),
    ...(subOptions.quiet === true ? { quiet: true } : {}),
    ...(subOptions.verbose === true ? { verbose: true } : {}),
    ...(subOptions.yes === true ? { yes: true } : {}),
  };

  const globals: GlobalOptions = {
    workspace: raw.workspace,
    json: raw.json === true,
    color: shouldUseColor({
      // Commander maps `--no-color` to `color: false`.
      noColorFlag: raw.color === false,
      env: options.env,
      isTty: options.isTty,
    }),
    quiet: raw.quiet === true,
    verbose: raw.verbose === true,
    yes: raw.yes === true,
  };

  const args: CommandArgs = {
    positionals: sub.args,
    option(name) {
      const value = subOptions[name];
      return typeof value === "string" ? value : undefined;
    },
    flag(name) {
      return subOptions[name] === true;
    },
  };

  return runCommand(spec.handler, globals, options, args);
}

/**
 * Nearest command name by simple edit distance (Commander may already suggest
 * before we get here; this covers the fallback unknown-command path).
 */
function suggestCommand(input: string): string | undefined {
  const needle = input.toLowerCase();
  let best: { name: string; distance: number } | undefined;
  for (const command of COMMANDS) {
    const distance = editDistance(needle, command.name);
    if (distance > 3) continue;
    if (best === undefined || distance < best.distance) {
      best = { name: command.name, distance };
    }
  }
  return best?.name;
}

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
  for (let i = 0; i < rows; i++) grid[i]![0] = i;
  for (let j = 0; j < cols; j++) grid[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i]![j] = Math.min(
        grid[i - 1]![j]! + 1,
        grid[i]![j - 1]! + 1,
        grid[i - 1]![j - 1]! + cost,
      );
    }
  }
  return grid[a.length]![b.length]!;
}

/** Entry point for the binary. */
export async function main(
  argv: readonly string[],
  writer: Writer,
): Promise<ExitCode> {
  return run(argv, {
    cwd: process.cwd(),
    env: process.env,
    writer,
    isTty: process.stdout.isTTY === true,
    ...(process.stdout.columns ? { columns: process.stdout.columns } : {}),
  });
}
