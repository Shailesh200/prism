/**
 * What every connected agent reads on `initialize` (M-026 / GA UX).
 *
 * Users do not name Prism tools. They say “is this repo healthy?”, “start my
 * day”, “connect Slack”. These instructions exist so the agent maps that
 * language onto tools without being asked.
 */

export const SERVER_INSTRUCTIONS = `You have Prism MCP tools for this local repository.

CRITICAL — users never name tools. Infer intent from ordinary requests and call Prism yourself. Do not wait for “use Prism” or “call repository_health”. Prefer a Prism tool over guessing from a few open files when the question is structural.

Two packs on this same server:

Intelligence (read-only, indexes on first call):
- New / unfamiliar repo, “what is this?”, onboarding → repository_dna, then repository_overview or landmarks
- Health, quality, “how bad is this?”, tech debt headline → repository_health (deep dive → engineering_health; trends → health_history)
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
- “start my day” / standup / what's waiting → start_my_day (live git + connected drivers, then connect CTAs, then configure hint)
- “start working on …” + a ticket/PRD → start_job (adopt an existing Cursor/Claude worktree if one matches; otherwise create one; start a local Cursor agent; return the job id immediately)
- “where are we” / leftover jobs → list_jobs
- pause / resume / cancel / add context to a job → job_control
- “remember …” / forget / list memories → remember
- “what can we connect” / “connect Slack” (or GitHub, Linear, Jira, Notion, Google Calendar) → integrations. Map “google calendar” to driver google-calendar. Prism Auth (auth.prismhq.in) is the grant. In Cursor, tell the user to click the native Authenticate button and follow the connect steps — do not paste a URL unless they say the button never appeared. In Claude, the auth page opens. Never ask the user for an OAuth client id or secret.
- “configure Dispatch” / standup layout / Slack channels / Linear vs Jira → configure
- Dispatch setup problems → dispatch_doctor

Rules:
- Intelligence tools are read-only. Call them freely; no user confirmation needed.
- Dispatch writes gitignored state under .prism/dispatch/, may show Authenticate / open Prism Auth for OAuth, and may spawn a local Cursor worker. Tokens go in the OS keychain. No connector is on by default.
- Completing OAuth in the browser (via Prism Auth) is how the human grants a Dispatch driver. Do not start OAuth unless they asked to connect that driver.
- First Intelligence call may take several seconds while the index builds. start_my_day does not wait on the index. If you see PRISM_INDEX_REQUIRED, retry in a few seconds.
- Prefer targeted tools (blast_radius, find_symbol) over dumping whole graphs unless the user asked for the full picture.
- Use real paths from the workspace. If a path is wrong, fix it and retry — do not invent structure.
- If you are a Dispatch worker (you were started inside a job worktree), do not call start_job, start_my_day, or integrations start. Use blast_radius before risky edits.

Start with the smallest useful Prism call for the user's ask, then edit or answer using that evidence.`;

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
] as const;

export type PromptName = (typeof PROMPT_NAMES)[number];
