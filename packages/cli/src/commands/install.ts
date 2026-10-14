/**
 * `prism install | uninstall | upgrade` (plan §2.1, §3.1a, §3.3).
 *
 *   prism install <claude|cursor|codex|opencode|all> [--project|--user] [--local <checkout>]
 *   prism uninstall [--purge]
 *   prism upgrade
 *
 * 2.0 ships local builds only from this command: `--local` (default: the
 * checkout this CLI runs from) must hold built `mcp-server` and `plugin`
 * packages. Install never runs `npx` and never fetches packages.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { err, ok, PrismErrorCode, prismError } from "@repo-prism/shared";
import {
  readInstallRecord,
  writeInstallRecord,
  installRecordPath,
  type InstallRecord,
} from "@repo-prism/shared/prism-bin";
import { readGitHead } from "@repo-prism/shared/git-head";
import { prismHomeDir } from "@repo-prism/shared/prism-home";
import {
  loadUserConfigSync,
  userConfigPath,
} from "@repo-prism/shared/user-config";
import { stopDaemon } from "@repo-prism/daemon";
import {
  INSTALL_HOSTS,
  installHost,
  removeInstallFile,
  setJsonKey,
  type InstallFile,
  type InstallHost,
  type InstallScope,
} from "../install/hosts.js";
import { wipe1x } from "../install/wipe.js";
import type { CommandContext, CommandHandler } from "../runtime.js";

const USAGE =
  "Usage: prism install <claude|cursor|codex|opencode|all> [--project|--user] [--local <checkout>]";

const HOST_NAMES: Record<InstallHost, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  codex: "Codex",
  opencode: "opencode",
};

/** Codex is only set up where it is configured (`~/.codex` exists). */
function hostAvailable(host: InstallHost, home: string): boolean {
  return host !== "codex" || existsSync(join(home, ".codex"));
}

/** Hosts whose official path is the rule line, so `receipt` is on by default (§5.10). */
const RECEIPT_HOSTS: readonly InstallHost[] = ["cursor", "codex"];

function packageVersion(source: string): string {
  const path = join(source, "packages", "mcp-server", "package.json");
  return (JSON.parse(readFileSync(path, "utf8")) as { version: string })
    .version;
}

/** The checkout this CLI runs from: `<repo>/packages/cli/dist/commands/install.js`. */
export function defaultSource(): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "..",
  );
}

export type SourceLayout = {
  readonly source: string;
  readonly bin: string;
  readonly pack: string;
};

export function sourceLayout(source: string): SourceLayout | string {
  const bin = join(source, "packages", "mcp-server", "dist", "bin.js");
  const pack = join(source, "packages", "plugin", "dist", "pack");
  const missing = [bin, join(pack, "hooks", "prism-hook.mjs")].filter(
    (path) => !existsSync(path),
  );
  if (missing.length > 0)
    return `${source} is not a built Prism checkout (missing ${missing.join(", ")}). Run \`bun run build\` there first.`;
  return { source, bin, pack };
}

function hostsFrom(arg: string | undefined): InstallHost[] | undefined {
  if (arg === "all") return [...INSTALL_HOSTS];
  return INSTALL_HOSTS.includes(arg as InstallHost)
    ? [arg as InstallHost]
    : undefined;
}

function enableReceipt(env: NodeJS.ProcessEnv): boolean {
  const loaded = loadUserConfigSync(env);
  if (!loaded.ok) throw new Error(loaded.error.message);
  const tools = loaded.value.extraTools ?? [];
  if (tools.includes("receipt")) return false;
  setJsonKey(userConfigPath(env), ["extraTools"], [...tools, "receipt"]);
  return true;
}

type InstallRun = {
  readonly hosts: readonly InstallHost[];
  readonly scope: InstallScope;
  readonly root: string;
  readonly layout: SourceLayout;
  readonly env: NodeJS.ProcessEnv;
};

export async function runInstall(run: InstallRun) {
  const wipe = await wipe1x({
    env: run.env,
    stopDaemon: async () =>
      (await stopDaemon({ env: run.env })).kind === "ok"
        ? "stopped"
        : "not_running",
  });
  if (wipe.kind === "permission") return { kind: "permission", wipe } as const;
  const previous = readInstallRecord(run.env);
  const kept: InstallFile[] =
    previous.kind === "ok" ? [...(previous.record.files ?? [])] : [];
  const files: InstallFile[] = [];
  const notes: string[] = [];
  const installed = run.hosts.filter((host) => hostAvailable(host, homedir()));
  const skipped = run.hosts.filter((host) => !installed.includes(host));
  const target = {
    scope: run.scope,
    home: homedir(),
    root: run.root,
    node: process.execPath,
    bin: run.layout.bin,
    pack: run.layout.pack,
  };
  for (const host of installed) {
    const result = installHost({ ...target, host });
    files.push(...result.files);
    notes.push(...result.notes);
  }
  if (
    installed.some((host) => RECEIPT_HOSTS.includes(host)) &&
    enableReceipt(run.env)
  )
    notes.push(
      "Enabled the `receipt` MCP tool (extraTools) for the Cursor/Codex rule path.",
    );
  const key = (file: InstallFile) =>
    `${file.kind}:${file.path}:${"key" in file ? file.key.join(".") : ""}`;
  const merged = new Map<string, InstallFile>();
  for (const file of [...kept, ...files]) merged.set(key(file), file);
  const hosts = new Set([
    ...(previous.kind === "ok" ? previous.record.hosts : []),
    ...installed,
  ]);
  const record: InstallRecord = {
    version: packageVersion(run.layout.source),
    bin: run.layout.bin,
    installedAt: new Date().toISOString(),
    hosts: [...hosts].sort(),
    scope: run.scope,
    root: run.root,
    source: run.layout.source,
    files: [...merged.values()].map((file) =>
      file.kind === "json-key" ? { ...file, key: [...file.key] } : file,
    ),
  };
  if (installed.length > 0) writeInstallRecord(record, run.env);
  const build = readGitHead(run.layout.source)?.sha?.slice(0, 7) ?? "unknown";
  return {
    kind: "done",
    wipe,
    record,
    files,
    notes,
    installed,
    skipped,
    build,
  } as const;
}

export const installCommand: CommandHandler = async (
  context: CommandContext,
) => {
  const hosts = hostsFrom(context.args.positionals[0]);
  if (!hosts) return err(prismError(PrismErrorCode.VALIDATION, USAGE));
  if (context.args.flag("project") && context.args.flag("user"))
    return err(
      prismError(PrismErrorCode.VALIDATION, "Pick one of --project or --user."),
    );
  const scope: InstallScope = context.args.flag("project") ? "project" : "user";
  const local = context.args.option("local");
  const layout = sourceLayout(
    local ? resolve(context.cwd, local) : defaultSource(),
  );
  if (typeof layout === "string")
    return err(prismError(PrismErrorCode.NOT_FOUND, layout));
  const result = await runInstall({
    hosts,
    scope,
    root: context.workspace.path,
    layout,
    env: process.env,
  });
  if (result.kind === "permission")
    return err(
      prismError(
        PrismErrorCode.IO_ERROR,
        `Cannot write ${result.wipe.path}; nothing was changed. Fix: ${result.wipe.fix}`,
      ),
    );
  const { wipe, record, files, notes, installed, skipped, build } = result;
  const where = scope === "project" ? ", this repository" : "";
  return ok({
    data: {
      record,
      written: files,
      wipe: wipe.kind === "wiped" ? wipe : { kind: wipe.kind },
      notes,
    },
    human: () =>
      [
        ...(wipe.kind === "wiped" ? [wipe.line] : []),
        ...installed.map(
          (host) =>
            `Prism ${record.version} installed for ${HOST_NAMES[host]} (local build ${build}${where}).`,
        ),
        ...skipped.map((host) => `${HOST_NAMES[host]} not found; skipped.`),
        ...notes,
      ].join("\n"),
  });
};

export const uninstallCommand: CommandHandler = async (context) => {
  const env = process.env;
  const stopped = (await stopDaemon({ env })).kind === "ok";
  const previous = readInstallRecord(env);
  const removed: string[] = [];
  if (previous.kind === "ok") {
    for (const file of previous.record.files ?? []) {
      if (removeInstallFile(file)) removed.push(file.path);
    }
    rmSync(installRecordPath(env), { force: true });
  }
  const purge = context.args.flag("purge");
  const purged: string[] = [];
  if (purge) {
    for (const path of [
      prismHomeDir(env),
      join(context.workspace.path, ".prism"),
    ]) {
      if (!existsSync(path)) continue;
      rmSync(path, { recursive: true, force: true });
      purged.push(path);
    }
  }
  return ok({
    data: {
      removed,
      purged,
      daemonStopped: stopped,
      hadRecord: previous.kind === "ok",
    },
    human: () =>
      [
        previous.kind === "ok"
          ? `Removed Prism from ${removed.length} place${removed.length === 1 ? "" : "s"}.`
          : "No install record; nothing to remove from agent configs.",
        ...removed.map((path) => `  ${path}`),
        ...(stopped ? ["Stopped the Prism daemon."] : []),
        ...(purge
          ? [
              `Purged ${purged.length ? purged.join(", ") : "nothing (no data)"}.`,
            ]
          : []),
      ].join("\n"),
  });
};

export const upgradeCommand: CommandHandler = async () => {
  const env = process.env;
  const previous = readInstallRecord(env);
  if (previous.kind !== "ok")
    return err(
      prismError(
        PrismErrorCode.NOT_FOUND,
        previous.kind === "missing"
          ? "Prism is not installed: run `prism install <client>` first."
          : `Install record is invalid (${previous.reason}); run \`prism install <client>\` again.`,
      ),
    );
  const record = previous.record;
  const layout = sourceLayout(record.source ?? defaultSource());
  if (typeof layout === "string")
    return err(prismError(PrismErrorCode.NOT_FOUND, layout));
  const hosts = record.hosts.filter((host): host is InstallHost =>
    INSTALL_HOSTS.includes(host as InstallHost),
  );
  const before = record.version;
  // The daemon restarts on next use with the new build (lockstep versions, §3.2).
  await stopDaemon({ env });
  const result = await runInstall({
    hosts,
    scope: record.scope ?? "user",
    root: record.root ?? process.cwd(),
    layout,
    env,
  });
  if (result.kind === "permission")
    return err(
      prismError(
        PrismErrorCode.IO_ERROR,
        `Cannot write ${result.wipe.path}. Fix: ${result.wipe.fix}`,
      ),
    );
  return ok({
    data: {
      from: before,
      to: result.record.version,
      hosts,
      source: layout.source,
    },
    human: () =>
      `Prism ${before} → ${result.record.version} (local build from ${layout.source}); re-linked ${hosts.join(", ")}. The daemon restarts on next use.`,
  });
};
