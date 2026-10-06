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

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
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
const cwd =
  typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();

function home() {
  const override = process.env.PRISM_HOME?.trim();
  return override || join(homedir(), ".prism");
}

function workspaceKey(root) {
  return createHash("sha256").update(resolve(root)).digest("hex").slice(0, 24);
}

function readSnapshot() {
  const path = join(
    home(),
    "workspaces",
    workspaceKey(cwd),
    "hooks",
    "snapshot.json",
  );
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (data?.version !== 1 || typeof data.workspace !== "string") return null;
    if (resolve(data.workspace) !== resolve(cwd)) return null;
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

function beforeEdit(snap) {
  const rel = editedPath();
  if (!rel) return emit({}, "no path");
  const blocked = match(rel, snap.offLimits);
  const signOff = match(rel, snap.needsSignOff);
  const row = blocked ?? signOff;
  if (!row) return emit({}, "clear");
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

const snap = readSnapshot();

if (event === "session") {
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
} else if (event === "stop") {
  stop();
} else {
  emit({}, "unknown event");
}
