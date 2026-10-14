/**
 * What every connected agent reads on `initialize` (M-026, cut to the hero
 * loop in M-091). Hooks do most of the work without a tool call; this is the
 * minimum for a client that has none. `instructions.test.ts` caps the size.
 */

export const SERVER_INSTRUCTIONS = `Prism maps this repository locally and checks your changes. It never edits code and calls no model. Users never name these tools; call them when the request fits.

- Before editing code you have not read in this session, call prepare_change with the task, unless a "Prism · prepare" block is already in context. It returns the files to open, helpers that already exist, house style and off-limits paths.
- Before deleting, renaming or changing an export, call blast_radius on it. Do not invent dependents it did not report.
- Structural questions (where is X, what uses it, how A reaches B, what a folder is for): graph. Unfamiliar repository: repository_overview.
- Which tests to run: test_impact. Before you finish or review a diff: guard_session.
- When you stop, a hook prints a verdict on your change: proven, not proven (with the reason) or failed. If it failed because of your change, fix it before you say you are done.
- Inferred edges are hints; open the file before relying on one.
- Tools are read-only. If you see PRISM_INDEX_REQUIRED, retry in a few seconds. Use real workspace paths.
- Prism holds no credentials. Never call mcp_auth for Prism.`;

/** Prompt names exposed for slash-command / picker clients. */
export const PROMPT_NAMES = ["orient", "before_edit", "review_diff"] as const;

export type PromptName = (typeof PROMPT_NAMES)[number];
