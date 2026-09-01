/**
 * Dispatch tools are a second registration path on the same `prism` MCP server.
 *
 * They write `.prism/dispatch/*`, run OAuth, and spawn local Cursor agents.
 * They must not go through `registerTools` — that wrapper opens the workspace
 * and indexes, which start-my-day does not need (ADR-0035).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createClaudeWorkerPort,
  createCursorWorkerPort,
  createDispatchRuntime,
  gitFailureSpeak,
  isMissingGitRepoMessage,
  isWorkerRole,
  startJobNoticeWatcher,
  visibleDispatchTools,
  type DispatchRuntime,
  type DispatchToolName,
} from "@repo-prism/dispatch";
import { ensureHub, peekHub, type HubHandle } from "@repo-prism/dispatch-hub";
import type { ZodRawShape } from "zod";
import { z } from "zod";
import { toMcpErrorFromThrown } from "./errors.js";
import { JOBS_APP_URI } from "./jobs-app-uri.js";
import { createMcpOAuthUi } from "./oauth-ui.js";
import { serialiseForMcp } from "./tool-registry.js";

export type DispatchToolDefinition = {
  readonly name: DispatchToolName;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: ZodRawShape;
  readonly readOnly: boolean;
  readonly openWorld: boolean;
};

export const DISPATCH_TOOLS: readonly DispatchToolDefinition[] = [
  {
    name: "start_my_day",
    title: "Start my day",
    description:
      "Standup briefing for this repository: greeting, what happened yesterday (git + finished jobs + completed Linear), then open items on Linear/GitHub/Slack/Calendar/Notion, leftover Dispatch jobs, and one suggested focus. Unconnected tools appear as named connect CTAs. Does not index the repo. Call this when the user says start my day, standup, or what's waiting on me. Return the message as written — do not omit a connected driver.",
    inputSchema: {
      workspace: z
        .string()
        .optional()
        .describe(
          "Absolute path of the git repository the user has open. Pass the folder that contains .git when you know it — do not ask the user.",
        ),
    },
    readOnly: true,
    openWorld: true,
  },
  {
    name: "init",
    title: "Set up Dispatch workers",
    description:
      "One-time worker sign-in so Prism can run local job teammates. The worker matches the host (ADR-0044): in Cursor a Cursor login page opens in the browser; in Claude Code this checks the claude CLI is installed and signed in, and the message says what to run when it is not. Speak only the tool message to the user — never mention API keys, mcp.json, host role, or connector counts. If Cursor shows “Authenticating prism…” with Skip, that is host tool-approval: tell the user to click Skip, then retry init.",
    inputSchema: {},
    readOnly: false,
    openWorld: false,
  },
  {
    name: "start_job",
    title: "Start a Dispatch job",
    description:
      "Hand a code change to a background teammate. Call this for ANY request to change this repository — fix a bug or broken behaviour, implement, add, wire up, refactor, rename, migrate, or make one area behave like another. Intent is enough: it does not require the words “start working on”, a ticket id, or a PRD, so “the highlighting is not working in the news tab, fix that issue” is a start_job. Derive title and prd yourself from the request plus the repo; do not interview the user. Say in one line what you are starting, then call it. An explicit request overrides every exclusion that follows: if the user asks for a background job in words (“start working on …”, “start a job”, “dispatch this”, “in the background”, “hand it off”), call this even when the task is read-only — “start working on reviewing the local changes” is a start_job, and answering it inline while explaining why you did not dispatch is wrong. Otherwise do NOT call this when the user wants it done inline now (“do it now”, “right here”, “yourself”, “quick fix”, “don't dispatch”), when they are asking a question rather than assigning work, for one trivial fully-specified edit, or for a repo-wide audit (repository_health). Always pass workspace as the absolute path of the git repository you are editing (the folder that contains .git). Starts a local teammate — a Cursor agent in Cursor, a Claude Code agent in Claude Code (no shell; no second Prism MCP; may use in-process subagents for multi-part work) — and returns immediately. By default the teammate works in the user's own checkout and leaves edits uncommitted (ADR-0045); pass placement=worktree when the user asks for a separate branch/worktree or wants their tree left alone. When the teammate stops, Prism runs typecheck and tests, so the result carries a real pass/fail; worktree jobs also get a commit on the job branch. Speak only the tool message: use the job title and canonical id (ticket like AI-971 or slug like audit-issues), never job-<hex>, worktree paths, or API keys. Tell the user to say where are we for live status and the result when it finishes. Jobs are admitted on free memory, so a second teammate may be refused while one is running. If the tree has uncommitted changes, the tool asks first — relay that and re-call with confirmDirty=true only if the user agrees. If sign-in is needed, the message says what to do (Cursor: a login page opens; Claude Code: run claude once in a terminal). If Cursor shows “Authenticating prism…” with Skip, tell the user to click Skip and retry. If the tool says Prism does not see a git repository, retry once with workspace set to the open project path — do not throw PRISM_UNKNOWN at the user.",
    inputSchema: {
      title: z.string().describe("Ticket id and/or short job title"),
      prd: z
        .string()
        .optional()
        .describe("Product brief / acceptance criteria"),
      jobId: z
        .string()
        .optional()
        .describe(
          "Canonical job id; inferred from a ticket or title slug when omitted",
        ),
      branch: z
        .string()
        .optional()
        .describe("Preferred branch when creating a worktree"),
      placement: z
        .enum(["checkout", "worktree"])
        .optional()
        .describe(
          "Where the teammate works. Default checkout (the user's tree, uncommitted edits). Use worktree when the user asks for a separate branch or wants their tree untouched.",
        ),
      confirmDirty: z
        .boolean()
        .optional()
        .describe(
          "Set true only after the user agrees a checkout job may work alongside their uncommitted changes",
        ),
      workspace: z
        .string()
        .optional()
        .describe(
          "Absolute path of the git repository the user has open. Pass the folder that contains .git when you know it — do not ask the user. Do not put this in mcp.json.",
        ),
      playbook: z
        .string()
        .optional()
        .describe("Job playbook id, default ticket"),
      confirmOverlap: z
        .boolean()
        .optional()
        .describe(
          "Set true only after the user confirms a second agent on a shared dirty worktree",
        ),
    },
    readOnly: false,
    openWorld: false,
  },
  {
    name: "job_logs",
    title: "Show a job's console",
    description:
      "The console for one Dispatch job: recent activity lines (thinking, tool calls, edits, errors) plus the uncommitted review summary when it has finished. Call this when the user asks what a teammate is doing, why it is stuck, what went wrong, or wants to see logs/output — and when list_jobs shows no activity for a while. Omit jobId for the job that is still running. Pass since (an ISO timestamp from the last entry) to tail only new lines instead of re-reading everything. Speak the tool message; do not print worktree paths.",
    inputSchema: {
      jobId: z
        .string()
        .optional()
        .describe(
          "Canonical job id (ticket or slug) or the job title. Omit for the running job.",
        ),
      limit: z
        .number()
        .int()
        .optional()
        .describe("Most recent entries to return (default 200)"),
      since: z
        .string()
        .optional()
        .describe("ISO timestamp; return only entries newer than this"),
    },
    readOnly: true,
    openWorld: false,
  },
  {
    name: "list_jobs",
    title: "List Dispatch jobs",
    description:
      "Where are we: every Dispatch job with title, canonical id, live activity, and a result, verification outcome, or error when a teammate finishes. Speak only the tool message — titles, what they are doing, and what changed, not worktree paths or job-<hex> ids. A finished job that produced work reports as ready for your review. Where the work sits depends on placement: a checkout job left its edits uncommitted in the user's own tree, so offer job_control commit or let them commit; a worktree job holds them on its own branch, so name the branch and commit and ask whether to merge, leave, or drop it. Either way nothing was merged into the user's branch for them — do not describe a checkout job as living on a branch. A job reporting no activity for N minutes is stalled; call job_logs to see why. Report a failed check as a failure, and say so plainly when a job produced no reviewable change. Also prunes worktrees whose job is gone, keeping any that still hold unmerged commits. Call when the user asks where we are, what's running, how a job is going, or whether a teammate finished. Mention the jobs dashboard URL from the message so they can watch live.",
    inputSchema: {},
    readOnly: true,
    openWorld: false,
  },
  {
    name: "job_control",
    title: "Control a Dispatch job",
    description:
      "Pause, resume, cancel, add context to, or commit a Dispatch job. commit is only for checkout jobs that finished with uncommitted edits — it stages exactly the job's files on the user's current branch, never anything else. Speak only the tool message, using the job title and canonical id. jobId may be a ticket, a slug like audit-issues, or the title.",
    inputSchema: {
      jobId: z
        .string()
        .describe("Canonical job id (ticket or slug) or the job title"),
      action: z
        .enum(["pause", "resume", "cancel", "attach_context", "commit"])
        .describe(
          "pause, resume, cancel, attach_context, or commit (checkout jobs only)",
        ),
      context: z
        .string()
        .optional()
        .describe("Extra brief text for attach_context or resume"),
    },
    readOnly: false,
    openWorld: false,
  },
  {
    name: "remember",
    title: "Remember for next jobs",
    description:
      "Save, list, or forget scoped memories that Dispatch injects into the next start_job prompt. Scope is job, repo, or user. Does not auto-save code-changing rules; those need confirm=true. Call when the user says remember this, forget that, or list memories.",
    inputSchema: {
      action: z
        .enum(["add", "list", "forget"])
        .optional()
        .describe("add (default), list, or forget"),
      text: z
        .string()
        .optional()
        .describe("Memory text for add, or search text for forget"),
      id: z.string().optional().describe("Memory id to forget"),
      scope: z
        .enum(["job", "repo", "user"])
        .optional()
        .describe("Memory scope, default repo"),
      jobId: z.string().optional().describe("Required when scope is job"),
      confirm: z
        .boolean()
        .optional()
        .describe("Required when the text looks like a code-changing rule"),
    },
    readOnly: false,
    openWorld: false,
  },
  {
    name: "integrations",
    title: "Connect Dispatch drivers",
    description:
      "Catalogue what Dispatch can connect, start OAuth for GitHub (user), Linear, Jira, Slack (mentions + tracked channels), Notion, or Google Calendar, or disconnect a driver. No connector is on by default. Connect uses Prism Auth (auth.prismhq.in). Cursor shows a native Authenticate control and a short step list; Claude opens the auth page. Never ask the user to create an OAuth app or paste a client id. Aliases like “google calendar” map to google-calendar. Google’s “hasn’t verified this app” warning is expected until Prism Auth finishes Calendar scope verification — tell the user to click Advanced, then continue. Tokens go in the OS keychain. Workers cannot start OAuth. Call when the user asks what we can connect or says connect Slack (or another driver).",
    inputSchema: {
      action: z
        .enum(["catalog", "start", "connect", "disconnect", "status", "setup"])
        .optional()
        .describe("catalog/status, setup, start/connect, or disconnect"),
      driver: z
        .string()
        .optional()
        .describe(
          "Driver to connect or disconnect. Canonical ids: github, linear, jira, slack, notion, google-calendar. Phrases like “google calendar” work.",
        ),
    },
    readOnly: false,
    openWorld: true,
  },
  {
    name: "configure",
    title: "Configure Dispatch",
    description:
      'Read or update gitignored Dispatch settings: section order, standup template, Slack tracked channel ids, mention window and caps, max parallel jobs (default 4, admitted on free memory), in-process subagents, host fan-out, post-job verification, worker backend (auto = match this host, cursor, or claude), placement (checkout = your tree uncommitted, worktree = separate branch + commit), dispatchMode (ask = offer teammate-or-inline in one line before changing code, the default; auto = dispatch without asking; inline = only dispatch when the user asks for a job), hint policy, and whether the tickets slot is Linear or Jira. Any other wish works too: pass preference="…" to add a standing preference (applied to standup presentation), removePreference="…" to drop one; an unknown setting key is kept as a preference and said so, never silently dropped. Job-behavior rules belong to remember, not configure. action=export returns a non-secret template (no tokens) for sharing. Chat only — there is no settings UI in v1.',
    inputSchema: {
      action: z
        .enum(["get", "set", "export"])
        .optional()
        .describe("get (default), set, or export"),
      maxJobs: z.number().int().optional(),
      subagents: z
        .boolean()
        .optional()
        .describe("In-process subagents inside one teammate (default on)"),
      fanout: z
        .boolean()
        .optional()
        .describe("Split one brief into sibling jobs (default off; heavy)"),
      verifyJobs: z
        .boolean()
        .optional()
        .describe("Run typecheck and tests after a teammate stops"),
      workerBackend: z
        .enum(["auto", "cursor", "claude"])
        .optional()
        .describe(
          "Which agent runs jobs: auto (match this host), cursor, or claude",
        ),
      placement: z
        .enum(["checkout", "worktree"])
        .optional()
        .describe(
          "Where jobs work: checkout (default — your tree, uncommitted) or worktree (separate branch + commit)",
        ),
      preference: z
        .string()
        .optional()
        .describe(
          "Add a standing free-form preference (e.g. 'standup: terse'). Applied to standup presentation.",
        ),
      removePreference: z
        .string()
        .optional()
        .describe("Drop standing preferences containing this text"),
      hints: z.boolean().optional(),
      ticketHost: z.enum(["linear", "jira"]).optional(),
      standupTemplate: z.string().optional(),
      slackTrackChannelIds: z.array(z.string()).optional(),
      mentionWindowHours: z.number().int().optional(),
      mentionLimit: z.number().int().optional(),
      trackedMessageLimit: z.number().int().optional(),
      sectionsOff: z.array(z.string()).optional(),
      includeMemories: z
        .boolean()
        .optional()
        .describe("When exporting, include opted-in user memories"),
    },
    readOnly: false,
    openWorld: false,
  },
  {
    name: "dispatch_doctor",
    title: "Dispatch doctor",
    description:
      "Check whether Dispatch can run local teammates. Speak only the tool message — never mention API keys, mcp.json, host role, or connector counts. If sign-in is missing, call init. The message also says whether the jobs board is up.",
    inputSchema: {},
    readOnly: true,
    openWorld: false,
  },
];

export const DISPATCH_TOOL_NAMES: readonly string[] = DISPATCH_TOOLS.map(
  (tool) => tool.name,
);

export function createDefaultDispatchRuntime(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  getWorkspaceRoot?: () => string,
  getClientName?: () => string | undefined,
): DispatchRuntime {
  return createDispatchRuntime({
    workspaceRoot,
    env,
    worker: createCursorWorkerPort(),
    claudeWorker: createClaudeWorkerPort(),
    ...(getWorkspaceRoot ? { getWorkspaceRoot } : {}),
    ...(getClientName ? { getClientName } : {}),
  });
}

export function registerDispatchTools(
  server: McpServer,
  workspaceRoot: string,
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly runtime?: DispatchRuntime;
    readonly getWorkspaceRoot?: () => string;
    readonly applyWorkspaceHint?: (path: string) => boolean;
    readonly beforeCall?: () => Promise<void>;
  } = {},
): void {
  const env = options.env ?? process.env;
  const getRoot = options.getWorkspaceRoot ?? (() => workspaceRoot);
  const runtime =
    options.runtime ??
    createDefaultDispatchRuntime(
      workspaceRoot,
      env,
      getRoot,
      () => server.server.getClientVersion()?.name,
    );
  const allowed = new Set(visibleDispatchTools(env));

  if (!isWorkerRole(env) && !options.runtime) {
    startJobNoticeWatcher(getRoot, (notice) => {
      void server.sendLoggingMessage({
        level: notice.level,
        logger: "prism.dispatch",
        data: notice.text,
      });
    });
    void ensureHub({ workspaceRoot: getRoot(), env }).catch(() => {
      /* hub spawn is best-effort */
    });
  }

  for (const tool of DISPATCH_TOOLS) {
    if (!allowed.has(tool.name)) continue;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly,
          openWorldHint: tool.openWorld,
        },
        // MCP Apps bind the tool to ui://prism/jobs (protocol field `_meta`).
        ...(tool.name === "list_jobs"
          ? ({
              _meta: { ui: { resourceUri: JOBS_APP_URI } },
            } as { _meta: { ui: { resourceUri: string } } })
          : {}),
      },
      async (args: unknown, extra) => {
        try {
          await options.beforeCall?.();
          const record = (args ?? {}) as Record<string, unknown>;
          if (typeof record.workspace === "string") {
            options.applyWorkspaceHint?.(record.workspace);
          }
          const value = await runtime.handle(tool.name, record, {
            oauthUi: createMcpOAuthUi(server, extra),
            signal: extra.signal,
          });
          const decorated = await decorateDispatchValue(
            tool.name,
            value,
            getRoot,
            env,
          );
          const result: {
            content: { type: "text"; text: string }[];
            structuredContent?: Record<string, unknown>;
          } = {
            content: [{ type: "text", text: serialiseForMcp(decorated) }],
          };
          if (tool.name === "list_jobs") {
            if (decorated && typeof decorated === "object") {
              result.structuredContent = decorated as Record<string, unknown>;
            }
            // MCP Apps protocol field on CallToolResult.
            return Object.assign(result, {
              _meta: { ui: { resourceUri: JOBS_APP_URI } },
            });
          }
          return result;
        } catch (cause) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          if (isMissingGitRepoMessage(detail)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: serialiseForMcp({ message: gitFailureSpeak(detail) }),
                },
              ],
            };
          }
          throw toMcpErrorFromThrown(cause);
        }
      },
    );
  }
}

async function decorateDispatchValue(
  name: DispatchToolName,
  value: unknown,
  getRoot: () => string,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  if (
    name !== "list_jobs" &&
    name !== "dispatch_doctor" &&
    name !== "start_job"
  )
    return value;
  const hub: HubHandle =
    name === "list_jobs" || name === "start_job"
      ? await ensureHub({ workspaceRoot: getRoot(), env }).catch(() => ({
          enabled: false,
          detail: "Jobs board did not start.",
        }))
      : await peekHub(env);
  if (!value || typeof value !== "object") return value;
  const record = value as { message?: string; [key: string]: unknown };
  if (typeof record.message !== "string") return value;
  const board = hub.dashboardUrl ?? hub.url;
  // P-P8: the dispatch moment names the watch surface, not just list_jobs.
  if ((name === "list_jobs" || name === "start_job") && board) {
    return {
      ...record,
      dashboardUrl: board,
      message: `${record.message}\nWatch live at ${board}`,
    };
  }
  if (name === "dispatch_doctor") {
    return {
      ...record,
      message: `${record.message} ${hub.detail}${board ? ` ${board}` : ""}`,
    };
  }
  return value;
}
