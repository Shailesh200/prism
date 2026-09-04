/**
 * Claude worker credentials are detection, not a grant (ADR-0044 §6).
 *
 * A Claude worker runs the machine's existing Claude Code sign-in — the
 * `claude` CLI the user already authenticated. Prism never mints, stores, or
 * asks for a key: `init` asks the CLI (`claude auth status`) rather than
 * guessing a credentials filename. We do not spawn Claude's interactive
 * login from a stdio server.
 *
 * Claude Code 2.1+ keeps OAuth in the OS keychain (`Claude Code-credentials`),
 * not `~/.claude/.credentials.json`. Treating a missing file as signed-out
 * blocked every job for users who were already logged in.
 */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WorkerAuthInspect } from "./worker-backend.js";
import { claudeCliCommand } from "./claude-cli.js";

export type ClaudeAuthStatus =
  | { readonly kind: "stored"; readonly email?: string }
  | {
      readonly kind: "missing";
      readonly reason: "cli-missing" | "signin-missing";
    };

export type ClaudeLoginProbe = {
  readonly loggedIn: boolean;
  readonly email?: string;
};

export type ClaudeAuthPort = {
  status(): Promise<ClaudeAuthStatus>;
};

const CLI_PROBE_TIMEOUT_MS = 5_000;

/** True when the `claude` binary runs. Exit code does not matter. */
export async function probeClaudeCli(): Promise<boolean> {
  const cli = claudeCliCommand();
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean): void => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    let child;
    try {
      child = spawn(cli.command, ["--version"], {
        stdio: "ignore",
        shell: cli.shell,
      });
    } catch {
      done(false);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      done(false);
    }, CLI_PROBE_TIMEOUT_MS);
    timer.unref();
    child.on("error", () => {
      clearTimeout(timer);
      done(false);
    });
    child.on("close", () => {
      clearTimeout(timer);
      done(true);
    });
  });
}

/**
 * Ask the CLI whether this machine is signed in.
 *
 * `claude auth status --json` is the source of truth from 2.1 onward; it
 * sees keychain OAuth, `ANTHROPIC_API_KEY`, and the old credentials file.
 * Stdout is parsed; we never store a token.
 */
export async function probeClaudeLogin(): Promise<ClaudeLoginProbe> {
  const cli = claudeCliCommand();
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: ClaudeLoginProbe): void => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    let child;
    try {
      child = spawn(cli.command, ["auth", "status", "--json"], {
        stdio: ["ignore", "pipe", "ignore"],
        shell: cli.shell,
      });
    } catch {
      done({ loggedIn: false });
      return;
    }
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      done({ loggedIn: false });
    }, CLI_PROBE_TIMEOUT_MS);
    timer.unref();
    child.on("error", () => {
      clearTimeout(timer);
      done({ loggedIn: false });
    });
    child.on("close", () => {
      clearTimeout(timer);
      done(parseClaudeAuthStatus(stdout));
    });
  });
}

/** Pull `loggedIn` / `email` out of `claude auth status --json` stdout. */
export function parseClaudeAuthStatus(stdout: string): ClaudeLoginProbe {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) return { loggedIn: false };
  try {
    const row = JSON.parse(stdout.slice(start, end + 1)) as {
      loggedIn?: unknown;
      email?: unknown;
    };
    const email = typeof row.email === "string" ? row.email.trim() : "";
    return {
      loggedIn: row.loggedIn === true,
      ...(email ? { email } : {}),
    };
  } catch {
    return { loggedIn: false };
  }
}

export function createClaudeAuthPort(
  deps: {
    readonly home?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly probeCli?: () => Promise<boolean>;
    readonly probeLogin?: () => Promise<ClaudeLoginProbe>;
  } = {},
): ClaudeAuthPort {
  const home = deps.home ?? homedir();
  const env = deps.env ?? process.env;
  const probeCli = deps.probeCli ?? probeClaudeCli;
  const probeLogin = deps.probeLogin ?? probeClaudeLogin;
  return {
    async status() {
      if (!(await probeCli())) {
        return { kind: "missing", reason: "cli-missing" };
      }
      if (env.ANTHROPIC_API_KEY?.trim()) return { kind: "stored" };
      if (env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) return { kind: "stored" };
      try {
        await access(join(home, ".claude", ".credentials.json"));
        return { kind: "stored" };
      } catch {
        /* Claude Code 2.1+ stores OAuth in the keychain instead. */
      }
      const login = await probeLogin();
      if (login.loggedIn) {
        return login.email
          ? { kind: "stored", email: login.email }
          : { kind: "stored" };
      }
      return { kind: "missing", reason: "signin-missing" };
    },
  };
}

export function inspectClaudeWorkerAuth(
  status: ClaudeAuthStatus | undefined,
): WorkerAuthInspect {
  if (status?.kind === "stored") {
    return {
      ready: true,
      source: "stored",
      message: "You're set.",
      ...(status.email ? { email: status.email } : {}),
    };
  }
  if (status?.reason === "cli-missing") {
    return {
      ready: false,
      source: "missing",
      message:
        "Claude Code is not installed on this machine. Install it, sign in once with claude in a terminal, then say prism init again.",
    };
  }
  return {
    ready: false,
    source: "missing",
    message:
      "Claude Code is installed but not signed in. Run claude once in a terminal to sign in, then say prism init again.",
  };
}

/**
 * There is no browser login to drive here (unlike Cursor's SDK login): the
 * check is the whole flow. `init` and `start_job` both land on this.
 */
export async function ensureClaudeWorkerAuth(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly auth?: ClaudeAuthPort;
}): Promise<WorkerAuthInspect> {
  if (!input.auth) {
    return {
      ready: false,
      source: "missing",
      message:
        "Prism could not check Claude workers. Reload the prism MCP server, then say prism init.",
    };
  }
  return inspectClaudeWorkerAuth(await input.auth.status());
}
