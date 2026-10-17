#!/usr/bin/env node
/**
 * Claude Code hook (ADR-0058, M-079).
 *
 * Session start, before-edit, and after-edit only read the snapshot Prism
 * wrote at index time, so they stay under the latency budget and never wait
 * on an index. Stop runs the change receipt, which does the real checks.
 *
 * No snapshot, or a snapshot for another HEAD (plan §2.4): the hook answers
 * `{}` and records why. No binary (plan §2.2): `{}` plus `install.missing_bin`.
 * Every outcome goes to `~/.prism/events.jsonl` (plan §2.5); nothing is
 * swallowed silently. `npx` is never used.
 *
 * Zero dependencies: this file is copied into the plugin pack as-is. The
 * binary order, git-HEAD reader and event line mirror
 * `@repo-prism/shared/{prism-bin,git-head,events}`; contract tests hold them
 * together.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  appendFileSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import { NON_ENGLISH_NOTE, classifyPrompt } from "./classify-prompt.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const event = process.argv[2] ?? "";
const started = Date.now();

// One off switch: PRISM_HOOKS=0. The hook says nothing and does not check.
if (process.env.PRISM_HOOKS === "0") {
  process.stdout.write("{}\n");
  process.exit(0);
}

/**
 * How much Prism does (plan P5): `full` (default), `lite` (session rules and
 * the stop receipt only) or `off` (hooks say nothing). Set with
 * `prism strength`; a repository's `.prism/config.json` overrides
 * `~/.prism/config.json`.
 */
const STRENGTHS = ["full", "lite", "off"];
function strengthIn(path) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"))?.strength;
    return STRENGTHS.includes(value) ? value : null;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      recordEvent({
        event: "hook.strength",
        outcome: "degraded",
        reason: `${path}: ${message(error)}`,
      });
    }
    return null;
  }
}
function readStrength(root) {
  return (
    strengthIn(join(root, ".prism", "config.json")) ??
    strengthIn(join(home(), "config.json")) ??
    "full"
  );
}

/** The always-on ruleset (plan P16), injected once at session start. */
function ruleset() {
  try {
    return readFileSync(join(here, "prism-rules.md"), "utf8").trim();
  } catch (error) {
    recordEvent({
      event: "hook.ruleset",
      outcome: "degraded",
      reason: message(error),
    });
    return "";
  }
}

const SNAPSHOT_VERSION = 2;
const EVENTS_MAX_BYTES = 5 * 1024 * 1024;
const EVENTS_GENERATIONS = 3;

function home() {
  const override = process.env.PRISM_HOME?.trim();
  return override || join(homedir(), ".prism");
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

/** Same line and rotation as `@repo-prism/shared/events`. */
/** Append one JSONL line, rotating like `shared/events` (5 MB × 3). */
function appendRotated(path, line) {
  mkdirSync(home(), { recursive: true, mode: 0o700 });
  if (existsSync(path) && statSync(path).size >= EVENTS_MAX_BYTES) {
    rmSync(`${path}.${EVENTS_GENERATIONS - 1}`, { force: true });
    for (let n = EVENTS_GENERATIONS - 2; n >= 1; n -= 1) {
      if (existsSync(`${path}.${n}`))
        renameSync(`${path}.${n}`, `${path}.${n + 1}`);
    }
    renameSync(path, `${path}.1`);
  }
  appendFileSync(path, `${line}\n`, { mode: 0o600 });
}

function recordEvent(entry) {
  try {
    appendRotated(
      join(home(), "events.jsonl"),
      JSON.stringify({
        ts: new Date().toISOString(),
        pid: process.pid,
        ...entry,
      }),
    );
  } catch (error) {
    // The event log is the hook's only diary; if it cannot be written, say so
    // on stderr (hosts show it in debug logs) and still answer the host.
    process.stderr.write(
      `prism-hook: events.jsonl not written: ${message(error)}\n`,
    );
  }
}

function readStdin() {
  let raw;
  try {
    raw = readFileSync(0, "utf8");
  } catch (error) {
    recordEvent({
      event: `hook.${event}`,
      outcome: "degraded",
      reason: `stdin unreadable: ${message(error)}`,
    });
    return {};
  }
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    recordEvent({
      event: `hook.${event}`,
      outcome: "degraded",
      reason: `stdin is not JSON: ${message(error)}`,
    });
    return {};
  }
}

const input = readStdin();

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item);
}

/** Hosts disagree on which field is the repository. Try each, prefer a snapshot hit. */
function rootCandidates() {
  const seen = new Set();
  const out = [];
  const push = (value, source) => {
    if (typeof value !== "string" || !value) return;
    const path = resolve(value);
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, source });
  };
  for (const root of stringList(input.workspace_roots)) {
    push(root, "workspace_roots");
  }
  for (const root of stringList(input.workspaceRoots)) {
    push(root, "workspaceRoots");
  }
  push(input.cwd, "cwd");
  push(process.cwd(), "process.cwd");
  return out;
}

let cwd = resolve(process.cwd());
let cwdSource = "process.cwd";

/**
 * The host running this hook: the Cursor agent (its payload names
 * workspace_roots), opencode (its plugin says so), Claude Code (it sets
 * CLAUDE_PROJECT_DIR for its hooks), or "unknown".
 */
function hostName() {
  if (stringList(input.workspace_roots).length > 0) return "cursor";
  if (input.host === "opencode") return "opencode";
  if (process.env.CLAUDE_PROJECT_DIR) return "claude";
  return "unknown";
}

/**
 * Hosts whose Stop plan runs `stop-wait` (asyncRewake) beside `stop`, so the
 * verdict on checks still running wakes the agent in the same session. Only
 * Claude Code's does (shared/hook-config CLAUDE_HOOK_PLAN, the plugin's
 * hooks.json). opencode's plugin runs `stop` only. A host not listed waits
 * for nothing, so its stop line can't promise a wake that won't come.
 */
const STOP_WAKE_HOSTS = new Set(["claude"]);

/**
 * How this host gets the receipt. Claude Code runs the stop hook, which
 * prints it. The Cursor agent and opencode (whose plugin only logs it) never
 * show it to the agent, so the agent asks.
 */
function receiptLine() {
  const noStopHook = ["cursor", "opencode"].includes(hostName());
  return noStopHook
    ? "No stop hook shows Prism's receipt here: before you say done after an edit, call receipt and report its verdict in one line."
    : "When you stop, Prism runs the checks this change reaches and prints a receipt.";
}

/** Mirrors shared `canonicalRoot`: symlinks resolved, one store per repo. */
function canonicalRoot(root) {
  try {
    return realpathSync.native(root);
  } catch {
    return resolve(root);
  }
}

function workspaceKey(root) {
  return createHash("sha256")
    .update(canonicalRoot(root))
    .digest("hex")
    .slice(0, 24);
}

function readFileOrNull(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const code = error?.code;
    if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR")
      return null;
    throw error;
  }
}

/** Same rules as `@repo-prism/shared/git-head`. */
function readGitHead(root) {
  let gitDir = join(root, ".git");
  const dotGit = readFileOrNull(gitDir);
  if (dotGit !== null) {
    const m = /^gitdir:\s*(.+)\s*$/m.exec(dotGit);
    if (!m?.[1]) return null;
    gitDir = isAbsolute(m[1]) ? m[1] : resolve(root, m[1]);
  }
  const head = readFileOrNull(join(gitDir, "HEAD"));
  if (head === null) return null;
  const ref = /^ref:\s*(\S+)/.exec(head.trim());
  if (!ref?.[1]) return { sha: head.trim() || null, branch: null };
  const name = ref[1];
  const branch = name.startsWith("refs/heads/") ? name.slice(11) : name;
  const common = readFileOrNull(join(gitDir, "commondir"));
  const refDir = common ? resolve(gitDir, common.trim()) : gitDir;
  const loose =
    readFileOrNull(join(gitDir, name)) ?? readFileOrNull(join(refDir, name));
  if (loose) return { sha: loose.trim(), branch };
  for (const line of (readFileOrNull(join(refDir, "packed-refs")) ?? "").split(
    "\n",
  )) {
    const [sha, refName] = line.trim().split(" ");
    if (refName === name && sha) return { sha, branch };
  }
  return { sha: null, branch };
}

/** The snapshot for `root`, or `{ missing: reason }`. */
function readSnapshot(root = cwd) {
  const path = join(
    home(),
    "workspaces",
    workspaceKey(root),
    "hooks",
    "snapshot.json",
  );
  let text;
  try {
    text = readFileOrNull(path);
  } catch (error) {
    return { missing: `snapshot unreadable: ${message(error)}` };
  }
  if (text === null) return { missing: "no snapshot yet" };
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    // Plan §2.4: a corrupt snapshot is moved aside, never read again; the
    // daemon writes a fresh one after its next index.
    const reason = `snapshot is not JSON: ${message(error)}`;
    try {
      renameSync(path, `${path}.corrupt-${Date.now()}`);
      recordEvent({
        event: "index.corrupt",
        outcome: "degraded",
        reason,
        workspace: root,
      });
    } catch (moveError) {
      recordEvent({
        event: "index.corrupt",
        outcome: "error",
        reason: `${reason}; could not move it aside: ${message(moveError)}`,
        workspace: root,
      });
    }
    return { missing: reason };
  }
  if (
    data?.version !== SNAPSHOT_VERSION ||
    typeof data.workspace !== "string"
  ) {
    return {
      missing: `snapshot version ${data?.version}, want ${SNAPSHOT_VERSION}`,
    };
  }
  if (resolve(data.workspace) !== resolve(root))
    return { missing: "snapshot is for another root" };
  let head;
  try {
    head = readGitHead(root);
  } catch (error) {
    return { missing: `git HEAD unreadable: ${message(error)}` };
  }
  if (head?.sha && data.headSha && head.sha !== data.headSha) {
    return {
      missing: `stale snapshot: indexed ${String(data.headSha).slice(0, 12)}, HEAD ${head.sha.slice(0, 12)}`,
    };
  }
  return { snap: data };
}

/** `outcome` is ok unless the hook could not do its job; then `reason` says why. */
function log(said, outcome = "ok") {
  recordEvent({
    event: `hook.${event}`,
    outcome,
    ...(outcome === "ok" ? {} : { reason: String(said).slice(0, 240) }),
    workspace: cwd,
    durationMs: Date.now() - started,
    detail: { said: String(said).slice(0, 240), cwdSource, copy: here },
  });
}

function emit(payload, said, outcome = "ok") {
  log(said, outcome);
  process.stdout.write(JSON.stringify(payload));
}

function relPath(file) {
  if (typeof file !== "string" || !file) return null;
  const rel = relative(resolve(cwd), resolve(cwd, file)).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..")) return null;
  return rel;
}

function editedPath() {
  const tool = input.tool_input;
  if (!tool || typeof tool !== "object") return null;
  return relPath(tool.file_path || tool.path || tool.notebook_path);
}

function match(rel, rows) {
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    if (!row || typeof row.path !== "string") continue;
    const dir = row.path.endsWith("/") ? row.path.slice(0, -1) : null;
    if (rel === row.path || rel === dir) return row;
    if (dir && (rel === dir || rel.startsWith(`${dir}/`))) return row;
  }
  return null;
}

/** Where this session's Prepare pack is kept (R-C5: packs are per session). */
function sessionPackPath(id) {
  const key = createHash("sha256").update(id).digest("hex").slice(0, 24);
  return join(
    home(),
    "workspaces",
    workspaceKey(cwd),
    "hooks",
    "packs",
    `${key}.json`,
  );
}

/**
 * Files in this session's Prepare pack, if it is recent. Another session's
 * pack is never used; with no session id, the workspace's last pack is.
 */
function lastPackFiles() {
  const id = typeof input.session_id === "string" ? input.session_id : "";
  let last;
  try {
    if (id) {
      const text = readFileOrNull(sessionPackPath(id));
      if (text === null) return null;
      last = JSON.parse(text);
    } else {
      const text = readFileOrNull(join(home(), "prepare-history.json"));
      if (text === null) return null;
      last = JSON.parse(text)?.[cwd]?.[0];
    }
  } catch (error) {
    recordEvent({
      event: "hook.prepare_history",
      outcome: "degraded",
      reason: message(error),
      workspace: cwd,
    });
    return null;
  }
  if (!last || !Array.isArray(last.packFiles)) return null;
  const age = Date.now() - Date.parse(last.generatedAt ?? "");
  if (!(age >= 0 && age < 2 * 60 * 60 * 1000)) return null;
  return new Set(last.packFiles.map((f) => f?.path).filter(Boolean));
}

/**
 * Before an edit (plan §5.8 H-PRE-EDIT): a generated or vendored file is
 * denied with the reason; a high-blast file only ever gets a warning (R-C6);
 * the first file outside this session's pack gets a one-line note (once a
 * session: on a multi-file task one per edit was noise).
 */
function beforeEdit(snap) {
  const rel = editedPath();
  if (!rel) return emit({}, "no path");
  const blocked = match(rel, snap.offLimits);
  if (blocked) {
    return emit(
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `${rel} is ${blocked.reason}. Do not edit generated or vendored files.`,
        },
      },
      `deny ${rel}`,
    );
  }
  const signOff = match(rel, snap.needsSignOff);
  if (signOff) {
    return emit(
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: `Prism warning — ${rel} needs sign-off: ${signOff.reason}.`,
        },
      },
      `warn ${rel}`,
    );
  }
  return emit({}, "clear");
}

/** Claude Code's name for a Prism tool: `prism install` names the server `prism`. */
function toolId(name) {
  return `mcp__prism__${name}`;
}

/**
 * After an edit (round 4): the blast_radius and test_impact reminders live
 * here, not before the edit or in the prompt block. A PreToolUse note arrives
 * with an edit already under way; this one lands with its result, when the
 * agent picks its next step. Each names the exact tool id, and each is once a
 * session, so a long session is not nagged on every write.
 */
function afterEdit(snap) {
  const rel = editedPath();
  if (!rel) return emit({}, "clear");
  const lines = [];
  const reasons = [];
  const row = match(rel, snap.needsSignOff);
  if (row) {
    lines.push(
      `Prism — ${rel} is high-blast (${row.reason}); the receipt will say whether a test reaches it.`,
    );
    reasons.push(`blast ${rel}`);
  }
  const lite = isLiteSession();
  const pack = lastPackFiles();
  if (
    pack &&
    pack.size > 0 &&
    !pack.has(rel) &&
    !lite &&
    onceForSession("outside_pack")
  ) {
    lines.push(
      `Prism — ${rel} is not in Prism's pack: call ${toolId("blast_radius")} on it to see what depends on it.`,
    );
    reasons.push(`outside pack ${rel}`);
  }
  if (!lite && onceForSession("after_edit_tools")) {
    lines.push(
      `Prism — after editing: call ${toolId("test_impact")} for the tests to run, and ${toolId("blast_radius")} before you change an export or delete code.`,
    );
    reasons.push("tool reminder");
  }
  if (lines.length === 0) return emit({}, "clear");
  return emit(
    {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: lines.join("\n"),
      },
    },
    reasons.join("; "),
  );
}

function isNodeScript(path) {
  return /\.[cm]?js$/.test(path);
}

function executable(path) {
  try {
    accessSync(
      path,
      process.platform === "win32" || isNodeScript(path)
        ? constants.F_OK
        : constants.X_OK,
    );
    return true;
  } catch {
    return false; // not executable is the answer, not a failure
  }
}

/**
 * Plan §2.2, same order as `resolvePrismBin`: PRISM_MCP_BIN → install.json
 * `bin` → `prism-mcp` on PATH → the dev build next to this pack. Never npx.
 */
function resolveBin() {
  const env = process.env.PRISM_MCP_BIN?.trim();
  if (env && executable(env)) return env;
  let install = null;
  try {
    const text = readFileOrNull(join(home(), "install.json"));
    install = text === null ? null : JSON.parse(text);
  } catch (error) {
    recordEvent({
      event: "install.record_invalid",
      outcome: "degraded",
      reason: message(error),
    });
  }
  if (typeof install?.bin === "string" && executable(install.bin))
    return install.bin;
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)
      : [""];
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = join(dir, `prism-mcp${ext.toLowerCase()}`);
      if (executable(candidate)) return candidate;
    }
  }
  for (const rel of [
    "../../mcp-server/dist/bin.js",
    "../../../mcp-server/dist/bin.js",
    // dev pack: packages/plugin/dist/dev-pack/hooks. Hook `env` in
    // hooks.json is not applied by every host, so PRISM_MCP_BIN can be unset.
    "../../../../mcp-server/dist/bin.js",
  ]) {
    const path = join(here, rel);
    if (executable(path)) return path;
  }
  return null;
}

/** argv for running the binary: `.js` dev builds go through this node. */
function binCommand(bin, args) {
  return isNodeScript(bin) ? [process.execPath, [bin, ...args]] : [bin, args];
}

function missingBin() {
  recordEvent({
    event: "install.missing_bin",
    outcome: "error",
    reason: "no prism-mcp: run `prism install`",
    workspace: cwd,
  });
}

/** The stop hook's hard budget (plan P17): structural receipt under 1 s. */
const STOP_BUDGET_MS = 1000;

const pluralLite = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;
/** Mirrors shared: `1 test reaches it`, `N tests reach it`. */
const reachItLite = (n) =>
  `${pluralLite(n, "test")} ${n === 1 ? "reaches" : "reach"} it`;

/** Mirrors shared `REASON_LABEL`: words for every reason, never a raw code. */
const REASON_LABEL = {
  untested: "no tests reach this change",
  no_node_modules: "dependencies not installed",
  unknown_runner: "no known test runner",
  skipped_offline: "checks skipped",
  still_running: "checks still running",
  timeout: "checks timed out",
  already_failing: "tests already failing",
  baseline_unknown: "can't tell if this failure is new",
  outside_change: "failure is in files outside this change",
  unsupported_language: "unsupported language",
  superseded: "replaced by a newer change",
};

/**
 * The parts every verdict line is built from: mirrors shared
 * `receiptHeadline`, `receiptSummaryLine` and `shipVerdictLabel` (plan P11
 * verdict-first: SHIP, NO-SHIP, NOT PROVEN).
 */
function verdictLite(receipt) {
  const touched = receipt?.touched ?? {};
  const total = touched.totalFiles ?? 0;
  const unsupported = Array.isArray(receipt?.unsupported)
    ? receipt.unsupported.length
    : 0;
  const nothing = total === 0 && unsupported === 0;
  // Mirrors shared `blockingChecks`: only a failure this change caused.
  const failed = (receipt?.checks ?? []).filter(
    (c) =>
      c.status === "failed" && (c.cause === undefined || c.cause === "caused"),
  ).length;
  const offLimits = (receipt?.lensFindings ?? [])
    .filter((f) => f.check === "off_limits_touched" && f.status === "fail")
    .flatMap((f) => f.evidence ?? []).length;
  const noShip = receipt?.verdict === "failed" || offLimits > 0;
  const reason = receipt?.reason ?? "untested";
  const label = noShip
    ? "NO-SHIP"
    : receipt?.verdict === "proven"
      ? "SHIP"
      : `NOT PROVEN (${REASON_LABEL[reason] ?? "no verdict yet"})`;
  const failedChecks = pluralLite(failed, "check");
  const offLimitsPaths = pluralLite(offLimits, "off-limits path");
  const why = [
    ...(failed > 0 ? [`${failedChecks} failed`] : []),
    ...(offLimits > 0 ? [offLimitsPaths] : []),
  ];
  const headline = nothing
    ? "Prism · nothing changed"
    : noShip
      ? `Prism · NO-SHIP (${why.join(", ")})`
      : `Prism · ${label}`;
  const changedFiles = pluralLite(total + unsupported, "file");
  // SMK-8 reads `${summary} — ${label}` once final; the interim line at stop
  // and the wake drop the label.
  const summary = `Prism receipt: changed ${changedFiles}, ${pluralLite(touched.dependents ?? 0, "dependent")}, ${reachItLite((receipt?.testFiles ?? []).length)}`;
  return {
    nothing,
    failed,
    offLimits,
    noShip,
    reason,
    label,
    headline,
    summary,
    changedFiles,
    failedChecks,
    offLimitsPaths,
  };
}

/** Mirrors shared `receiptTerminalLine`: a tail only adds an action (Muse). */
const TERMINAL_REASON = {
  untested: "add a test that covers it",
  no_node_modules: "install dependencies to run its tests",
  timeout: "run it again when the machine is less busy",
  outside_change: "check those files separately",
};

/** The verdict in one terminal line: the headline and what it means. */
function terminalLineLite(receipt) {
  const v = verdictLite(receipt);
  if (v.nothing) return v.headline;
  if (v.noShip) {
    return v.failed > 0
      ? `${v.headline} — the agent is fixing it`
      : `${v.headline} — the agent is undoing those edits`;
  }
  if (v.label === "SHIP") {
    return `${v.headline} — the checks this change reaches passed`;
  }
  const meaning = TERMINAL_REASON[v.reason];
  return meaning ? `${v.headline} — ${meaning}` : v.headline;
}

/**
 * The 1 s stop hook's text for the user (Muse v2.1): a "checking" line while
 * the checks run, or the terminal line when the verdict is already final.
 * The pending lines promise the verdict soon ("in a moment", "follows") only
 * when `wakeFollows` (stop-wait brings it into the chat); otherwise the next
 * receipt carries it as `Earlier change`. While checks run there is no verdict word: the summary
 * line drops its label, unless off-limits edits already make it NO-SHIP.
 * Text only; the receipt keeps `still_running`.
 */
function renderReceiptLite(receipt, wakeFollows) {
  const v = verdictLite(receipt);
  if (v.nothing) return v.headline;
  const pending = receipt.checksState === "pending";
  const interim = pending && v.offLimits === 0;
  const first = !pending
    ? terminalLineLite(receipt)
    : interim
      ? wakeFollows
        ? "Prism · checking… verdict in a moment"
        : "Prism · checking… verdict comes with your next receipt"
      : `Prism · NO-SHIP (${v.offLimitsPaths}) — checks still running; ${wakeFollows ? "the verdict follows" : "the verdict comes with your next receipt"}`;
  const lines = [first, interim ? v.summary : `${v.summary} — ${v.label}`];
  // The previous change's checks, finished since its own stop (mirrors shared renderReceipt).
  if (receipt.earlier?.summary) {
    lines.push(`Earlier change  ${receipt.earlier.summary}`);
  }
  const value = valueLineLite(receipt.value);
  if (value) lines.push(value);
  return lines.join("\n");
}

/** Mirrors shared `sessionValueLine` (plan P13, round 2): one line. */
function valueLineLite(value) {
  if (!value || typeof value !== "object") return null;
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const caught = n(value.issuesCaught);
  const remembered = n(value.filesRemembered);
  const saved = value.estimatedSaved;
  const compact = (t) => (t >= 1000 ? `${(t / 1000).toFixed(1)}k` : String(t));
  const plural = (c, one) => `${c} ${c === 1 ? one : `${one}s`}`;
  const parts = [
    ...(typeof saved !== "number"
      ? []
      : saved >= 0
        ? [`saved ~${compact(saved)} tokens`]
        : [`cost ~${compact(-saved)} more tokens than it saved`]),
    ...(remembered > 0
      ? [`remembered ${plural(remembered, "file")} for next time`]
      : []),
    ...(caught > 0 ? [`${plural(caught, "issue")} caught`] : []),
  ];
  return parts.length > 0 ? `Prism: ${parts.join(" · ")}` : null;
}

/**
 * Prefer the warm daemon's structural receipt (no mcp-server spawn). Fall
 * back to `prism-mcp --hook stop` only when the daemon is off. Past the
 * budget, or with no answer, say nothing (R-C4).
 */
async function stop() {
  if (input.stop_hook_active === true) return emit({}, "already continuing");
  const id = typeof input.session_id === "string" ? input.session_id : "";
  const record = await liveDaemon();
  if (record) {
    // Leave headroom under the 1 s wall budget for health + JSON render.
    const receiptTimeout = Math.min(
      700,
      Math.max(100, STOP_BUDGET_MS - (Date.now() - started) - 50),
    );
    const answer = await daemonPost(
      record,
      "/v1/receipt",
      { root: cwd, ...(id ? { sessionId: id } : {}) },
      receiptTimeout,
    );
    if (answer?.ok && answer.value) {
      if (id) rememberStop(id, answer.value);
      const text = renderReceiptLite(
        answer.value,
        STOP_WAKE_HOSTS.has(hostName()),
      );
      // For the user only: Stop context makes the agent take another turn.
      const payload = { systemMessage: text };
      log("receipt (daemon)");
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      recordEvent({
        event: "hook.stop",
        outcome: "ok",
        workspace: cwd,
        durationMs: Date.now() - started,
        detail: {
          id: answer.value.id,
          verdict: answer.value.verdict,
          checksState: answer.value.checksState,
          mode: "daemon-direct",
        },
      });
      return;
    }
    // Daemon on but silent: degrade, do not hang on mcp spawn (HOOK-P4).
    recordEvent({
      event: "receipt.degraded",
      outcome: "skipped",
      reason: "daemon did not answer /v1/receipt",
      workspace: cwd,
      durationMs: Date.now() - started,
    });
    return emit({}, "no receipt: daemon silent", "degraded");
  }
  const bin = resolveBin();
  if (!bin) {
    missingBin();
    return emit({}, "no binary for the receipt", "error");
  }
  const [cmd, args] = binCommand(bin, ["--hook", "stop"]);
  const child = spawnSync(cmd, args, {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: STOP_BUDGET_MS,
    env: process.env,
  });
  if (child.error?.code === "ETIMEDOUT" || child.signal === "SIGTERM") {
    recordEvent({
      event: "receipt.timeout",
      outcome: "skipped",
      reason: `no receipt within ${STOP_BUDGET_MS}ms`,
      workspace: cwd,
      durationMs: Date.now() - started,
    });
    return emit({}, "receipt timed out", "skipped");
  }
  const out = (child.stdout ?? "").trim();
  if (!out || out === "{}") {
    const detail =
      (child.stderr ?? "").trim().split("\n").pop()?.slice(0, 200) ||
      "the receipt did not run";
    return emit({}, `no receipt: ${detail}`, "degraded");
  }
  log("receipt");
  process.stdout.write(out.endsWith("\n") ? out : `${out}\n`);
}

/**
 * The session-end verdict (round 4). Claude Code runs `stop-wait` as a second
 * Stop hook with `asyncRewake: true`: in the background, beside the 1 s
 * `stop` above, so the stop budget is untouched. When the checks on the
 * change the agent stopped on finish, it exits 2 and Claude Code wakes the
 * agent in the same session with the verdict. It wakes for every verdict
 * except "nothing changed" and `superseded` (Muse's rule, round 5), including
 * a final verdict `stop` already showed the user, and at most once per
 * receipt. Silent (exit 0) when a newer stop took over or the daemon is off.
 * The receipt's checks stop by 95 s (RECEIPT_TOTAL_TIMEOUT_MS), under this
 * wait, so a pending verdict at the end of it is a fault, not a normal case.
 */
const STOP_WAIT_MS = 110_000;
/** One daemon wait; the route caps it at 10 s. */
const STOP_WAIT_POLL_MS = 10_000;
/** How long `stop-wait` looks for the receipt its sibling `stop` answered. */
const STOP_WAIT_HANDOFF_MS = 3_000;

function stopStatePath() {
  return join(home(), "workspaces", workspaceKey(cwd), "hooks", "stops.json");
}

function readStops() {
  try {
    const text = readFileOrNull(stopStatePath());
    const parsed = text === null ? {} : JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Per session, the receipt the last `stop` answered and whether it was final. */
function writeStop(sessionId, entry) {
  const path = stopStatePath();
  try {
    const kept = Object.entries(readStops())
      .filter(([key]) => key !== sessionId)
      .slice(-19);
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(
      tmp,
      JSON.stringify(Object.fromEntries([...kept, [sessionId, entry]])),
    );
    renameSync(tmp, path);
  } catch (error) {
    recordEvent({
      event: "hook.stop_state",
      outcome: "degraded",
      reason: message(error),
      workspace: cwd,
    });
  }
}

function rememberStop(sessionId, receipt) {
  if (typeof receipt?.id !== "string") return;
  // Keep which receipt already woke the agent: its reply ends in another
  // stop on the same change, which must not wake it again.
  const woke = readStops()[sessionId]?.woke;
  writeStop(sessionId, {
    id: receipt.id,
    at: Date.now(),
    shown: receipt.checksState !== "pending",
    ...(typeof woke === "string" ? { woke } : {}),
  });
}

/**
 * Why a settled receipt does not wake the agent, or null to wake it
 * (Muse's rule, round 5): every verdict wakes except "nothing changed" and
 * `superseded`; a receipt still pending has no verdict to give.
 */
function stopWakeSkip(receipt) {
  if (!receipt || receipt.checksState === "pending") {
    return "no verdict within the wait";
  }
  if (receipt.reason === "superseded") {
    return "a newer change replaced this one";
  }
  const total = receipt.touched?.totalFiles ?? 0;
  const unsupported = Array.isArray(receipt.unsupported)
    ? receipt.unsupported.length
    : 0;
  if (total === 0 && unsupported === 0) return "nothing changed";
  return null;
}

/** The agent's first line for each NOT PROVEN reason (Muse v2.1). */
const SAY_REASON = {
  no_node_modules: "dependencies aren't installed",
  unknown_runner: "no known runner ran its tests",
  skipped_offline: "checks are off for this run",
  timeout: "a check ran past its time limit",
  already_failing: "its tests failed before this session",
  unsupported_language: "only TS and JS files are checked",
};

/**
 * What wakes the agent (Muse v2.1), exactly 3 lines under 100 chars: the
 * headline, the summary without its label, and the line the agent opens its
 * reply with plus what to do next. The user sees the verdict only through
 * that reply.
 */
function stopWakeText(receipt) {
  const v = verdictLite(receipt);
  let say;
  let action = "stop.";
  if (v.noShip && v.failed > 0 && v.offLimits > 0) {
    say = `Prism: NO-SHIP — ${v.failedChecks} failed, ${v.offLimitsPaths} edited.`;
    action = "fix both.";
  } else if (v.noShip && v.offLimits > 0) {
    say = `Prism: NO-SHIP — ${v.offLimitsPaths} edited; undoing.`;
    action = "undo those edits.";
  } else if (v.noShip) {
    say = `Prism: NO-SHIP — ${v.failedChecks} failed; fixing now.`;
    action = "fix them.";
  } else if (v.label === "SHIP") {
    say = "Prism: SHIP — the checks this change reaches passed.";
  } else if (v.reason === "untested") {
    // J-09: nothing proves this change; the user decides.
    say = "NOT PROVEN: no tests cover this change.";
    action = "ask the user.";
  } else if (v.reason === "baseline_unknown") {
    // Never "you caused" without proof: the user decides.
    say = "NOT PROVEN: Prism can't tell if this failure is new.";
    action = "ask the user.";
  } else if (v.reason === "outside_change") {
    say = "Prism: NOT PROVEN — the failure is in files outside this change.";
    action = "ask the user.";
  } else {
    say = `Prism: NOT PROVEN — ${SAY_REASON[v.reason] ?? REASON_LABEL[v.reason] ?? "no verdict yet"}.`;
  }
  return [
    v.headline,
    v.summary,
    `Prism · Say first: "${say}" Then ${action}`,
  ].join("\n");
}

async function stopWait() {
  const session = typeof input.session_id === "string" ? input.session_id : "";
  if (!session) return emit({}, "no session to wait on", "skipped");
  const record = await liveDaemon();
  if (!record) return emit({}, "no daemon to wait on", "skipped");
  // `stop` starts beside this hook; take the receipt it answers.
  let entry = null;
  const handoff = Date.now() + STOP_WAIT_HANDOFF_MS;
  while (!entry && Date.now() < handoff) {
    const found = readStops()[session];
    if (found && typeof found.at === "number" && found.at >= started - 1000) {
      entry = found;
    } else {
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  if (!entry) return emit({}, "no stop receipt to wait on", "skipped");
  if (entry.woke === entry.id)
    return emit({}, "already woke the agent for this change", "skipped");
  // A final receipt at stop was shown to the user only; it is fetched here
  // like a pending one (the daemon answers at once) so the agent gets it too.
  const current = () => readStops()[session]?.id === entry.id;
  const deadline = started + STOP_WAIT_MS;
  let settled = null;
  while (Date.now() < deadline) {
    const wait = Math.min(STOP_WAIT_POLL_MS, deadline - Date.now());
    const answer = await daemonPost(
      record,
      "/v1/receipt-status",
      { root: cwd, id: entry.id, waitMs: wait },
      wait + 2000,
    );
    if (!answer?.ok || !answer.value) {
      return emit({}, "no verdict: daemon silent", "degraded");
    }
    settled = answer.value.receipt ?? null;
    if (!settled || settled.checksState !== "pending" || !answer.value.running)
      break;
    if (!current()) return emit({}, "a newer stop took over", "skipped");
  }
  if (!current())
    return emit({}, "a newer change replaced this one", "skipped");
  const skip = stopWakeSkip(settled);
  if (skip) {
    // A pending receipt here means the checks outran their 95 s limit.
    const pending = !settled || settled.checksState === "pending";
    return emit({}, skip, pending ? "degraded" : "skipped");
  }
  writeStop(session, { ...entry, shown: true, woke: entry.id });
  log(`verdict ${settled.verdict} (wake)`);
  // Exit 2 under asyncRewake: Claude Code wakes the agent with this text.
  process.stderr.write(`${stopWakeText(settled)}\n`);
  process.exitCode = 2;
}

/**
 * Start the graph daemon with this repository warm, or ask a running one to
 * index it (ADR-0063). Never waits for an index.
 */
async function daemonAnswers(record) {
  try {
    const res = await fetch(`http://127.0.0.1:${record.port}/v1/health`, {
      headers: { Authorization: `Bearer ${record.token}` },
      signal: AbortSignal.timeout(250),
    });
    return res.status === 200;
  } catch {
    return false; // unreachable is the answer: start a daemon
  }
}

/** The daemon record, if one was written and parses. */
function readDaemonRecordFile() {
  try {
    const text = readFileOrNull(join(home(), "daemon", "daemon.json"));
    return text === null ? null : JSON.parse(text);
  } catch (error) {
    recordEvent({
      event: "hook.daemon_record",
      outcome: "degraded",
      reason: message(error),
    });
    return null;
  }
}

/** POST to the daemon; the parsed `{ok, value}` body, or null. */
async function daemonPost(record, path, body, timeoutMs) {
  try {
    const res = await fetch(`http://127.0.0.1:${record.port}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${record.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.status === 200 ? await res.json() : null;
  } catch (error) {
    recordEvent({
      event: `hook.daemon${path.replace(/^\/v1\//, "_")}`,
      outcome: "degraded",
      reason: message(error),
      workspace: cwd,
    });
    return null;
  }
}

/** A running daemon that answers with its token, or null (plan §2.1). */
async function liveDaemon() {
  const flag = process.env.PRISM_DAEMON;
  if (flag === "0") return null;
  const record = readDaemonRecordFile();
  if (
    record &&
    typeof record.port === "number" &&
    (await daemonAnswers(record))
  ) {
    return record;
  }
  return null;
}

async function startDaemon(record) {
  const flag = process.env.PRISM_DAEMON;
  if (flag === "0") return;
  if (flag !== "1" && (process.env.VITEST || process.env.BUN_TEST)) return;
  if (record) {
    await daemonPost(record, "/v1/workspaces", { root: cwd }, 300);
    return;
  }
  const bin = resolveBin();
  if (!bin) return missingBin();
  const dir = join(home(), "daemon");
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const out = openSync(join(dir, "daemon.log"), "a", 0o600);
    const [cmd, args] = binCommand(bin, ["--daemon", "--warm", cwd]);
    const child = spawn(cmd, args, {
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, PRISM_DAEMON: "1" },
    });
    child.unref();
  } catch (error) {
    // The MCP server starts one on its first connection anyway.
    recordEvent({
      event: "hook.daemon_start",
      outcome: "degraded",
      reason: message(error),
      workspace: cwd,
    });
  }
}

/**
 * Session baseline (plan §5.8 H-SESSION): the daemon records it with no git
 * time limit. With no daemon answering yet, the hook records it itself.
 */
async function recordSessionBaseline(record) {
  const id = typeof input.session_id === "string" ? input.session_id : "";
  if (record) {
    const answer = await daemonPost(
      record,
      "/v1/session",
      { root: cwd, ...(id ? { sessionId: id } : {}) },
      700,
    );
    if (answer?.ok) return;
  }
  recordSession();
}

/** Read-only: never take `index.lock` from under the user's own git. */
function gitLines(args) {
  const out = spawnSync("git", ["--no-optional-locks", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 2000,
  });
  if (out.status !== 0) return null;
  return (out.stdout ?? "").split("\n").filter(Boolean);
}

/**
 * Record what was already changed when the session began (M-092), so the
 * receipt scores only this session's edits. A resumed or compacted session
 * keeps its first baseline.
 */
function recordSession() {
  const path = join(
    home(),
    "workspaces",
    workspaceKey(cwd),
    "hooks",
    "session.json",
  );
  const id = typeof input.session_id === "string" ? input.session_id : "";
  try {
    if (id && existsSync(path)) {
      const prior = JSON.parse(readFileSync(path, "utf8"));
      if (prior?.sessionId === id) return;
    }
  } catch (error) {
    recordEvent({
      event: "hook.session_baseline",
      outcome: "degraded",
      reason: `rewriting corrupt session.json: ${message(error)}`,
      workspace: cwd,
    });
  }
  const changed = gitLines(["diff", "--name-only", "--relative", "HEAD"]);
  const untracked = gitLines(["ls-files", "--others", "--exclude-standard"]);
  if (changed === null && untracked === null) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        ...(id ? { sessionId: id } : {}),
        startedAt: new Date().toISOString(),
        dirty: [...new Set([...(changed ?? []), ...(untracked ?? [])])].sort(),
      }),
    );
  } catch (error) {
    // The receipt falls back to the whole working tree.
    recordEvent({
      event: "hook.session_baseline",
      outcome: "degraded",
      reason: message(error),
      workspace: cwd,
    });
  }
}

/**
 * Round 4, hook upgrades: a Claude Code settings file whose Prism entries an
 * earlier release wrote gets this release's (new hooks such as `stop-wait`),
 * keeping its paths and the user's own hooks, after a backup. Only files whose
 * Prism hooks run this very script are touched. A config it cannot safely
 * change gets one line naming the command, at most once a day per file.
 * Claude Code reads hooks at session start, so changes apply next session.
 */
async function refreshHookConfig() {
  const flag = process.env.PRISM_HOOK_REFRESH;
  if (flag === "0" || input.host === "opencode") return [];
  if (flag !== "1" && (process.env.VITEST || process.env.BUN_TEST)) return [];
  let config;
  try {
    config = await import("./hook-config.mjs");
  } catch (error) {
    recordEvent({
      event: "hook.config_refresh",
      outcome: "degraded",
      reason: message(error),
      workspace: cwd,
    });
    return [];
  }
  const self = fileURLToPath(import.meta.url);
  const project = process.env.CLAUDE_PROJECT_DIR || cwd;
  const files = [
    { path: join(homedir(), ".claude", "settings.json"), scope: "user" },
    { path: join(project, ".claude", "settings.json"), scope: "project" },
  ].filter((file, i, all) => all.findIndex((f) => f.path === file.path) === i);
  const lines = [];
  for (const file of files) {
    let result;
    try {
      result = config.refreshClaudeHooks(file.path, { onlyHook: self });
    } catch (error) {
      result = { kind: "manual", reason: message(error) };
    }
    // The real user's ~/.claude is guarded: nothing read or written, and at
    // most one quiet event a day (no line for the user).
    if (result.kind === "guarded") {
      if (firstWarningToday(file.path)) {
        recordEvent({
          event: "hook.config_refresh",
          outcome: "skipped",
          reason: "the real user's ~/.claude is not auto-updated",
          workspace: cwd,
          detail: { path: file.path, scope: file.scope },
        });
      }
      continue;
    }
    if (result.kind === "updated" || result.kind === "manual") {
      recordEvent({
        event: "hook.config_refresh",
        outcome: result.kind === "updated" ? "ok" : "skipped",
        ...(result.kind === "manual" ? { reason: result.reason } : {}),
        workspace: cwd,
        detail: { path: file.path, scope: file.scope },
      });
    }
    if (result.kind === "manual" && !firstWarningToday(file.path)) continue;
    const line = config.hookRefreshLine(result, file.scope);
    if (line) lines.push(line);
  }
  return lines;
}

/** True the first time today a hook-config warning names `path`. */
function firstWarningToday(path) {
  const file = join(home(), "hooks-config-warned.json");
  const today = new Date().toISOString().slice(0, 10);
  let seen = {};
  try {
    const text = readFileOrNull(file);
    seen = text === null ? {} : JSON.parse(text);
  } catch {
    seen = {};
  }
  if (seen[path] === today) return false;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...seen, [path]: today }));
  } catch (error) {
    recordEvent({
      event: "hook.config_refresh",
      outcome: "degraded",
      reason: message(error),
      workspace: cwd,
    });
  }
  return true;
}

/** Hard cap on the prompt hook (plan P17): p95 under 1 s. */
const PROMPT_CAP_MS = 1000;

/** Show a one-line note at most once per session (HK-4). */
function onceForSession(kind) {
  const id = typeof input.session_id === "string" ? input.session_id : "";
  if (!id) return true;
  const path = join(
    home(),
    "workspaces",
    workspaceKey(cwd),
    "hooks",
    "notes.json",
  );
  let seen = {};
  try {
    const text = readFileOrNull(path);
    seen = text === null ? {} : JSON.parse(text);
  } catch (error) {
    recordEvent({
      event: "hook.notes",
      outcome: "degraded",
      reason: message(error),
      workspace: cwd,
    });
    seen = {};
  }
  const key = `${kind}:${id}`;
  if (seen[key]) return false;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const keys = Object.keys(seen).slice(-200);
    writeFileSync(
      path,
      JSON.stringify({
        ...Object.fromEntries(keys.map((k) => [k, true])),
        [key]: true,
      }),
    );
  } catch (error) {
    recordEvent({
      event: "hook.notes",
      outcome: "degraded",
      reason: message(error),
      workspace: cwd,
    });
  }
  return true;
}

/**
 * The prompt hook's own work stops here, leaving the rest of PROMPT_CAP_MS
 * for node start-up and the host reading stdout (token fix 2).
 */
const PROMPT_WORK_MS = PROMPT_CAP_MS - 150;

/** Prompt kinds that may get a pack or a lens (mirrors hook-command PROMPT_KINDS). */
const PROMPT_KINDS = ["change", "review", "question"];

/** The daemon build id for `bin`, as `daemonBuildIdFor` derives it. */
function buildIdFor(bin) {
  try {
    const stamp = join(dirname(realpathSync(bin)), "daemon-attach.js");
    const pkg = JSON.parse(
      readFileSync(join(dirname(stamp), "..", "package.json"), "utf8"),
    );
    return typeof pkg.version === "string"
      ? `${pkg.version}+${Math.trunc(statSync(stamp).mtimeMs)}`
      : undefined;
  } catch {
    return undefined; // no id: the daemon answers without the build check
  }
}

/** `/v1/prompt` on the warm daemon, in the daemon client's outcome shape. */
async function daemonPrompt(request, timeoutMs, buildId) {
  const record = readDaemonRecordFile();
  if (!record || typeof record.port !== "number")
    return { kind: "unavailable", reason: "no daemon running" };
  try {
    const res = await fetch(`http://127.0.0.1:${record.port}/v1/prompt`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${record.token}`,
        "Content-Type": "application/json",
        ...(buildId ? { "x-prism-build": buildId } : {}),
      },
      body: JSON.stringify({ ...request, root: canonicalRoot(cwd) }),
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
    if (res.status === 409)
      return { kind: "unavailable", reason: "daemon is from another build" };
    const body = await res.json();
    if (body?.ok) return { kind: "ok", value: body.value };
    if (res.status >= 500 || !body?.error)
      return {
        kind: "unavailable",
        reason: body?.error?.message ?? `daemon answered ${res.status}`,
      };
    return { kind: "error", error: body.error };
  } catch (error) {
    return {
      kind: "unavailable",
      reason:
        error instanceof Error && error.name === "TimeoutError"
          ? "daemon did not answer in time"
          : "daemon is not reachable",
    };
  }
}

/**
 * Prompt submit (plan §5.8 H-PROMPT / P17, rounds 2–4): classify locally,
 * then run the shared prompt hook (`prompt-hook.mjs`, the bundle of
 * `@repo-prism/shared/prompt-hook`) in this process: the lens from the lens
 * store, once per session, and the file block from the warm daemon. A daemon
 * busy re-indexing drops the block, not the lens. Only with the daemon off
 * (`PRISM_DAEMON=0`) does it run `prism-mcp --hook prompt`, which indexes
 * in-process; that path runs the same shared code.
 */
async function prompt() {
  const mode = process.env.PRISM_AUTOPREPARE;
  if (mode === "0" || mode === "off") return emit({}, "autoprepare off");
  const text = typeof input.prompt === "string" ? input.prompt : "";
  const verdict = classifyPrompt(text);
  if (verdict.kind === "non_english") {
    recordEvent({
      event: "prompt.non_english",
      outcome: "skipped",
      reason: "not English",
      workspace: cwd,
    });
    if (!onceForSession("non_english"))
      return emit({}, "non-English (noted already)", "skipped");
    return emit(
      {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: NON_ENGLISH_NOTE,
        },
      },
      "non-English note",
    );
  }
  if (!PROMPT_KINDS.includes(verdict.kind)) {
    recordEvent({
      event: `prompt.${verdict.kind}`,
      outcome: "skipped",
      reason: verdict.rule,
      workspace: cwd,
    });
    return emit({}, `not a change request (${verdict.kind})`, "skipped");
  }

  const bin = resolveBin();
  if (process.env.PRISM_DAEMON === "0") return promptInProcess(bin, verdict);
  const buildId = bin ? buildIdFor(bin) : undefined;
  let why = "auto-prepare";
  const { runPromptHook } = await import("./prompt-hook.mjs");
  const out = await runPromptHook(input, {
    root: cwd,
    startedAt: started,
    limitMs: PROMPT_WORK_MS,
    log: (line) => (why = line),
    files: {
      via: "daemon",
      call: (request, budget) => daemonPrompt(request, budget, buildId),
    },
  });
  if (Object.keys(out).length === 0) return emit({}, why, "skipped");
  log(why);
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

/** Daemon off: `prism-mcp --hook prompt` indexes in-process inside the budget. */
function promptInProcess(bin, verdict) {
  if (!bin) {
    missingBin();
    return emit({}, "no binary for auto-prepare", "error");
  }
  const budget = Math.max(0, PROMPT_WORK_MS - (Date.now() - started));
  const [cmd, args] = binCommand(bin, ["--hook", "prompt"]);
  const child = spawnSync(cmd, args, {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: budget,
    // The child answers inside this, counted from its own start, and keeps
    // a little back for writing its answer.
    env: { ...process.env, PRISM_AUTOPREPARE_MS: String(budget - 50) },
  });
  if (child.error?.code === "ETIMEDOUT" || child.signal === "SIGTERM") {
    recordEvent({
      event: "prompt.deadline",
      outcome: "skipped",
      reason: `no answer within ${budget}ms`,
      workspace: cwd,
      durationMs: Date.now() - started,
    });
    return emit(
      // A change request always gets the user's one line.
      verdict.kind === "change"
        ? { systemMessage: "Prism · nothing to add (timed out)" }
        : {},
      `auto-prepare skipped: no answer within ${budget}ms`,
      "skipped",
    );
  }
  const out = (child.stdout ?? "").trim();
  const why = (child.stderr ?? "").trim().split("\n").pop() ?? "";
  if (!out || out === "{}")
    return emit({}, why || "auto-prepare said nothing", "skipped");
  log(why || "auto-prepare");
  process.stdout.write(`${out}\n`);
}

/**
 * A named-file prompt got its pack (token fix 4): `prism-mcp --hook prompt`
 * lists the session here and the after-edit "not in Prism's pack" nudge
 * stays quiet for the rest of it.
 */
function liteSessionPath() {
  return join(home(), "workspaces", workspaceKey(cwd), "hooks", "lite.json");
}

function isLiteSession() {
  const id = typeof input.session_id === "string" ? input.session_id : "";
  if (!id) return false;
  try {
    const text = readFileOrNull(liteSessionPath());
    return text !== null && JSON.parse(text).includes(id);
  } catch {
    return false;
  }
}

let missingReason = "no snapshot yet";

function chooseWorkspace() {
  const candidates = rootCandidates();
  let firstMiss = null;
  for (const candidate of candidates) {
    const read = readSnapshot(candidate.path);
    if (read.snap) {
      cwd = candidate.path;
      cwdSource = candidate.source;
      return read.snap;
    }
    firstMiss ??= read.missing;
  }
  const first = candidates[0];
  if (first) {
    cwd = first.path;
    cwdSource = first.source;
  }
  if (firstMiss) missingReason = firstMiss;
  return null;
}

const snap = chooseWorkspace();
const strength = readStrength(cwd);

if (strength === "off") {
  emit({}, "strength off", "skipped");
} else if (event === "session") {
  const record = await liveDaemon();
  await recordSessionBaseline(record);
  await startDaemon(record);
  // An old Prism hook config gets this release's entries, or one line on how.
  const notice = await refreshHookConfig();
  const shown = notice.length > 0 ? { systemMessage: notice.join("\n") } : {};
  // Stable first (plan P16): the fixed ruleset, then the repository part.
  // Claude Code already shows the MCP server's instructions, which embed the
  // ruleset; sending it here too would put it in context twice (token fix 3).
  const rules = process.env.CLAUDE_PROJECT_DIR ? "" : ruleset();
  // Once per session: a resumed session still has the first start's block in
  // its transcript (a compacted one does not, so it gets it again).
  const resumed = input.source === "resume";
  const context = resumed
    ? ""
    : [
        rules,
        strength === "full" && snap
          ? `${snap.orientation}\n${receiptLine()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
  if (resumed) {
    emit(shown, "resumed session: start block already sent", "skipped");
  } else if (!context) {
    emit(shown, missingReason, "skipped");
  } else {
    emit(
      {
        ...shown,
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: context,
        },
      },
      strength === "full" && snap
        ? "rules + orientation"
        : snap
          ? `rules (strength ${strength})`
          : `rules (${missingReason})`,
    );
  }
} else if (event === "stop") {
  await stop();
} else if (event === "stop-wait") {
  await stopWait();
} else if (strength === "lite") {
  emit({}, "strength lite", "skipped");
} else if (event === "before-edit") {
  if (!snap) emit({}, missingReason, "skipped");
  else beforeEdit(snap);
} else if (event === "after-edit") {
  if (!snap) emit({}, missingReason, "skipped");
  else afterEdit(snap);
} else if (event === "prompt") {
  await prompt();
} else {
  emit({}, `unknown event ${event}`, "skipped");
}
