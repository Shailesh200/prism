/**
 * `prism doctor` (M-028) — can Prism work here, and on what?
 *
 * The most useful thing it prints is *which* workspace was chosen and why.
 * Git-root discovery is helpful right up until it surprises someone, and the
 * cure for that surprise is showing the decision rather than hiding it.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "@repo-prism/core";
import { ok } from "@repo-prism/shared";
import { paint, renderFields, renderHeading, type Style } from "../output.js";
import { wrap } from "../table.js";
import type { CommandHandler } from "../runtime.js";

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

  const cacheDir = join(context.workspace.path, ".prism", "cache");
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
