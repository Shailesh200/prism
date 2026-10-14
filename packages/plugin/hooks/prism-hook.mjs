#!/usr/bin/env node
/**
 * Claude Code hook (ADR-0058, M-079).
 *
 * Session start, before-edit, and after-edit only read the snapshot Prism
 * wrote at index time, so they stay under the latency budget and never wait
 * on an index. Stop runs the change receipt, which does the real checks.
 *
 * Zero dependencies: this file is copied into the plugin pack as-is.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const event = process.argv[2] ?? "";
const started = Date.now();

// One off switch: PRISM_HOOKS=0. The hook says nothing and does not check.
if (process.env.PRISM_HOOKS === "0") {
  process.stdout.write("{}\n");
  process.exit(0);
}

function readStdin() {
  try {
    const raw = readFileSync(0, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
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

function home() {
  const override = process.env.PRISM_HOME?.trim();
  return override || join(homedir(), ".prism");
}

function workspaceKey(root) {
  return createHash("sha256").update(resolve(root)).digest("hex").slice(0, 24);
}

function readSnapshot(root = cwd) {
  const path = join(
    home(),
    "workspaces",
    workspaceKey(root),
    "hooks",
    "snapshot.json",
  );
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (data?.version !== 1 || typeof data.workspace !== "string") return null;
    if (resolve(data.workspace) !== resolve(root)) return null;
    return data;
  } catch {
    return null;
  }
}

function log(said) {
  try {
    const dir = home();
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, "hook-log"),
      `${JSON.stringify({
        ts: new Date().toISOString(),
        hook: event,
        durationMs: Date.now() - started,
        copy: here,
        cwd,
        cwdSource,
        said: String(said).slice(0, 240),
      })}\n`,
    );
  } catch {
    /* a log failure must not fail the hook */
  }
}

function emit(payload, said) {
  log(said);
  process.stdout.write(JSON.stringify(payload));
}

const WARMING =
  "Prism is still indexing this repository. It will start checking edits once that finishes.";

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

/** Files in the last Prepare pack for this workspace, if it is recent. */
function lastPackFiles() {
  try {
    const all = JSON.parse(
      readFileSync(join(home(), "prepare-history.json"), "utf8"),
    );
    const last = all?.[cwd]?.[0];
    if (!last || !Array.isArray(last.packFiles)) return null;
    const age = Date.now() - Date.parse(last.generatedAt ?? "");
    if (!(age >= 0 && age < 2 * 60 * 60 * 1000)) return null;
    return new Set(last.packFiles.map((f) => f?.path).filter(Boolean));
  } catch {
    return null;
  }
}

function beforeEdit(snap) {
  const rel = editedPath();
  if (!rel) return emit({}, "no path");
  const blocked = match(rel, snap.offLimits);
  const signOff = match(rel, snap.needsSignOff);
  const row = blocked ?? signOff;
  if (!row) {
    const pack = lastPackFiles();
    if (pack && pack.size > 0 && !pack.has(rel)) {
      return emit(
        {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            additionalContext: `Prism — ${rel} is not in Prism's pack for this task; check blast_radius before changing it.`,
          },
        },
        `outside pack ${rel}`,
      );
    }
    return emit({}, "clear");
  }
  const reason = blocked
    ? `${rel} is ${row.reason}. Do not edit generated or vendored files.`
    : `${rel} needs sign-off: ${row.reason}.`;
  if (snap.hookArmed) {
    return emit(
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      },
      `deny ${rel}`,
    );
  }
  return emit(
    {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: `Prism warning — ${reason}`,
      },
    },
    `warn ${rel}`,
  );
}

function afterEdit(snap) {
  const rel = editedPath();
  const row = rel ? match(rel, snap.needsSignOff) : null;
  if (!row) return emit({}, "clear");
  return emit(
    {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `Prism — ${rel} is high-blast (${row.reason}). The stop receipt will say whether a test reaches it.`,
      },
    },
    `blast ${rel}`,
  );
}

function mcpBin() {
  if (process.env.PRISM_MCP_BIN) return process.env.PRISM_MCP_BIN;
  for (const rel of [
    "../../mcp-server/dist/bin.js",
    "../../../mcp-server/dist/bin.js",
  ]) {
    const path = join(here, rel);
    if (existsSync(path)) return path;
  }
  return null;
}

function stop() {
  if (input.stop_hook_active === true) return emit({}, "already continuing");
  const bin = mcpBin();
  const args = bin
    ? [bin, "--hook", "stop"]
    : ["-y", "@repo-prism/mcp-server", "--hook", "stop"];
  const cmd = bin ? process.execPath : "npx";
  const child = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    timeout: 110_000,
    env: process.env,
  });
  const out = (child.stdout ?? "").trim();
  if (!out) {
    const detail =
      (child.stderr ?? "").trim().slice(0, 200) || "the receipt did not run";
    return emit(
      {
        hookSpecificOutput: {
          hookEventName: "Stop",
          additionalContext: `Prism could not build a change receipt (${detail}).`,
        },
      },
      "receipt failed",
    );
  }
  log("receipt");
  process.stdout.write(out.endsWith("\n") ? out : `${out}\n`);
}

/**
 * Start the graph daemon with this repository warm, or ask a running one to
 * index it (ADR-0063). Never waits for an index.
 */
function startDaemon() {
  const flag = process.env.PRISM_DAEMON;
  if (flag === "0") return;
  if (flag !== "1" && (process.env.VITEST || process.env.BUN_TEST)) return;
  const bin = mcpBin();
  if (!bin) return;
  const dir = join(home(), "daemon");
  try {
    const record = JSON.parse(readFileSync(join(dir, "daemon.json"), "utf8"));
    process.kill(record.pid, 0);
    fetch(`http://127.0.0.1:${record.port}/v1/workspaces`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${record.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ root: cwd }),
      signal: AbortSignal.timeout(300),
    }).catch(() => undefined);
    return;
  } catch {
    /* no live daemon: start one below */
  }
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const out = openSync(join(dir, "daemon.log"), "a", 0o600);
    const child = spawn(process.execPath, [bin, "--daemon", "--warm", cwd], {
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, PRISM_DAEMON: "1" },
    });
    child.unref();
  } catch {
    /* the MCP server starts one on its first connection anyway */
  }
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
  } catch {
    /* rewrite a corrupt file */
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
  } catch {
    /* the receipt falls back to the whole working tree */
  }
}

/** Same rule as `looksLikeChangeRequest`, loose: the MCP side decides. */
const CHANGE_VERB =
  /\b(fix|add|rename|refactor|implement|remove|delete|drop|migrate|port|update|change|replace|introduce|extract|move|wire|support|create|build|write|rewrite|convert|split|merge|handle|make)\b/i;

/** Prompt submit (ADR-0065): a compact Prepare pack for change requests. */
function prompt() {
  if (process.env.PRISM_AUTOPREPARE === "0") return emit({}, "autoprepare off");
  const text = typeof input.prompt === "string" ? input.prompt : "";
  if (!CHANGE_VERB.test(text)) return emit({}, "not a change request");
  const bin = mcpBin();
  if (!bin) return emit({}, "no local server for auto-prepare");
  const limit = Number(process.env.PRISM_AUTOPREPARE_MS ?? 4000);
  const child = spawnSync(process.execPath, [bin, "--hook", "prompt"], {
    cwd,
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: limit + 1500,
    env: process.env,
  });
  const out = (child.stdout ?? "").trim();
  const why = (child.stderr ?? "").trim().split("\n").pop() ?? "";
  if (!out || out === "{}") return emit({}, why || "auto-prepare skipped");
  log(why || "auto-prepare");
  process.stdout.write(out.endsWith("\n") ? out : `${out}\n`);
}

function chooseWorkspace() {
  const candidates = rootCandidates();
  for (const candidate of candidates) {
    if (readSnapshot(candidate.path)) {
      cwd = candidate.path;
      cwdSource = candidate.source;
      return readSnapshot(candidate.path);
    }
  }
  const first = candidates[0];
  if (first) {
    cwd = first.path;
    cwdSource = first.source;
  }
  return null;
}

const snap = chooseWorkspace();

if (event === "session") {
  recordSession();
  startDaemon();
  if (!snap) {
    emit(
      {
        systemMessage: WARMING,
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: WARMING,
        },
      },
      "warming",
    );
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
  if (!snap)
    emit(
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: WARMING,
        },
      },
      "warming",
    );
  else beforeEdit(snap);
} else if (event === "after-edit") {
  if (!snap) emit({}, "warming");
  else afterEdit(snap);
} else if (event === "prompt") {
  prompt();
} else if (event === "stop") {
  stop();
} else {
  emit({}, "unknown event");
}
