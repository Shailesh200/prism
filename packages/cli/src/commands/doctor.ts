/**
 * `prism doctor` (M-028) — can Prism work here, and on what?
 *
 * The most useful thing it prints is *which* workspace was chosen and why.
 * Git-root discovery is helpful right up until it surprises someone, and the
 * cure for that surprise is showing the decision rather than hiding it.
 */

import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "@repo-prism/core";
import { ok } from "@repo-prism/shared";
import { workspaceCacheDir } from "@repo-prism/shared/prism-home";
import { readInstallRecord } from "@repo-prism/shared/prism-bin";
import { stopDaemon } from "@repo-prism/daemon";
import { INSTALL_HOSTS, type InstallHost } from "../install/hosts.js";
import { runInstall, sourceLayout } from "./install.js";
import { paint, renderFields, renderHeading, type Style } from "../output.js";
import {
  isPrismSourceRepo,
  scanSurfaces,
  surfaceProblems,
} from "./surfaces.js";
import { wrap } from "../table.js";
import { checkSkills } from "./doctor-skills.js";
import type { CommandHandler } from "../runtime.js";

/** Detect a shallow clone (M-057 P-B11). Exported for unit tests. */
export function isShallowGitRepository(rootPath: string): boolean | null {
  try {
    const out = execFileSync(
      "git",
      ["-C", rootPath, "rev-parse", "--is-shallow-repository"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (out === "true") return true;
    if (out === "false") return false;
    return null;
  } catch {
    return null;
  }
}

type Check = {
  readonly label: string;
  readonly status: "ok" | "warn" | "fail";
  readonly detail: string;
};

const STATUS_STYLE: Record<Check["status"], Style> = {
  ok: "green",
  warn: "yellow",
  fail: "red",
};

const STATUS_MARK: Record<Check["status"], string> = {
  ok: "ok",
  warn: "warn",
  fail: "fail",
};

export const doctorCommand: CommandHandler = async (context) => {
  const checks: Check[] = [];

  checks.push({
    label: "Node",
    status: "ok",
    detail: process.version,
  });

  const workspaceExists = existsSync(context.workspace.path);
  checks.push({
    label: "Workspace",
    status: workspaceExists ? "ok" : "fail",
    detail: workspaceExists
      ? `${context.workspace.path} (from ${context.workspace.source})`
      : `${context.workspace.path} does not exist`,
  });

  const isGitRepo = existsSync(join(context.workspace.path, ".git"));
  checks.push({
    label: "Git",
    status: isGitRepo ? "ok" : "warn",
    detail: isGitRepo
      ? "repository found"
      : "no .git — history-derived signals will be unavailable",
  });

  // CI mode (M-057 P-B11): shallow clones truncate history-derived signals.
  if (context.args.flag("ci") && isGitRepo) {
    const shallow = isShallowGitRepository(context.workspace.path);
    if (shallow === true) {
      checks.push({
        label: "Shallow clone",
        status: "warn",
        detail:
          "git rev-parse --is-shallow-repository=true — history-derived signals (ownership, churn, health history) will be incomplete. Fetch with --unshallow or fetch-depth: 0 in CI.",
      });
    } else if (shallow === false) {
      checks.push({
        label: "Shallow clone",
        status: "ok",
        detail: "full history available",
      });
    }
  }

  checks.push(...(await installChecks(context.args.flag("fix"))));

  const cacheDir = workspaceCacheDir(context.workspace.path);
  const hasCache = existsSync(cacheDir);
  checks.push({
    label: "Index cache",
    // Not a failure — every command builds the index it needs. It is still
    // worth flagging, because it is why the next command will be the slow one.
    status: hasCache ? "ok" : "warn",
    detail: hasCache
      ? cacheDir
      : "none yet — the next command that needs it will build one, or run `prism index` now",
  });

  // Only touch the index when the workspace is real; opening a missing path
  // would turn a diagnostic into a failure.
  let freshness: string = "not checked";
  if (workspaceExists && hasCache) {
    const opened = await context.open();
    if (opened.ok) {
      const state = opened.value.getIndexFreshness();
      freshness = state.ok
        ? `${state.value.status}${
            state.value.pendingDirtyCount > 0
              ? ` (${state.value.pendingDirtyCount} pending)`
              : ""
          }${state.value.lastError ? ` — last error: ${state.value.lastError}` : ""}`
        : state.error.message;
      checks.push({
        label: "Index",
        // A knowingly-behind index is a warning, not a pass: the numbers a
        // later command prints would be stale without saying so.
        status: state.ok && state.value.lastError === undefined ? "ok" : "warn",
        detail: freshness,
      });
    } else {
      checks.push({
        label: "Index",
        status: "fail",
        detail: opened.error.message,
      });
    }
  }

  if (context.args.positionals[0] === "skills") {
    const skills = checkSkills(context.workspace.path);
    if (skills.length === 0) {
      checks.push({
        label: "Skills",
        status: "ok",
        detail: "no user skill names a Prism tool",
      });
    }
    for (const skill of skills) {
      checks.push({
        label: "Skill",
        status: skill.status,
        detail:
          skill.status === "ok"
            ? `${skill.file}: ${skill.tools.join(", ")} registered`
            : `${skill.file}: ${skill.problems.join("; ")}`,
      });
    }
  }

  if (context.args.flag("surfaces")) {
    const hits = scanSurfaces();
    const problems = surfaceProblems(
      hits,
      isPrismSourceRepo(context.workspace.path),
    );
    if (hits.length === 0) {
      checks.push({
        label: "Surfaces",
        status: "warn",
        detail: "no Prism server, hook, or extension found in the home configs",
      });
    }
    for (const hit of hits) {
      const problem = problems.some((line) => line.includes(hit.where));
      checks.push({
        label: hit.host,
        status: problem ? "fail" : "ok",
        detail: `${hit.kind} — ${hit.detail}`,
      });
    }
    for (const problem of problems) {
      if (checks.some((check) => check.detail.includes(problem))) continue;
      checks.push({ label: "Surfaces", status: "fail", detail: problem });
    }
  }

  const failed = checks.some((check) => check.status === "fail");

  return ok({
    data: {
      core: { version: PRISM_CORE_VERSION, apiLevel: PRISM_API_LEVEL },
      node: process.version,
      workspace: {
        path: context.workspace.path,
        source: context.workspace.source,
      },
      checks,
    },
    findings: failed,
    human({ color, width }) {
      const lines = [
        renderHeading("Prism doctor", color),
        "",
        renderFields(
          [
            ["Core", `${PRISM_CORE_VERSION} (API level ${PRISM_API_LEVEL})`],
            ["Node", process.version],
            ["Workspace", context.workspace.path],
            ["Chosen via", context.workspace.source],
          ],
          color,
          width,
        ),
        "",
      ];

      for (const check of checks) {
        const mark = paint(
          STATUS_MARK[check.status].padEnd(4),
          STATUS_STYLE[check.status],
          color,
        );
        const label = check.label.padEnd(12);
        const indent = " ".repeat(5 + label.length);
        const [first = "", ...rest] = wrap(check.detail, width - indent.length);
        lines.push(
          `${mark} ${label} ${first}`,
          ...rest.map((line) => `${indent}${line}`),
        );
      }

      return lines.join("\n");
    },
  });
};

const published = () =>
  scanSurfaces().filter((hit) => hit.kind === "published-npm");

/**
 * The install record, the bin it names, and (for a local build) the
 * `no-published-refs` check over every editor config (§3.0, DEV-1).
 * `--fix` stops the daemon (the next client starts the current build) and
 * rewrites the recorded editors' configs to the local build.
 */
async function installChecks(fix: boolean): Promise<Check[]> {
  const read = readInstallRecord(process.env);
  if (read.kind !== "ok")
    return [
      {
        label: "Install",
        status: "warn",
        detail:
          read.kind === "invalid"
            ? `install.json is invalid (${read.reason}). Run \`prism install <editor> --local <checkout>\`.`
            : "not installed. Run `prism install <editor> --local <checkout>`.",
      },
    ];
  const record = read.record;
  const broken = !existsSync(record.bin) || published().length > 0;
  const fixed: Check[] = [];
  if (fix) {
    await stopDaemon({ env: process.env });
    fixed.push({
      label: "Daemon",
      status: "ok",
      detail: "stopped; the next client starts the current build",
    });
    const layout = record.source
      ? sourceLayout(record.source)
      : "no local source recorded";
    if (broken && typeof layout !== "string") {
      const hosts = record.hosts.filter((host): host is InstallHost =>
        (INSTALL_HOSTS as readonly string[]).includes(host),
      );
      await runInstall({
        hosts,
        scope: record.scope ?? "user",
        root: record.root ?? process.cwd(),
        layout,
        env: process.env,
      });
      fixed.push({
        label: "Fix",
        status: "ok",
        detail: `rewrote ${hosts.join(", ")} to the local build ${layout.bin}`,
      });
    } else if (broken) {
      fixed.push({
        label: "Fix",
        status: "fail",
        detail: `cannot rewrite configs: ${layout}`,
      });
    }
  }
  const after = readInstallRecord(process.env);
  const current = after.kind === "ok" ? after.record : record;
  const checks: Check[] = [
    {
      label: "Install",
      status: existsSync(current.bin) ? "ok" : "fail",
      detail: existsSync(current.bin)
        ? `${current.version} for ${current.hosts.join(", ")}; server ${current.bin}`
        : `server ${current.bin} is missing. Fix: prism doctor --fix, or prism install <editor> --local <checkout>.`,
    },
  ];
  if (current.source) {
    const hits = published();
    checks.push(
      hits.length === 0
        ? {
            label: "Published",
            status: "ok",
            detail: "no published package referenced (local build only)",
          }
        : {
            label: "Published",
            status: "fail",
            detail: `published package referenced during development: ${hits
              .map((hit) => `${hit.host} (${hit.where})`)
              .join(", ")}. Fix: prism doctor --fix.`,
          },
    );
  }
  return [...fixed, ...checks];
}
