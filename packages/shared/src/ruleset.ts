/**
 * The always-on Prism ruleset (plan P16): one short, stable text that tells
 * an agent when to call which tool, once per session: the MCP server
 * instructions embed it, and the session hook adds it only on hosts that do
 * not show those (token fix 3). No prompt-time path repeats it. It holds no repository data, timestamps or ids, so a
 * host's prompt cache can reuse it across sessions.
 *
 * `packages/plugin/hooks/prism-rules.md` is a byte-identical copy for the
 * dependency-free hook; `ruleset.contract.test.ts` holds them together.
 *
 * Round 4: the "use the block" clause went (it was always on, block or not;
 * the block now says what it is), the test_impact reminder moved to the
 * after-edit hook, and the last line gives Claude Code's tool ids.
 */

export const PRISM_RULESET = `Prism rules (whole session):
- Before editing code you have not read: call prepare_change with the task.
- Before deleting, renaming or changing an export: blast_radius. Do not invent dependents it did not report.
- Where is X, what uses it: graph. New repository: repository_overview.
- Before finishing or to review: guard_session.
- Any change to how code behaves, small or big, uses Prism. Skip it only for questions, typos and comments.
- prepare_change "prism": start your reply with it. Its "finish": do it before saying done.
- In Claude Code these tools are mcp__prism__<name>, e.g. mcp__prism__prepare_change.`;

/** Plan P16 RULE-1: the ruleset stays at or under this many tokens. */
export const PRISM_RULESET_MAX_TOKENS = 300;
