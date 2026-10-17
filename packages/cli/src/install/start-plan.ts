/**
 * What `prism start` would change, worked out before it changes anything
 * (round 5, consent). The host writers run in plan mode (`planWrites`), so
 * the list is exactly the files whose content would change: empty means
 * "already set up".
 */
import { basename } from "node:path";
import { userConfigPath } from "@repo-prism/shared/user-config";
import {
  installHost,
  planWrites,
  type InstallHost,
  type InstallScope,
  type PlannedWrite,
} from "./hosts.js";
import { backupDir, tilde } from "./backups.js";
import type { ListRow, WriteRole } from "./consent-copy.js";
import { planWipe1x, type WipePlan } from "./wipe.js";

export type StartPlanInput = {
  readonly hosts: readonly InstallHost[];
  readonly hostNames: Readonly<Record<InstallHost, string>>;
  readonly scope: InstallScope;
  readonly home: string;
  readonly root: string;
  readonly node: string;
  readonly bin: string;
  readonly pack: string;
  readonly env: NodeJS.ProcessEnv;
  readonly now: Date;
};

export type StartPlan = {
  readonly writes: readonly (PlannedWrite & { readonly agent: string })[];
  readonly rows: readonly ListRow[];
  readonly wipe: WipePlan | null;
  /** `~/.prism-backups/<stamp>` (configs/ and 1x/ inside). */
  readonly backupDir: string;
  /** Existing files a real run backs up first. */
  readonly toBackUp: readonly string[];
  /** True when nothing would be written or moved. */
  readonly nothingToDo: boolean;
};

function roleFor(write: PlannedWrite, receiptConfig: string): WriteRole {
  if (write.kind === "dir") return "skill";
  if (write.path === receiptConfig) return "receipt";
  const name = basename(write.path);
  if (
    [
      ".claude.json",
      ".mcp.json",
      "mcp.json",
      "opencode.json",
      "config.toml",
    ].includes(name)
  )
    return "mcp";
  if (name === "settings.json") return "hooks";
  if (name === "AGENTS.md" || name.endsWith(".mdc")) return "rule";
  if (name === "prism.js") return "plugin";
  return "file";
}

export function planStart(input: StartPlanInput): StartPlan {
  const writes: (PlannedWrite & { agent: string })[] = [];
  const seen = new Set<string>();
  // `runInstall` moves a 1.x home before any host writes, so it is planned first.
  const wipe = planWipe1x({ env: input.env, now: input.now });
  const receiptConfig = userConfigPath(input.env);
  // Every host turns the receipt tool on (`installHost`); its row is
  // Prism's own, listed last, as before.
  let receiptWrite: PlannedWrite | undefined;
  const add = (agent: string, list: readonly PlannedWrite[]) => {
    for (const write of list) {
      if (seen.has(write.path)) continue;
      seen.add(write.path);
      if (write.path === receiptConfig) receiptWrite = write;
      else writes.push({ ...write, agent });
    }
  };
  for (const host of input.hosts) {
    add(
      input.hostNames[host],
      planWrites(() => {
        installHost({
          host,
          scope: input.scope,
          home: input.home,
          root: input.root,
          node: input.node,
          bin: input.bin,
          pack: input.pack,
          env: input.env,
          afterWipe: wipe !== null,
        });
      }),
    );
  }
  if (receiptWrite) writes.push({ ...receiptWrite, agent: "Prism" });
  const rows: ListRow[] = writes.map((write) => {
    const role = roleFor(write, receiptConfig);
    return {
      agent: write.agent,
      path: `${tilde(write.path, input.home)}${write.kind === "dir" ? "/" : ""}`,
      role,
      ...(role === "skill" ? { name: basename(write.path) } : {}),
      ...(write.linkTo ? { linkTo: tilde(write.linkTo, input.home) } : {}),
      ...(role === "receipt" ? { own: true } : {}),
    };
  });
  return {
    writes,
    rows,
    wipe,
    backupDir: backupDir(input.env, input.now),
    // Prism's own config.json is not an agent config: never backed up (Muse).
    toBackUp: writes
      .filter((w) => w.exists && w.path !== receiptConfig)
      .map((w) => w.path),
    nothingToDo: writes.length === 0 && wipe === null,
  };
}
