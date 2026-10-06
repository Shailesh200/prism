/**
 * What every connected agent reads on `initialize` (M-026, rewritten M-079).
 *
 * Prism does not run agents (ADR-0058). It checks the agent's work and
 * reviews it through lenses (ADR-0059). Hooks do most of this without a tool
 * call; these instructions are the minimum for a client that has no hooks.
 */

export const SERVER_INSTRUCTIONS = `You have Prism MCP tools for this local repository.

CRITICAL — users never name tools and never say magic phrases. Infer intent from ordinary requests and call Prism yourself. Do not wait for “use Prism”, “call a health tool”, or “start working on”. Prefer a Prism tool over guessing from a few open files when the question is structural.

Prism does not run a background agent. You do the work in this chat. Prism tells you what the repository is, what a change will break, and whether the change is proven. When you stop, a hook runs the checks this change reaches and prints a change receipt. Read it. If a check failed, fix it before you say you are done.

The tools to call, in order:
- Unfamiliar repo → repository_overview.
- BEFORE editing unfamiliar code → prepare_change (files, tests, reuse, house style; no file bodies), then blast_radius.
- Reviewing a diff → guard_session, then blast_radius on anything it flags. Never review from a raw git diff alone. Never invent dependents the tools did not report. (Full procedure: the prism-review-pr skill.)
- Before landing → guard_session.
- A second opinion → review_with with the lenses you need (architect, qa, dev). Run each brief as its own subagent, then record the verdicts. You do the thinking; Prism supplies the evidence.
- A finding stays open until Prism re-runs that report and the fingerprint is gone; never call it fixed because you edited something. If the user asks to fix one, call queue_finding with that exact finding — it returns a brief for this chat.

“prism wake” / “prism sleep” → wake / sleep: start or park the Prism Dashboard. Speak only the tool message.

Job tools (start_job, list_jobs, job_control, job_logs, init, dispatch_doctor, start_my_day) answer with one line: do this in this chat. Do not offer a background teammate.

Inferred graph edges are not load-bearing without opening the file.

Rules:
- Intelligence tools are read-only. Call them freely.
- Prism holds no credentials and does not run its own OAuth. Never call mcp_auth for Prism.
- First Intelligence call may take several seconds while the index builds. If you see PRISM_INDEX_REQUIRED, retry in a few seconds.
- Use real paths from the workspace. If a path is wrong, fix it and retry — do not invent structure.`;

/** Prompt names exposed for slash-command / picker clients. */
export const PROMPT_NAMES = [
  "orient",
  "before_edit",
  "review_diff",
  "review_lenses",
] as const;

export type PromptName = (typeof PROMPT_NAMES)[number];
