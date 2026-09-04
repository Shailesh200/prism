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
                // A review that only reads the patch is the failure mode here:
                // it sees what changed and misses what depends on it.
                "Do not review by reading the raw diff alone — review_changes carries blast radius, test impact, and breaking-change hints per path, so lead with what it reports.",
                "If more than a couple of files changed, also call repository_dna (or stack_profile) and judge the change against this repo's real conventions and frameworks, not generic style. Call blast_radius on anything the roll-up flags as risky.",
                "Summarise risk, what could break, and which tests to run.",
                "Separate what Prism reported from your own reading of the code, and do not invent dependents — use the tool results.",
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
        "Standup briefing: the local spine from Prism, the rest from your own connectors.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            // Prism supplies git, jobs and memories, then names the sections
            // you should fill (ADR-0049). It used to say "do not fetch
            // Calendar yourself", which is now exactly backwards: Prism holds
            // no credentials, and you do.
            text: [
              "Start my day with Prism Dispatch.",
              "Call start_my_day as the first tool and speak that briefing as written.",
              "Keep the greeting, Yesterday, and Waiting on you sections.",
              "Then read its fill contract: for each section it lists, call the connector tools you already have and add that section under Waiting on you.",
              "If a section has no connector, say so once in a short line rather than dropping the heading.",
              "Do not search the repo yourself, and do not ask me to name tools.",
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
        // Optional on purpose. Claude Code sends required prompt args as empty
        // strings and splits multi-word values on whitespace, so demanding a
        // title here turns a working slash command into a validation error.
        title: z
          .string()
          .optional()
          .describe("Ticket id and/or short title (optional)"),
        prd: z.string().optional().describe("Product brief"),
      },
    },
    async (args) => {
      const title = (typeof args.title === "string" ? args.title : "").trim();
      const prd = typeof args.prd === "string" ? args.prd.trim() : "";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                title
                  ? `Start working on ${title}.`
                  : "Start working on what I just described in this conversation. Derive the title and brief from it yourself — do not ask me to repeat it.",
                prd
                  ? `PRD: ${prd}`
                  : "Ask me for a PRD only if the brief is too thin to act on.",
                // Invoking this prompt IS the dispatch instruction. An earlier
                // build read it as advice, investigated with grep, and solved
                // the request in chat — the one outcome it must never produce.
                "start_job is the first tool you call for this. Do not grep, read files, or fix anything yourself first, and do not decide the task is too small or too read-only to dispatch — I asked for a teammate, so start one.",
                "Say in one line what you are starting and what it will touch, then call start_job with the title and PRD.",
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
      title: "What is connected",
      description:
        "List the connectors this agent window already has, and what Prism can do with them.",
      argsSchema: {
        driver: z
          .string()
          .optional()
          .describe("Optional connector to ask about, e.g. slack or linear"),
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
              // Prism no longer runs OAuth (ADR-0049). Connecting a service is
              // something the user does in their editor's own plugin settings;
              // Prism's job is to notice what is there and compose with it.
              text: driver
                ? `Do I have ${driver} connected in this agent window, and what can Prism do with it? Call dispatch_doctor and read its host_connectors check. If ${driver} is missing, tell me to install it from my editor's plugin or MCP settings — Prism does not run its own OAuth and will not ask me for a client id.`
                : "What is connected in this agent window? Call dispatch_doctor and read its host_connectors check. List what is there, and say which Prism workflows each one unlocks — for example a ticket tracker lets start_my_day fill its Tickets section, and a GitHub connector lets a PR review post its findings. Do not search the repo.",
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
