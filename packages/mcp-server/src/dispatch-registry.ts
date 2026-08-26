/**
 * Dispatch tools are a second registration path on the same `prism` MCP server.
 *
 * They write `.prism/dispatch/*`, run OAuth, and spawn local Cursor agents.
 * They must not go through `registerTools` — that wrapper opens the workspace
 * and indexes, which start-my-day does not need (ADR-0035).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createCursorWorkerPort,
  createDispatchRuntime,
  visibleDispatchTools,
  type DispatchRuntime,
  type DispatchToolName,
} from "@repo-prism/dispatch";
import type { ZodRawShape } from "zod";
import { z } from "zod";
import { toMcpErrorFromThrown } from "./errors.js";
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
      "Standup briefing for this repository: leftover Dispatch jobs, local git, then any connected drivers (GitHub reviews, Linear or Jira tickets, Slack mentions plus tracked channels, Notion, Google Calendar). Unconnected tools appear as named connect CTAs. Does not index the repo. Call this when the user says start my day, standup, or what's waiting on me.",
    inputSchema: {},
    readOnly: true,
    openWorld: true,
  },
  {
    name: "start_job",
    title: "Start a Dispatch job",
    description:
      "Create a Dispatch job from a ticket or title plus PRD. Adopts an existing Cursor or Claude git worktree when one matches the ticket; otherwise creates `.prism/dispatch/worktrees/<id>`. Starts a local Cursor SDK agent in that tree with Prism MCP in worker role, and returns the job id immediately without waiting for the agent to finish. Requires CURSOR_API_KEY to actually spawn the worker.",
    inputSchema: {
      title: z.string().describe("Ticket id and/or short job title"),
      prd: z
        .string()
        .optional()
        .describe("Product brief / acceptance criteria"),
      jobId: z
        .string()
        .optional()
        .describe("Stable job id; inferred from a ticket token when omitted"),
      branch: z
        .string()
        .optional()
        .describe("Preferred branch when creating a worktree"),
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
    name: "list_jobs",
    title: "List Dispatch jobs",
    description:
      "Where are we: every Dispatch job with status, worktree path, source (cursor / claude / prism), git status in that tree, and last known Cursor agent status. Call when the user asks where we are, what's running, or to list jobs.",
    inputSchema: {},
    readOnly: true,
    openWorld: false,
  },
  {
    name: "job_control",
    title: "Control a Dispatch job",
    description:
      "Pause, resume, cancel, or attach extra context to a running Dispatch job. Pause and cancel map to the Cursor SDK run.cancel() when the run supports it. Resume uses Agent.resume after an MCP restart. attach_context sends more text to the existing local agent.",
    inputSchema: {
      jobId: z.string().describe("Job id from start_job / list_jobs"),
      action: z
        .enum(["pause", "resume", "cancel", "attach_context"])
        .describe("pause, resume, cancel, or attach_context"),
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
      "Catalogue what Dispatch can connect, start OAuth for GitHub (user), Linear, Jira, Slack (mentions + tracked channels), Notion, or Google Calendar, or disconnect a driver. No connector is on by default. Connect uses Prism Auth (auth.prismhq.in). Cursor shows a native Authenticate control and a short step list; Claude opens the auth page. Never ask the user to create an OAuth app or paste a client id. Aliases like “google calendar” map to google-calendar. Tokens go in the OS keychain. Workers cannot start OAuth. Call when the user asks what we can connect or says connect Slack (or another driver).",
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
      "Read or update gitignored Dispatch settings: section order, standup template, Slack tracked channel ids, mention window and caps, max parallel jobs (default 5), hint policy, and whether the tickets slot is Linear or Jira. action=export returns a non-secret template (no tokens) for sharing. Chat only — there is no settings UI in v1.",
    inputSchema: {
      action: z
        .enum(["get", "set", "export"])
        .optional()
        .describe("get (default), set, or export"),
      maxJobs: z.number().int().optional(),
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
      "Check whether Dispatch can run local Cursor workers: CURSOR_API_KEY, @cursor/sdk import, host vs worker role, and active job count versus the configured cap. Use when start_job is blocked or the user asks if Dispatch is set up.",
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
): DispatchRuntime {
  return createDispatchRuntime({
    workspaceRoot,
    env,
    worker: createCursorWorkerPort(),
  });
}

export function registerDispatchTools(
  server: McpServer,
  workspaceRoot: string,
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly runtime?: DispatchRuntime;
  } = {},
): void {
  const env = options.env ?? process.env;
  const runtime =
    options.runtime ?? createDefaultDispatchRuntime(workspaceRoot, env);
  const allowed = new Set(visibleDispatchTools(env));

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
      },
      async (args: unknown, extra) => {
        try {
          const value = await runtime.handle(
            tool.name,
            (args ?? {}) as Record<string, unknown>,
            {
              oauthUi: createMcpOAuthUi(server, extra),
              signal: extra.signal,
            },
          );
          return {
            content: [{ type: "text" as const, text: serialiseForMcp(value) }],
          };
        } catch (cause) {
          throw toMcpErrorFromThrown(cause);
        }
      },
    );
  }
}
