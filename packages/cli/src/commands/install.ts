/**
 * `prism install | uninstall | upgrade` (plan §2.1, §3.1a, §3.3).
 *
 *   prism install <claude|cursor|codex|opencode|all> [--project|--user] [--local <checkout>]
 *   prism uninstall [--purge]
 *   prism upgrade
 *
 * The server and plugin pack come from one of two places, and install never
 * runs `npx` or fetches packages:
 * - a built checkout: `--local <checkout>`, or the checkout this CLI runs
 *   from (development);
 * - the `@repo-prism/mcp-server` and `@repo-prism/plugin` packages installed
 *   with this CLI (`npm i -g @repo-prism/cli`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  err,
  ok,
  PrismErrorCode,
  prismError,
  type PrismError,
} from "@repo-prism/shared";
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
  annotateInstallFile,
  INSTALL_HOSTS,
  installHost,
  removeInstallFile,
  rollBack,
  setJsonKey,
  withJournal,
  type InstallFile,
  type InstallHost,
  type InstallScope,
} from "../install/hosts.js";
import { wipe1x } from "../install/wipe.js";
import { UPDATE_COMMAND, updateLine } from "@repo-prism/shared/update-check";
import { checkCliUpdate, type UpdateDeps } from "../update-line.js";
import type { CommandContext, CommandHandler } from "../runtime.js";
import { wrap } from "../table.js";

const USAGE =
  "Usage: prism install <claude|cursor|codex|opencode|all> [--project|--user] [--local <checkout>]";

export const HOST_NAMES: Record<InstallHost, string> = {
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
const RECEIPT_HOSTS: readonly InstallHost[] = ["cursor", "codex", "opencode"];

function versionAt(packageDir: string): string {
  const path = join(packageDir, "package.json");
  return (JSON.parse(readFileSync(path, "utf8")) as { version: string })
    .version;
}

/** This CLI's package root: `<root>/dist/commands/install.js`. */
function cliPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
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
  /** The checkout, for a local build; absent when installed from npm. */
  readonly source?: string;
  readonly bin: string;
  readonly pack: string;
  /** The server's version. */
  readonly version: string;
};

export function sourceLayout(source: string): SourceLayout | string {
  const bin = join(source, "packages", "mcp-server", "dist", "bin.js");
  const pack = join(source, "packages", "plugin", "dist", "pack");
  const missing = [bin, join(pack, "hooks", "prism-hook.mjs")].filter(
    (path) => !existsSync(path),
  );
  if (missing.length > 0)
    return `${source} is not a built Prism checkout (missing ${missing.join(", ")}). Run \`bun run build\` there first.`;
  return {
    source,
    bin,
    pack,
    version: versionAt(join(source, "packages", "mcp-server")),
  };
}

/**
 * The server and plugin packages installed with this CLI, found the way Node
 * resolves a dependency: `node_modules/@repo-prism/<name>` in `from` or a
 * parent. The server must match the CLI's version (they ship in lockstep).
 */
export function packageLayout(from = cliPackageRoot()): SourceLayout | string {
  const find = (name: string): string | undefined => {
    for (let dir = from; ; dir = dirname(dir)) {
      const candidate = join(dir, "node_modules", "@repo-prism", name);
      if (existsSync(join(candidate, "package.json"))) return candidate;
      if (dirname(dir) === dir) return undefined;
    }
  };
  const server = find("mcp-server");
  const plugin = find("plugin");
  const reinstall =
    "Reinstall with `npm i -g @repo-prism/cli`, or pass `--local <checkout>`.";
  if (!server || !plugin)
    return `The Prism server packages are not installed next to this CLI (missing ${[
      !server && "@repo-prism/mcp-server",
      !plugin && "@repo-prism/plugin",
    ]
      .filter(Boolean)
      .join(", ")}). ${reinstall}`;
  const bin = join(server, "dist", "bin.js");
  const pack = join(plugin, "dist", "pack");
  const missing = [bin, join(pack, "hooks", "prism-hook.mjs")].filter(
    (path) => !existsSync(path),
  );
  if (missing.length > 0)
    return `The installed Prism packages are incomplete (missing ${missing.join(", ")}). ${reinstall}`;
  const version = versionAt(server);
  const cli = versionAt(from);
  if (version !== cli)
    return `@repo-prism/mcp-server ${version} does not match @repo-prism/cli ${cli}. ${reinstall}`;
  return { bin, pack, version };
}

/**
 * Where install takes the server from when no `--local` is given: the
 * checkout this CLI runs from when it is one, else the installed packages.
 */
export function defaultLayout(): SourceLayout | string {
  const source = defaultSource();
  return existsSync(join(source, "packages", "mcp-server", "package.json"))
    ? sourceLayout(source)
    : packageLayout();
}

/** `local build 08e4d3c+dirty`, or `npm package` for an npm install. */
export function layoutLabel(layout: SourceLayout): string {
  return layout.source
    ? `local build ${buildLabel(layout.source)}`
    : "npm package";
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

/**
 * Files an earlier install recorded, minus any since removed (a retired
 * skill, say): those are no longer Prism's to list or uninstall.
 */
export function stillOnDisk(files: readonly InstallFile[]): InstallFile[] {
  return files.filter((f) => f.kind !== "file" || existsSync(f.path));
}

type InstallRun = {
  readonly hosts: readonly InstallHost[];
  readonly scope: InstallScope;
  readonly root: string;
  readonly layout: SourceLayout;
  readonly env: NodeJS.ProcessEnv;
};

/** `08e4d3c`, or `08e4d3c+dirty` when the checkout has uncommitted changes. */
export function buildLabel(source: string): string {
  const sha = readGitHead(source)?.sha?.slice(0, 7);
  if (!sha) return "unknown";
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: source,
    encoding: "utf8",
  });
  return status.status === 0 && status.stdout.trim() !== ""
    ? `${sha}+dirty`
    : sha;
}

/**
 * What an errno means, in words, and what to do about it (Muse, PR 10).
 * Any other code is shown as-is with "Fix what's blocking the file, then
 * run the command again."
 */
export function failureReason(code: string): {
  readonly reason: string;
  readonly fix: string;
} {
  switch (code) {
    case "EBUSY":
      return {
        reason: "the file is in use",
        fix: "Close the app using it, then run the command again.",
      };
    case "EACCES":
    case "EPERM":
      return {
        reason: "permission denied",
        fix: "Check the file's permissions, then run the command again.",
      };
    case "ENOSPC":
      return {
        reason: "the disk is full",
        fix: "Free some space, then run the command again.",
      };
    case "EROFS":
      return {
        reason: "the file is read-only",
        fix: "Make it writable, then run the command again.",
      };
    default:
      return {
        reason: code,
        fix: "Fix what's blocking the file, then run the command again.",
      };
  }
}

/** The message for a failed install, after the rollback (J-15). */
export function installFailureMessage(
  where: string | undefined,
  code: string,
  kept: readonly string[],
): string {
  const { reason, fix } = failureReason(code);
  const what = `${where ? `Prism couldn't write ${where}` : "Prism couldn't finish the install"} (${reason}).`;
  return kept.length === 0
    ? `${what} All agent configs are back as they were. ${fix}`
    : [
        `${what} These couldn't be put back:`,
        ...kept,
        "Run prism uninstall to remove Prism's changes from them, then run the command again.",
      ].join("\n");
}

/** The friendly error for a failed install, after the rollback (J-15). */
function installFailure(
  cause: unknown,
  undo: ReturnType<typeof rollBack>,
): PrismError {
  const error = cause as NodeJS.ErrnoException & { dest?: string };
  // The temp file is an implementation detail: name the user's config.
  const where = (error?.dest ?? error?.path)?.replace(/\.prism-\d+\.tmp$/, "");
  const code =
    error?.code ?? (error instanceof Error ? error.message : String(cause));
  return prismError(
    PrismErrorCode.IO_ERROR,
    installFailureMessage(
      where,
      code,
      undo.kept.map((k) => k.path),
    ),
    {
      restored: undo.restored,
      kept: undo.kept,
    },
  );
}

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
  const installed = run.hosts;
  const target = {
    scope: run.scope,
    home: homedir(),
    root: run.root,
    node: process.execPath,
    bin: run.layout.bin,
    pack: run.layout.pack,
  };
  const key = (file: InstallFile) =>
    `${file.kind}:${file.path}:${"key" in file ? file.key.join(".") : ""}`;
  const earlier = new Map(kept.map((file) => [key(file), file]));
  // Every config write is journaled with its old bytes. A failure part-way
  // puts each written config back, removes the temp file, and still records
  // anything that could not be put back, so `prism uninstall` finds it (J-15).
  const run1 = withJournal(() => {
    for (const host of installed) {
      const result = installHost({ ...target, host });
      files.push(...result.files);
      notes.push(...result.notes);
    }
  });
  if (run1.error !== undefined) {
    const undo = rollBack(run1.journal);
    const left = new Set(undo.kept.map((k) => k.path));
    const stranded = files
      .filter((file) => left.has(file.path))
      .map((file) =>
        annotateInstallFile(file, run1.journal, earlier.get(key(file))),
      );
    if (stranded.length > 0) {
      const merged = new Map<string, InstallFile>();
      for (const file of [...stillOnDisk(kept), ...stranded])
        merged.set(key(file), file);
      const now = new Date().toISOString();
      writeInstallRecord(
        {
          version: run.layout.version,
          bin: run.layout.bin,
          installedAt:
            previous.kind === "ok" ? previous.record.installedAt : now,
          updatedAt: now,
          hosts: [
            ...new Set([
              ...(previous.kind === "ok" ? previous.record.hosts : []),
              ...installed,
            ]),
          ].sort(),
          scope: run.scope,
          root: run.root,
          ...(run.layout.source ? { source: run.layout.source } : {}),
          files: [...merged.values()].map((file) =>
            file.kind === "json-key" ? { ...file, key: [...file.key] } : file,
          ),
        },
        run.env,
      );
    }
    throw installFailure(run1.error, undo);
  }
  if (
    installed.some((host) => RECEIPT_HOSTS.includes(host)) &&
    enableReceipt(run.env)
  )
    notes.push(
      "Enabled the `receipt` MCP tool (extraTools) for the Cursor/Codex/opencode rule path.",
    );
  const merged = new Map<string, InstallFile>();
  for (const file of stillOnDisk(kept)) merged.set(key(file), file);
  for (const file of files)
    merged.set(
      key(file),
      annotateInstallFile(file, run1.journal, earlier.get(key(file))),
    );
  const hosts = new Set([
    ...(previous.kind === "ok" ? previous.record.hosts : []),
    ...installed,
  ]);
  const now = new Date().toISOString();
  const record: InstallRecord = {
    version: run.layout.version,
    bin: run.layout.bin,
    // The first install time survives re-installs and upgrades.
    installedAt: previous.kind === "ok" ? previous.record.installedAt : now,
    updatedAt: now,
    hosts: [...hosts].sort(),
    scope: run.scope,
    root: run.root,
    ...(run.layout.source ? { source: run.layout.source } : {}),
    files: [...merged.values()].map((file) =>
      file.kind === "json-key" ? { ...file, key: [...file.key] } : file,
    ),
  };
  if (installed.length > 0) writeInstallRecord(record, run.env);
  const build = layoutLabel(run.layout);
  return {
    kind: "done",
    wipe,
    record,
    files,
    notes,
    installed,
    build,
  } as const;
}

export const installCommand: CommandHandler = async (
  context: CommandContext,
) => {
  const wanted = hostsFrom(context.args.positionals[0]);
  if (!wanted) return err(prismError(PrismErrorCode.VALIDATION, USAGE));
  const hosts = wanted.filter((host) => hostAvailable(host, homedir()));
  const skipped = wanted.filter((host) => !hosts.includes(host));
  if (context.args.flag("project") && context.args.flag("user"))
    return err(
      prismError(PrismErrorCode.VALIDATION, "Pick one of --project or --user."),
    );
  const scope: InstallScope = context.args.flag("project") ? "project" : "user";
  const local = context.args.option("local");
  const layout = local
    ? sourceLayout(resolve(context.cwd, local))
    : defaultLayout();
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
  const { wipe, record, files, notes, installed, build } = result;
  const where = scope === "project" ? ", this repository" : "";
  return ok({
    data: {
      record,
      written: files,
      wipe: wipe.kind === "wiped" ? wipe : { kind: wipe.kind },
      notes,
    },
    human: ({ width }) =>
      [
        ...(wipe.kind === "wiped" ? [wipe.line] : []),
        ...installed.map(
          (host) =>
            `Prism ${record.version} installed for ${HOST_NAMES[host]} (${build}${where}).`,
        ),
        ...skipped.map((host) => `${HOST_NAMES[host]} not found; skipped.`),
        ...notes.flatMap((note) => wrap(note, width)),
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

/**
 * `prism upgrade` downloads nothing: it re-links the agents to the Prism
 * installed next to this CLI. So it first says when a newer Prism is on npm
 * and names the command that gets it, and says "up to date" when the
 * installed build is already the one the agents use (PR 10).
 */
export function upgradeWith(deps: UpdateDeps = {}): CommandHandler {
  return async () => upgrade(deps);
}

export const upgradeCommand: CommandHandler = upgradeWith();

async function upgrade(deps: UpdateDeps) {
  const env = deps.env ?? process.env;
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
  const layout = record.source ? sourceLayout(record.source) : defaultLayout();
  if (typeof layout === "string")
    return err(prismError(PrismErrorCode.NOT_FOUND, layout));
  const hosts = record.hosts.filter((host): host is InstallHost =>
    INSTALL_HOSTS.includes(host as InstallHost),
  );
  const before = record.version;
  // An npm install checks npm first; a checkout (`skipped`) re-links its
  // fresh build as before.
  const update = await checkCliUpdate({ ...deps, env });
  if (update.kind !== "skipped") {
    if (update.kind === "available")
      return ok({
        data: {
          from: before,
          installed: layout.version,
          latest: update.latest,
          command: UPDATE_COMMAND,
          updated: false,
        },
        human: () => updateLine(update.latest),
      });
    if (before === layout.version)
      return ok({
        data: {
          from: before,
          to: before,
          hosts,
          updated: false,
          ...(update.kind === "unknown" ? { checkFailed: update.reason } : {}),
        },
        human: () =>
          update.kind === "unknown"
            ? `Prism ${before} is installed. Couldn't reach npm to check for updates. To update, run: ${UPDATE_COMMAND}`
            : `Prism is up to date (${before}).`,
      });
  }
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
      `Prism ${before} → ${result.record.version} (${layout.source ? `local build from ${layout.source}` : `npm package ${dirname(dirname(layout.bin))}`}); re-linked ${hosts.join(", ")}. The daemon restarts on next use.`,
  });
}
