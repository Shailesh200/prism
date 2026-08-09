/**
 * `prism completions bash|zsh|fish` — shell completion scripts from the
 * command registry (M-057 P-B8).
 */

import { ok, PrismErrorCode, err, prismError } from "@repo-prism/shared";
import type { CommandHandler } from "../runtime.js";

const SHELLS = ["bash", "zsh", "fish"] as const;
type Shell = (typeof SHELLS)[number];

function isShell(value: string): value is Shell {
  return (SHELLS as readonly string[]).includes(value);
}

export function renderCompletions(
  shell: Shell,
  names: readonly string[],
): string {
  switch (shell) {
    case "bash":
      return [
        `# prism bash completion (generated)`,
        `_prism() {`,
        `  local cur="\${COMP_WORDS[COMP_CWORD]}"`,
        `  local cmds=(`,
        ...names.map((n) => `    ${n}`),
        `  )`,
        `  if [[ \${COMP_CWORD} -eq 1 ]]; then`,
        `    COMPREPLY=( $(compgen -W "\${cmds[*]}" -- "\${cur}") )`,
        `  fi`,
        `}`,
        `complete -F _prism prism`,
        "",
      ].join("\n");
    case "zsh":
      return [
        `#compdef prism`,
        `# prism zsh completion (generated)`,
        `_prism() {`,
        `  local -a cmds`,
        `  cmds=(`,
        ...names.map((n) => `    "${n}"`),
        `  )`,
        `  _describe 'command' cmds`,
        `}`,
        `_prism`,
        "",
      ].join("\n");
    case "fish":
      return [
        `# prism fish completion (generated)`,
        ...names.map(
          (n) => `complete -c prism -f -n "__fish_use_subcommand" -a ${n}`,
        ),
        "",
      ].join("\n");
  }
}

export const completionsCommand: CommandHandler = async (context) => {
  const shell = context.args.positionals[0];
  if (!shell || !isShell(shell)) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `Usage: prism completions <${SHELLS.join("|")}>`,
      ),
    );
  }

  // Dynamic import avoids a cycle with commands.ts (which registers this handler).
  const { COMMANDS } = await import("../commands.js");
  const script = renderCompletions(
    shell,
    COMMANDS.map((command) => command.name),
  );
  return ok({
    data: { shell, script },
    human: () => script.replace(/\n$/, ""),
  });
};
