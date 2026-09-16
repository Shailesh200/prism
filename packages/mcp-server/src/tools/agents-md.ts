import { z } from "zod";
import { defineTool } from "../tool-registry.js";

export const agentsMd = defineTool({
  name: "agents_md",
  title: "Living AGENTS.md",
  description:
    "Generate or verify the Living AGENTS.md: features, import cycles, test locations, and git ownership, composed straight from the index — no LLM prose. `generate` writes it to `~/.prism/workspaces/<key>/agents.md`, never into this repo, so it never needs its own commit. `check` re-verifies the claims it made against a fresh index and reports drift. Read `prism://agents-md` for the current content without regenerating.",
  inputSchema: {
    action: z
      .enum(["generate", "check"])
      .describe(
        "generate writes a fresh AGENTS.md; check verifies the last one against the live index",
      ),
  },
  async call({ workspace }, args) {
    return args.action === "generate"
      ? await workspace.generateAgentsMd()
      : await workspace.checkAgentsMd();
  },
});
