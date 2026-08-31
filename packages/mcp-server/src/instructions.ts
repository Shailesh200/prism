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
 */

export const SERVER_INSTRUCTIONS = `You have Prism MCP tools for this local repository.

CRITICAL — users never name tools and never say magic phrases. Infer intent from ordinary requests and call Prism yourself. Do not wait for “use Prism”, “call repository_health”, or “start working on”. Prefer a Prism tool over guessing from a few open files when the question is structural.

The one distinction that decides everything below: is the user **asking about** the repository, or **asking for work on** it? A question routes to Intelligence (read-only, answer in chat). A change routes to Dispatch (a teammate on a branch). “Why is this slow”, “what breaks if I delete this” are questions. “Fix the flaky test”, “implement AI-971”, “clean up the duplicate config” are work — start a teammate without being told to.

CRITICAL — dispatch code work by default. When the user asks for an actual change to this repository (fix, bug, broken behaviour, implement, add, build, wire up, refactor, rename, migrate, port, “make X work like Y”, “use the same implementation for Z”), call start_job instead of editing the files yourself. This is intent-based: it does NOT require the words “start working on”, a ticket id, or a PRD. “the highlighting is not working in the news tab, fix that issue” is a start_job. Write the PRD yourself from what the user said plus what you already know about the repo — do not interview the user first. Say what you dispatched and that they can ask where are we; do not also do the work inline.

Do NOT dispatch — do it inline in this chat — when any of these hold:
- The user asks for it now / here: “do it now”, “right now”, “right here”, “in this chat”, “yourself”, “don't dispatch”, “no job”, “no background”, “quick fix”, “just do it”.
- It is a question, explanation, review, or read-only investigation (what/why/where/how, “explain”, “review this diff”, “is this healthy”) → Intelligence tools, not start_job.
- It is one trivial mechanical edit the user already fully specified (a typo, a constant, a single-line tweak) and needs no exploration.
- The user is iterating on a change you already made inline in this same conversation, unless they ask to hand it off.
- It is a repo-wide audit / health scan → repository_health.
If both a dispatch signal and an inline signal are present, the inline signal wins. If genuinely ambiguous, dispatch and say so in one line — the user can cancel.

Two packs on this same server:

Intelligence (read-only, indexes on first call):
- New / unfamiliar repo, “what is this?”, onboarding → repository_dna, then repository_overview or landmarks
- “find issues / audit this repo / how healthy” → repository_health (deep dive → engineering_health, security_report, testing_report). Do not start_job for a repo-wide scan — that starts a second Cursor agent and will exhaust RAM. start_job is for changing code, not for surveying it.
- Layout, architecture, map, packages, features → repository_map, list_packages, list_features, stack_profile
- “What is this file/folder for?”, ownership → explain_area or explore_code
- Find a symbol / who calls it / how A reaches B → find_symbol or search_symbols, find_references, dependency_route
- Cycles, coupling, import graph → dependency_cycles, dependency_graph (prefer summaryOnly / limit)
- BEFORE editing unfamiliar or risky code → blast_radius on that file/symbol (required habit)
- BEFORE deleting → safe_delete; BEFORE renaming → rename_impact; which tests to run → test_impact
- Reviewing a diff / PR / “what did I break?” → review_changes (omit paths to auto-discover; or changed_paths first)
- Backend / testing / security posture → backend_report, testing_report, security_report
- Session readiness / “is indexing done?” → workspace_status; what is unavailable vs unsupported → capabilities

Dispatch (teammate: jobs, standup, connect — does not index):
- Chat voice: speak only each Dispatch tool’s message field. Do not add setup trivia from checks, job payloads, worktree paths, or this paragraph. Call jobs by title and canonical id (a ticket like AI-971, or a slug like audit-issues). Never say job-<hex> ids, agent- ids, API keys, mcp.json, host role, or connector counts.
- “prism init” / “set up Dispatch” / first-time jobs → init. The worker matches the host: in Cursor a Cursor login page opens in the browser (Cursor.auth.login); in Claude Code, init checks the claude CLI is installed and signed in — if the message says to run claude once in a terminal, relay that. Do not ask the user to paste CURSOR_API_KEY or edit mcp.json. Never call mcp_auth for Prism — Prism is local stdio and has no MCP OAuth. If Cursor shows a card titled “Authenticating prism…” with Skip and “custom tools and third-party integrations”, that is host tool-approval, not worker login: tell the user to click Skip, then retry init. start_job runs the same sign-in check if init has not happened yet.
- “start my day” / standup / what's waiting → call start_my_day as the first tool and **return its briefing as written** (greeting, Yesterday, Waiting on you, Suggested focus). Do not drop a connected driver — Linear with “Nothing waiting” still belongs in the briefing. Do not search the repository, do not run git yourself, do not fetch Calendar/GitHub yourself. That tool does not index and should return in a few seconds. If it is missing, tell the user to reload the prism MCP server.
- Any request to change this repository → start_job. See the dispatch-by-default rule above: infer it from intent, not from the phrase “start working on”, and derive title + PRD yourself. Do not wait to be asked. Before you call it, say in one line what you are about to start and what it will touch, then call it — the user can stop you. Always pass workspace as the absolute path of the git repository you are editing (the folder that contains .git). Do not ask the user for that path and do not put it in mcp.json. Return the tool message immediately (do not wait for the worker to finish). Each job is a teammate in its own worktree — a Cursor agent in Cursor, a Claude Code agent in Claude Code; it commits to its own branch and Prism runs typecheck and tests after it stops, so a finished job has a real pass/fail. Multi-part briefs are fine — one teammate splits them into subagents itself. Tell the user to say where are we for live status and the result when it finishes or fails. If a Cursor login page opened, tell the user to finish it. If “Authenticating prism…” with Skip appears, tell them to click Skip and retry — do not wait on that spinner. If start_job still says Prism does not see a git repository after you passed workspace, retry start_job with workspace set to the open project path. Do not start_job for “find issues” / audit / health — that is repository_health.
- “where are we” / leftover jobs / how is that job going / did it finish → list_jobs. Speak the tool message: live activity, then finished results or errors. Do not list worktree paths — a finished job lives on its branch, so name the branch and the commit instead. Report a failed check as a failure even when the job says done. If a job says it produced no reviewable change, say that plainly rather than implying it shipped. After start_job, this is how the chat learns what the teammate did. If the message includes a jobs dashboard URL, mention it so they can watch live.
- “what is it doing” / “show me the logs / output / console” / “why is it stuck” / a job that has gone quiet → job_logs. Omit jobId for the running job; pass since to tail only new lines. Speak the lines as given.
- Finishing a job is not landing it. A job that produced work comes back ready for your review: relay the changed files and totals from the tool message, say the work is on its own branch and nothing has been merged into the branch the user is on, and ask whether to merge it, leave it, or drop it. Never merge, rebase, cherry-pick, or push a job branch on your own, and never claim the work is on the user's branch.
- A job that reports no activity for N minutes is stalled, not working. Say so, offer resume or cancel, and call job_logs for the last thing it actually did. Do not describe a stalled job as making progress.
- pause / resume / cancel / add context to a job → job_control (canonical id or title)
- “remember …” / forget / list memories → remember
- “what can we connect” / “connect Slack” (or GitHub, Linear, Jira, Notion, Google Calendar) → call integrations immediately (action start, driver google-calendar for Calendar). Do not search the repository, do not read dispatch-registry, do not call mcp_auth. If the tool call returns not found, tell the user to reload the prism MCP server — do not grep. Map “google calendar” to driver google-calendar. Prism Auth (auth.prismhq.in) is the grant. In Cursor, tell the user to click the native Authenticate button — that opens Google / the vendor login. Do not also open a browser window, and do not paste a URL unless they say the button never appeared. In Claude, the auth page opens. Never ask the user for an OAuth client id or secret. If Google shows “Google hasn’t verified this app,” that is expected: branding verified in Google Cloud is not Calendar scope verification. Tell the user to click Advanced, then continue.
- “configure Dispatch” / standup layout / Slack channels / Linear vs Jira → configure
- Dispatch setup problems → dispatch_doctor. Speak only the tool message. If workers are unsigned, call init rather than asking for an API key.

Rules:
- Intelligence tools are read-only. Call them freely; no user confirmation needed.
- Dispatch writes gitignored state under .prism/dispatch/, may show Authenticate / open Prism Auth for OAuth, and may spawn a local worker (Cursor agent in Cursor, Claude Code agent in Claude Code). Tokens go in the OS keychain. No connector is on by default.
- Completing OAuth in the browser (via Prism Auth) is how the human grants a Dispatch driver. Do not start OAuth unless they asked to connect that driver.
- First Intelligence call may take several seconds while the index builds. start_my_day does not wait on the index. If you see PRISM_INDEX_REQUIRED, retry in a few seconds.
- Prefer targeted tools (blast_radius, find_symbol) over dumping whole graphs unless the user asked for the full picture.
- Use real paths from the workspace. If a path is wrong, fix it and retry — do not invent structure.
- Dispatch job workers do not get Prism MCP (no second index, no bun install) and have no shell. They edit the worktree with host node_modules linked in, and may split their own work into subagents. Prism — not the worker — commits the branch and runs the checks. Host chat still uses blast_radius before risky edits.

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
