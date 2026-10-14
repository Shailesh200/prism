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
function recordEvent(entry) {
  const path = join(home(), "events.jsonl");
  try {
    mkdirSync(home(), { recursive: true, mode: 0o700 });
    if (existsSync(path) && statSync(path).size >= EVENTS_MAX_BYTES) {
      rmSync(`${path}.${EVENTS_GENERATIONS - 1}`, { force: true });
      for (let n = EVENTS_GENERATIONS - 2; n >= 1; n -= 1) {
        if (existsSync(`${path}.${n}`))
          renameSync(`${path}.${n}`, `${path}.${n + 1}`);
      }
      renameSync(path, `${path}.1`);
    }
    appendFileSync(
      path,
      `${JSON.stringify({ ts: new Date().toISOString(), pid: process.pid, ...entry })}\n`,
      { mode: 0o600 },
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

function workspaceKey(root) {
  return createHash("sha256").update(resolve(root)).digest("hex").slice(0, 24);
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
 * a file outside this session's pack gets a one-line note.
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
  const pack = lastPackFiles();
  if (pack && pack.size > 0 && !pack.has(rel)) {
    return emit(
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: `Prism — ${rel} is not in Prism's pack; check blast_radius.`,
        },
      },
      `outside pack ${rel}`,
    );
  }
  return emit({}, "clear");
}

function afterEdit(snap) {
  const rel = editedPath();
  const row = rel ? match(rel, snap.needsSignOff) : null;
  if (!row) return emit({}, "clear");
  return emit(
    {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `Prism — ${rel} is high-blast (${row.reason}); the receipt will say whether a test reaches it.`,
      },
    },
    `blast ${rel}`,
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

/** The stop hook's hard budget (plan §5.7). */
const STOP_BUDGET_MS = 10_000;

/**
 * The receipt comes from `prism-mcp --hook stop`, which asks the daemon and
 * falls back in-process. Past the budget, or with no answer, the agent is
 * told nothing and the reason goes to the event log (R-C4): raw stderr never
 * reaches the agent.
 */
function stop() {
  if (input.stop_hook_active === true) return emit({}, "already continuing");
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

function gitLines(args) {
  const out = spawnSync("git", args, {
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

/** Hard cap on the prompt hook (plan §5.8 H-PROMPT). */
const PROMPT_CAP_MS = 4000;

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
 * Prompt submit (plan §5.8 H-PROMPT): classify locally; only a change
 * request goes to Prepare, which waits up to 3 s for the daemon. A
 * non-English prompt gets one note per session and no pack. Questions and
 * review requests get nothing.
 */
function prompt() {
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
  if (verdict.kind !== "change") {
    recordEvent({
      event: `prompt.${verdict.kind}`,
      outcome: "skipped",
      reason: verdict.rule,
      workspace: cwd,
    });
    return emit({}, `not a change request (${verdict.kind})`, "skipped");
  }
  const bin = resolveBin();
  if (!bin) {
    missingBin();
    return emit({}, "no binary for auto-prepare", "error");
  }
  const [cmd, args] = binCommand(bin, ["--hook", "prompt"]);
  const child = spawnSync(cmd, args, {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: PROMPT_CAP_MS,
    env: process.env,
  });
  if (child.error?.code === "ETIMEDOUT" || child.signal === "SIGTERM") {
    recordEvent({
      event: "prompt.not_ready",
      outcome: "skipped",
      reason: `no pack within ${PROMPT_CAP_MS}ms`,
      workspace: cwd,
    });
    return emit({}, "auto-prepare timed out", "skipped");
  }
  const out = (child.stdout ?? "").trim();
  const why = (child.stderr ?? "").trim().split("\n").pop() ?? "";
  if (!out || out === "{}")
    return emit({}, why || "auto-prepare skipped", "skipped");
  log(why || "auto-prepare");
  process.stdout.write(out.endsWith("\n") ? out : `${out}\n`);
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

if (event === "session") {
  const record = await liveDaemon();
  await recordSessionBaseline(record);
  await startDaemon(record);
  if (!snap) {
    emit({}, missingReason, "skipped");
  } else {
    emit(
      {
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: snap.orientation,
        },
      },
      "orientation",
    );
  }
} else if (event === "before-edit") {
  if (!snap) emit({}, missingReason, "skipped");
  else beforeEdit(snap);
} else if (event === "after-edit") {
  if (!snap) emit({}, missingReason, "skipped");
  else afterEdit(snap);
} else if (event === "prompt") {
  prompt();
} else if (event === "stop") {
  stop();
} else {
  emit({}, `unknown event ${event}`, "skipped");
}
