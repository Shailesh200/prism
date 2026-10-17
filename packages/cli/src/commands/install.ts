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
import { err, ok, PrismErrorCode, prismError } from "@repo-prism/shared";
import {
  readInstallRecord,
  writeInstallRecord,
  installRecordPath,
  type InstallRecord,
} from "@repo-prism/shared/prism-bin";
import { readGitHead } from "@repo-prism/shared/git-head";
import { prismHomeDir } from "@repo-prism/shared/prism-home";
import { stopDaemon } from "@repo-prism/daemon";
import {
  INSTALL_HOSTS,
  installHost,
  removeInstallFile,
  type InstallFile,
  type InstallHost,
  type InstallScope,
} from "../install/hosts.js";
import {
  backUpFirst,
  confirmAndWrite,
  defaultConsentIo,
  listLines,
  type ConsentIo,
} from "../install/confirm-write.js";
import {
  CONSENT_COPY,
  INSTALL_COPY,
  installedLines,
  relinkedLine,
} from "../install/consent-copy.js";
import { planStart } from "../install/start-plan.js";
import { wipe1x } from "../install/wipe.js";
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
  /** Stamps the 1.x backup folder; `prism start` passes its plan's time. */
  readonly now?: Date;
  /** The home agents read their configs from (default: the OS home). */
  readonly home?: string;
  /** `prism start`'s reserved backup folder, shared with the 1.x move. */
  readonly backupRoot?: string;
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

export async function runInstall(run: InstallRun) {
  const wipe = await wipe1x({
    env: run.env,
    ...(run.now ? { now: run.now } : {}),
    ...(run.backupRoot ? { backupRoot: run.backupRoot } : {}),
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
    home: run.home ?? homedir(),
    root: run.root,
    node: process.execPath,
    bin: run.layout.bin,
    pack: run.layout.pack,
    env: run.env,
  };
  for (const host of installed) {
    const result = installHost({ ...target, host });
    files.push(...result.files);
    notes.push(...result.notes);
  }
  const key = (file: InstallFile) =>
    `${file.kind}:${file.path}:${"key" in file ? file.key.join(".") : ""}`;
  const merged = new Map<string, InstallFile>();
  for (const file of [...stillOnDisk(kept), ...files])
    merged.set(key(file), file);
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

/** What `prism install` and `prism upgrade` need from the machine; tests pass stand-ins. */
export type InstallDeps = ConsentIo & {
  readonly home: () => string;
  readonly env: () => NodeJS.ProcessEnv;
  readonly now: () => Date;
  /** The build to link: `--local <checkout>` when given. */
  readonly layout: (local: string | undefined) => SourceLayout | string;
  /** `prism upgrade`: the build the recorded install should point at. */
  readonly recordLayout: (record: InstallRecord) => SourceLayout | string;
  readonly stopDaemon: (env: NodeJS.ProcessEnv) => Promise<unknown>;
};

export const defaultInstallDeps: InstallDeps = {
  ...defaultConsentIo,
  home: homedir,
  env: () => process.env,
  now: () => new Date(),
  layout: (local) => (local ? sourceLayout(local) : defaultLayout()),
  recordLayout: (record) =>
    record.source ? sourceLayout(record.source) : defaultLayout(),
  stopDaemon: async (env) => stopDaemon({ env }),
};

/**
 * `prism install <agent>`. Running it is the ask (Arc), so there is no y/N,
 * but it works out the same plan as `prism start`, backs up every config it
 * is about to change to the same never-overwritten `~/.prism-backups/<time>/`
 * folder (`backUpFirst`), and then prints each file it wrote and where the
 * backups are.
 */
export function makeInstallCommand(
  deps: InstallDeps = defaultInstallDeps,
): CommandHandler {
  return async (context: CommandContext) => {
    const wanted = hostsFrom(context.args.positionals[0]);
    if (!wanted) return err(prismError(PrismErrorCode.VALIDATION, USAGE));
    const home = deps.home();
    const env = deps.env();
    const now = deps.now();
    const hosts = wanted.filter((host) => hostAvailable(host, home));
    const skipped = wanted.filter((host) => !hosts.includes(host));
    if (context.args.flag("project") && context.args.flag("user"))
      return err(
        prismError(
          PrismErrorCode.VALIDATION,
          "Pick one of --project or --user.",
        ),
      );
    const scope: InstallScope = context.args.flag("project")
      ? "project"
      : "user";
    const local = context.args.option("local");
    const layout = deps.layout(local ? resolve(context.cwd, local) : undefined);
    if (typeof layout === "string")
      return err(prismError(PrismErrorCode.NOT_FOUND, layout));
    const root = context.workspace.path;
    const plan = planStart({
      hosts,
      hostNames: HOST_NAMES,
      scope,
      home,
      root,
      node: process.execPath,
      bin: layout.bin,
      pack: layout.pack,
      env,
      now,
    });
    const say = (line: string) => {
      if (!context.output.json) context.writer.out(line);
    };
    // Backed up first, then written: the same step as `confirmAndWrite`.
    const { backupRoot, backups, backupShown } = backUpFirst(plan, home, say);
    const result = await runInstall({
      hosts,
      scope,
      root,
      layout,
      env,
      now,
      home,
      ...(backupRoot ? { backupRoot } : {}),
    });
    if (result.kind === "permission")
      return err(
        prismError(
          PrismErrorCode.IO_ERROR,
          `Cannot write ${result.wipe.path}; nothing was changed. Fix: ${result.wipe.fix}`,
        ),
      );
    const { wipe, record, files, notes, installed, build } = result;
    const moved = wipe.kind === "wiped";
    return ok({
      data: {
        record,
        build,
        written: files,
        changed: plan.writes.map((write) => write.path),
        backups,
        ...(backupRoot ? { backupDir: backupRoot } : {}),
        wipe: moved ? wipe : { kind: wipe.kind },
        notes,
      },
      human: ({ width }) =>
        [
          ...(moved ? [wipe.line] : []),
          ...installedLines(installed.map((host) => HOST_NAMES[host])).flatMap(
            (line) => wrap(line, width),
          ),
          ...skipped.map((host) => `${HOST_NAMES[host]} not found; skipped.`),
          ...(installed.length > 0
            ? plan.rows.length > 0
              ? [
                  INSTALL_COPY.wrote,
                  ...listLines({ ...plan, wipe: null }, home),
                ]
              : [INSTALL_COPY.nothingWritten]
            : []),
          ...(backups.length > 0 || moved
            ? [CONSENT_COPY.backupsAre(backupShown)]
            : []),
          ...notes.flatMap((note) => wrap(note, width)),
        ].join("\n"),
    });
  };
}

export const installCommand: CommandHandler = makeInstallCommand();

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
 * `prism upgrade`: re-link the recorded agents to the installed build,
 * through the same consent step as `prism start` (Arc): the list, a y/N on a
 * terminal, `--yes` with no terminal or with `--json`, a backup, then the
 * writes. The daemon is stopped only once the upgrade goes ahead; it restarts
 * on next use with the new build.
 */
export function makeUpgradeCommand(
  deps: InstallDeps = defaultInstallDeps,
): CommandHandler {
  return async (context: CommandContext) => {
    const env = deps.env();
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
    const layout = deps.recordLayout(record);
    if (typeof layout === "string")
      return err(prismError(PrismErrorCode.NOT_FOUND, layout));
    const hosts = record.hosts.filter((host): host is InstallHost =>
      INSTALL_HOSTS.includes(host as InstallHost),
    );
    const names = hosts.map((host) => HOST_NAMES[host]);
    const home = deps.home();
    const now = deps.now();
    const scope = record.scope ?? "user";
    const root = record.root ?? context.cwd;
    const before = record.version;
    const plan = planStart({
      hosts,
      hostNames: HOST_NAMES,
      scope,
      home,
      root,
      node: process.execPath,
      bin: layout.bin,
      pack: layout.pack,
      env,
      now,
    });
    const from = layout.source
      ? `local build from ${layout.source}`
      : `npm package ${dirname(dirname(layout.bin))}`;
    const confirmed = await confirmAndWrite({
      command: "prism upgrade",
      plan,
      names,
      home,
      context,
      io: deps,
      write: async (backupRoot) => {
        // The daemon restarts on next use with the new build (lockstep versions, §3.2).
        await deps.stopDaemon(env);
        return runInstall({
          hosts,
          scope,
          root,
          layout,
          env,
          now,
          home,
          ...(backupRoot ? { backupRoot } : {}),
        });
      },
    });
    if (confirmed.kind === "stop") return confirmed.result;
    if (confirmed.kind === "nothing") {
      // Every config already points at this build: nothing asked or written
      // there. Only Prism's own install record moves to the new version.
      await deps.stopDaemon(env);
      if (record.version !== layout.version)
        writeInstallRecord(
          { ...record, version: layout.version, updatedAt: now.toISOString() },
          env,
        );
      return ok({
        data: {
          from: before,
          to: layout.version,
          hosts,
          source: layout.source,
          changed: false,
        },
        human: () =>
          `Prism ${before} → ${layout.version} (${from}); ${names.join(", ")} already match the installed version. The daemon restarts on next use.`,
      });
    }
    const result = confirmed.value;
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
        changed: true,
        backups: confirmed.backups,
      },
      human: () =>
        [
          `Prism ${before} → ${result.record.version} (${from}). ${relinkedLine(names)} The daemon restarts on next use.`,
          ...(confirmed.backups.length > 0
            ? [CONSENT_COPY.backupsAre(confirmed.backupShown)]
            : []),
        ].join("\n"),
    });
  };
}

export const upgradeCommand: CommandHandler = makeUpgradeCommand();
