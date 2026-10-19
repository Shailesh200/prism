/**
 * What every connected agent reads on `initialize` (M-026, cut to the hero
 * loop in M-091). Hooks do most of the work without a tool call; this is the
 * minimum for a client that has none. `instructions.test.ts` caps the size.
 */

import { PRISM_RULESET } from "@repo-prism/shared";

/**
 * The shared ruleset (plan P16) sits between a fixed intro and fixed
 * server-only lines, so the whole text is stable and cache-friendly.
 */
export const SERVER_INSTRUCTIONS = `Prism maps this repository locally. Users never name these tools; call them when the request fits.

${PRISM_RULESET}
- The verdict on your change: SHIP, NOT PROVEN (with the cheapest proof) or NO-SHIP. Fix a NO-SHIP you caused.
- Inferred edges are hints. On PRISM_INDEX_REQUIRED, retry shortly. Never call mcp_auth for Prism.`;

/** Prompt names exposed for slash-command / picker clients. */
export const PROMPT_NAMES = ["orient", "before_edit", "review_diff"] as const;

export type PromptName = (typeof PROMPT_NAMES)[number];
