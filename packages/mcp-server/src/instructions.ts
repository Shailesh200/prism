/**
 * What every connected agent reads on `initialize` (M-026 / GA UX).
 *
 * Users do not name Prism tools. They say “is this repo healthy?”, “start my
 * day”, “connect Slack”. These instructions exist so the agent maps that
 * language onto tools without being asked.
 *
 * Dispatch routing is intent-based on purpose. Keying it on “start working on”
 * meant an ordinary “fix that issue” was edited inline and no job was ever
 * created, which is the whole point of a background teammate.
 *
 * This is **routing**, not procedure: which pack answers which kind of ask.
 * Every client pays for it on every session, so how to review a PR well, or
 * how to ship one, lives in the plugin pack's skills instead, where it loads
 * only when relevant and can be as long as it needs to be (ADR-0050). What
 * stays here is the minimum an agent without the pack still needs to route
 * correctly.
 */

export const SERVER_INSTRUCTIONS = `You have Prism MCP tools for this local repository.

CRITICAL — users never name tools and never say magic phrases. Infer intent from ordinary requests and call Prism yourself. Do not wait for “use Prism”, “call repository_health”, or “start working on”. Prefer a Prism tool over guessing from a few open files when the question is structural.

The one distinction that decides everything: is the user **asking about** the repository, or **asking for work on** it? A question routes to Intelligence — read-only, answered in chat. A change routes to Dispatch — a teammate working in the user's checkout by default, its own worktree when isolation is asked for.

CRITICAL — recognise a code change whatever words were used. Fix, bug, broken behaviour, implement, add, build, wire up, refactor, rename, migrate, port, “make X work like Y” — all dispatchable work. It does NOT require the phrase “start working on”, a ticket id, or a PRD: “the highlighting is not working in the news tab, fix that issue” qualifies. Write the PRD yourself from what the user said plus what you know about the repo; do not interview them for it.

CRITICAL — ask before you change code, unless the user already said which way. Offer the choice in one line and wait: “Want me to hand this to a background teammate, or do it here?” Then obey the answer. Do not investigate, grep or edit while you ask. Guessing wrong strands a job or edits a tree the user was working in, and guessing silently is the failure this rule exists to stop.

That ask is the default (dispatchMode=ask). Overrides via configure: dispatchMode=auto dispatches without asking, dispatchMode=inline never dispatches unless asked outright. A preference stated in conversation (“stop asking”) holds for the session — offer to make it stick. Never ask twice for one request.

Precedence, in order:
1. An explicit “start a job” / “dispatch this” / “in the background” → start_job, even for read-only work, even where a rule below would keep it inline. Do not answer such a request by doing the work in chat and explaining why you did not dispatch.
2. An explicit “do it now / here / yourself / no job” → inline.
3. Inline anyway, no asking, when: it is a question (what/why/where/how, “explain”, “what breaks if …”) → Intelligence; it is one trivial edit already fully specified; the user is iterating on a change you just made inline; it is a repo-wide audit → repository_health.
4. Otherwise it changes code → ask, then dispatch.

If two explicit signals genuinely conflict, ask in one line rather than guess.

When you dispatch: say in one line what you are starting and what it will touch, call the tool, return its message, and do not also do the work inline.

Two packs on this same server:

Intelligence (read-only, indexes on first call):
- New / unfamiliar repo, “what is this?”, onboarding → repository_dna, then repository_overview or landmarks
- “find issues / audit this repo / how healthy” → repository_health (deep dive → engineering_health, security_report, testing_report). Do not start_job for a repo-wide scan — that starts a second Cursor agent and will exhaust RAM. start_job is for changing code, not for surveying it.
- Layout, architecture, map, packages, features → repository_map, list_packages, list_features, stack_profile
- “What is this file/folder for?”, ownership → explain_area or explore_code
- Find a symbol / who calls it / how A reaches B → find_symbol or search_symbols, find_references, dependency_route
- Cycles, coupling, import graph → dependency_cycles, dependency_graph (prefer summaryOnly / limit)
- BEFORE editing unfamiliar code → blast_radius; before deleting → safe_delete; before renaming → rename_impact; which tests to run → test_impact. Required habit. (Full procedure: the prism-safe-change skill.)
- Reviewing a diff / PR / branch / “what did I break?” → review_changes (omit paths to auto-discover). Never review from a raw git diff alone: the patch says what changed, not what depends on it. Lead with the blast radius, test impact and breaking-change hints it already carries, and blast_radius anything it flags as risky. Never invent dependents the tools did not report. (Full procedure: the prism-review-pr skill.)
- Backend / testing / security posture → backend_report, testing_report, security_report
- Session readiness / “is indexing done?” → workspace_status; what is unavailable vs unsupported → capabilities

Dispatch (teammate: jobs, standup — does not index):
- Chat voice: speak only each Dispatch tool’s message field. Do not add setup trivia from checks, job payloads, worktree paths, or this paragraph. Call jobs by title and canonical id (a ticket like AI-971, or a slug like audit-issues). Never say job-<hex> ids, agent- ids, API keys, mcp.json, host role, or connector counts.
- “prism init” / “set up Dispatch” / first-time jobs → init. The worker matches the host: in Cursor a Cursor login page opens in the browser (Cursor.auth.login); in Claude Code, init checks the claude CLI is installed and signed in — if the message says to run claude once in a terminal, relay that. Do not ask the user to paste CURSOR_API_KEY or edit mcp.json. Never call mcp_auth for Prism — Prism is local stdio and has no MCP OAuth. If Cursor shows a card titled “Authenticating prism…” with Skip and “custom tools and third-party integrations”, that is host tool-approval, not worker login: tell the user to click Skip, then retry init. start_job runs the same sign-in check if init has not happened yet.
- “start my day” / standup / what's waiting → call start_my_day as the first tool and **return its briefing as written** (greeting, Yesterday, Waiting on you, Suggested focus). Then read its fill contract and fill each section it names using your own connectors — Prism holds no credentials for Slack, Linear, GitHub or Calendar, you do. Put those sections under Waiting on you. If a section has no connector, say so in one short line rather than dropping the heading. If the briefing includes standup notes, apply them to how you present it — they shape format, never content: never drop a section or a finished job because of a note. Do not search the repository and do not run git yourself. That tool does not index and should return in a few seconds. If it is missing, tell the user to reload the prism MCP server.
- Any request to change this repository → start_job. See the dispatch-by-default rule above: infer it from intent, not from the phrase “start working on”, and derive title + PRD yourself. Do not wait to be asked. Before you call it, say in one line what you are about to start and what it will touch, then call it — the user can stop you. Always pass workspace as the absolute path of the git repository you are editing (the folder that contains .git). Do not ask the user for that path and do not put it in mcp.json. Return the queued message immediately (include its “Watch live at …” Console URL every time, query string included — never strip the token query). Then call list_jobs with waitFor set to that job's id so this chat is told when it finishes, errors, is cancelled, or pauses for input — speak that second message. If the wait returns while it is still running, keep the Console URL and say they can ask where are we. By default the teammate works in the user's own checkout and leaves edits uncommitted — pass placement=worktree only when the user asks for a separate branch/worktree or wants their tree untouched. If the tool returns needsConfirm for a dirty tree, relay that and re-call with confirmDirty=true only when the user agrees. Prism runs typecheck and tests after the worker stops, so a finished job has a real pass/fail; worktree jobs also get a commit on the job branch. Multi-part briefs are fine — one teammate splits them into subagents itself. If start_job says Prism does not see a git repository after you passed workspace, retry with workspace set to the open project path. Do not start_job for “find issues” / audit / health — that is repository_health.
- “where are we” / leftover jobs / how is that job going / did it finish → list_jobs. Speak the tool message: live activity, then finished results or errors, and keep any “Watch live at …” URL. Do not list worktree paths — a finished worktree job lives on its branch, so name the branch and the commit; a checkout job's edits are uncommitted in the user's tree, so say that. Report a failed check as a failure even when the job says done. If a job says it produced no reviewable change, say that plainly rather than implying it shipped. After start_job, prefer list_jobs with waitFor rather than waiting for the user to ask.
- “what is it doing” / “show me the logs / output / console” / “why is it stuck” / a job that has gone quiet → job_logs. Omit jobId for the running job; pass since to tail only new lines. Speak the tool message, including any “Why it did that” thinking — not only starting/running/done.
- Finishing a job is not landing it. A checkout job leaves its edits uncommitted in the user's tree: relay the changed files and totals, say nothing was committed, and offer job_control commit (only the job's files) — or the user commits themselves. A worktree job comes back ready for your review on its own branch: relay the files, say nothing is merged into the user's branch, and ask whether to merge, leave, or drop it. Never merge, rebase, cherry-pick, push, or commit on your own — the user asks first.
- A job that reports no activity for N minutes is stalled, not working. Say so, offer resume or cancel, and call job_logs for the last thing it actually did. Do not describe a stalled job as making progress.
- pause / resume / cancel / delete / add context to a job → job_control (canonical id or title). cancel stops work but keeps the job on the board; delete removes it.
- “remember …” / forget / list memories → remember
- “what can we connect” / “is Slack connected” → Prism does not run its own OAuth and has no connect flow. Call dispatch_doctor and read its host_connectors check, which lists what this agent window already has. To add one, tell the user to install it from their editor's own plugin or MCP settings. Never ask them for an OAuth client id or secret, and never call mcp_auth for Prism — Prism is local stdio.
- “configure Dispatch” / standup layout / Slack channels / Linear vs Jira → configure
- Dispatch setup problems → dispatch_doctor. Speak only the tool message. If workers are unsigned, call init rather than asking for an API key.

Rules:
- Intelligence tools are read-only. Call them freely; no user confirmation needed.
- Dispatch writes gitignored state under .prism/dispatch/ and may spawn a local worker (Cursor agent in Cursor, Claude Code agent in Claude Code). It makes no network calls and holds no third-party credentials.
- Connectors belong to the agent window, not to Prism. When a task needs Slack, Linear, GitHub or Calendar, use your own tools for it and combine the result with Prism's analysis.
- First Intelligence call may take several seconds while the index builds. start_my_day does not wait on the index. If you see PRISM_INDEX_REQUIRED, retry in a few seconds.
- Prefer targeted tools (blast_radius, find_symbol) over dumping whole graphs unless the user asked for the full picture.
- Use real paths from the workspace. If a path is wrong, fix it and retry — do not invent structure.
- Dispatch job workers get read-only Prism intelligence (blast_radius, rename_impact, safe_delete, test_impact, find_symbol, explain_area), answered by the Console's existing index rather than a second one. They have no shell and cannot start jobs. Prism — not the worker — commits the branch and runs the checks.

Start with the smallest useful Prism call for the user's ask. For a code change that means start_job; for a question it means the matching Intelligence tool, then answer from that evidence.`;

/** Prompt names exposed for slash-command / picker clients. */
export const PROMPT_NAMES = [
  "orient",
  "before_edit",
  "review_diff",
  "start_my_day",
  "start_work",
  "where_are_we",
  "connect",
  "configure",
  "init",
] as const;

export type PromptName = (typeof PROMPT_NAMES)[number];
