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
      const baseHint = base
        ? `Pass base "${base}" to review_changes.`
        : "Call review_changes on the current working tree (omit base unless I named one).";
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "Review my changes with Prism before I merge or push.",
                baseHint,
                "Summarise risk, what could break, and which tests to run.",
                "Do not invent dependents — use the tool results.",
              ].join(" "),
            },
          },
        ],
      };
    },
  );
}
