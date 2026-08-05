/**
 * Argument parsing and command wiring (M-028).
 *
 * Commander is configured to *return* rather than exit, because the exit-code
 * discipline lives in `exit.ts` and a framework calling `process.exit(1)` for a
 * bad flag would quietly break the contract that says usage errors are 2.
 */

import { Command, CommanderError } from "commander";
import { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "@prism/core";
import { doctorCommand } from "./commands/doctor.js";
import { dnaCommand } from "./commands/dna.js";
import { indexCommand } from "./commands/index-command.js";
import { ExitCode } from "./exit.js";
import { shouldUseColor, type Writer } from "./output.js";
import {
  runCommand,
  type CommandHandler,
  type GlobalOptions,
  type RunOptions,
} from "./runtime.js";

export const CLI_NAME = "prism";

const COMMANDS: Record<string, { handler: CommandHandler; summary: string }> = {
  doctor: {
    handler: doctorCommand,
    summary: "Check the environment, workspace and index",
  },
  index: {
    handler: indexCommand,
    summary: "Build or refresh the repository index",
  },
  dna: {
    handler: dnaCommand,
    summary: "Identify languages, frameworks, domains and stack",
  },
};

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
    .addHelpText(
      "after",
      [
        "",
        "Exit codes:",
        "  0  success",
        "  1  ran successfully; the analysis found what you asked about",
        "  2  usage error (unknown flag, bad argument)",
        "  3  Prism failed",
        "",
        "Examples:",
        `  ${CLI_NAME} doctor`,
        `  ${CLI_NAME} index`,
        `  ${CLI_NAME} dna --json | jq '.data.frameworks'`,
        `  ${CLI_NAME} dna --workspace ../other-repo`,
      ].join("\n"),
    );

  for (const [name, { summary }] of Object.entries(COMMANDS)) {
    program
      .command(name)
      .description(summary)
      .addHelpText("after", `\nExample:\n  ${CLI_NAME} ${name} --json`);
  }

  return program;
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

  // Commander prints help and reports success for a bare invocation. Running
  // `prism` with no command is a usage error, and a CI job that typo'd its
  // command line deserves to fail rather than pass silently.
  if (argv.length === 0) {
    options.writer.err(program.helpInformation());
    return ExitCode.USAGE;
  }

  program.exitOverride();
  program.configureOutput({
    writeOut: (text) => options.writer.out(text.replace(/\n$/, "")),
    writeErr: (text) => options.writer.err(text.replace(/\n$/, "")),
  });

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
    return ExitCode.USAGE;
  }

  const command = COMMANDS[commandName];
  if (command === undefined) {
    options.writer.err(`error: unknown command '${commandName}'`);
    return ExitCode.USAGE;
  }

  const raw = parsed.opts<RawGlobals>();
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

  return runCommand(command.handler, globals, options);
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
  });
}
