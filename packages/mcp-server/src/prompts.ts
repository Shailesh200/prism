/**
 * MCP prompts — optional slash-command entry points (GA UX).
 *
 * Most users never open these. Server `instructions` make agents call tools
 * from ordinary chat. Prompts exist for clients that surface a prompt picker
 * (Claude Desktop, some Cursor builds) so a human can trigger a workflow by
 * name without typing tool identifiers.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Register the small set of workflow prompts. Keep names short and stable —
 * clients may bookmark them.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "orient",
    {
      title: "Orient to this repository",
      description:
        "Learn what this repo is, how healthy it is, and where to start — without naming tools.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Orient me to this repository using Prism.",
              "Call repository_dna, repository_health, and landmarks (or repository_overview).",
              "Summarise in plain language: what it is, overall health, and the best places to start reading.",
              "Do not ask me to name tools.",
            ].join(" "),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "before_edit",
    {
      title: "Check before editing a file",
      description: "Blast radius and tests for a path before you change it.",
      argsSchema: {
        path: z
          .string()
          .describe("Workspace-relative file path about to be edited"),
      },
    },
    async (args) => {
      const path = args.path.trim() || "src/index.ts";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `I am about to edit \`${path}\`.`,
                "Using Prism, call blast_radius and test_impact for that path.",
                "Report what depends on it, the risk band, and which tests cover it.",
                "Then wait for my go-ahead before changing code.",
              ].join(" "),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "review_diff",
    {
      title: "Review current changes",
      description:
        "Roll up blast radius / safe-delete / test impact for the working tree or a base ref.",
      argsSchema: {
        base: z
          .string()
          .optional()
          .describe(
            "Optional git base ref (e.g. origin/main). Omit to use the working tree.",
          ),
      },
    },
    async (args) => {
      const base = typeof args.base === "string" ? args.base.trim() : "";
      const flow = base
        ? `Call review_changes with base "${base}" and omit paths so Prism auto-discovers the diff against that ref (or call changed_paths with the same base first if you need the path list alone).`
        : "Call review_changes with no paths so Prism auto-discovers the working-tree changes (or call changed_paths first if you need the path list alone).";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "Review my changes with Prism before I merge or push.",
                flow,
                "Summarise risk, what could break, and which tests to run.",
                "Do not invent dependents — use the tool results.",
              ].join(" "),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "start_my_day",
    {
      title: "Start my day",
      description:
        "Standup briefing: leftover jobs, git, connected tools, then connect CTAs.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Start my day with Prism Dispatch.",
              "Call start_my_day as the first tool and speak that briefing as written.",
              "Keep the greeting, Yesterday, and Waiting on you sections — including empty Linear/GitHub/Slack lists.",
              "Do not search the repo or fetch Calendar yourself.",
              "Name the connect CTAs for tools that are not connected.",
              "Do not ask me to name tools.",
            ].join(" "),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "start_work",
    {
      title: "Start working on a ticket",
      description: "Create a Dispatch job from a title/ticket and PRD.",
      argsSchema: {
        title: z.string().describe("Ticket id and/or short title"),
        prd: z.string().optional().describe("Product brief"),
      },
    },
    async (args) => {
      const title = args.title.trim() || "the ticket";
      const prd = typeof args.prd === "string" ? args.prd.trim() : "";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Start working on ${title}.`,
                prd
                  ? `PRD: ${prd}`
                  : "Ask me for a PRD if you do not have one.",
                "Call start_job with the title and PRD.",
                "If a Cursor login page opens, finish it. If Authenticating prism with Skip appears, click Skip and retry.",
                "Read back the tool message. Use the job title and canonical id, never a job-hex id or worktree path.",
                "Tell them to say where are we for live status and the result when the teammate finishes.",
              ].join(" "),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "where_are_we",
    {
      title: "Where are we",
      description: "List Dispatch jobs by title and status.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Where are we on Dispatch jobs?",
              "Call list_jobs and speak the tool message: live activity, finished results, and errors. Do not list worktree paths or job-hex ids.",
            ].join(" "),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "connect",
    {
      title: "What can we connect",
      description: "Catalogue Dispatch drivers or start OAuth for one of them.",
      argsSchema: {
        driver: z
          .string()
          .optional()
          .describe(
            "Optional driver: github, linear, jira, slack, notion, google-calendar (or “google calendar”)",
          ),
      },
    },
    async (args) => {
      const driver = typeof args.driver === "string" ? args.driver.trim() : "";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: driver
                ? `Connect ${driver} in Prism Dispatch. Call the integrations tool immediately with action start and that driver (use google-calendar for Calendar). Do not search the repo. In Cursor I will click the native Authenticate button, which opens the vendor login. In Claude the Prism Auth page opens. If integrations is not found, tell me to reload the prism MCP server. Do not ask me for a client id or secret.`
                : "What can we connect in Prism Dispatch? Call integrations with action catalog, then tell me the named CTAs. Do not ask me for OAuth client ids.",
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "configure",
    {
      title: "Configure Dispatch",
      description:
        "Read or change standup layout, Slack channels, and job cap.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Configure Prism Dispatch.",
              "Call configure to read the current settings, then apply what I asked for (section order, Slack track list, max jobs, Linear vs Jira, hints).",
            ].join(" "),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "init",
    {
      title: "Set up Dispatch workers",
      description:
        "One-time Cursor sign-in so Prism can spawn local job workers.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Set up Prism Dispatch workers.",
              "Call init immediately.",
              "A Cursor login page should open in the browser. Finish that page.",
              "If Cursor shows Authenticating prism with Skip, click Skip and retry.",
            ].join(" "),
          },
        },
      ],
    }),
  );
}
