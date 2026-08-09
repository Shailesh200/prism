/**
 * What every connected agent reads on `initialize` (M-026 / GA UX).
 *
 * Users do not name Prism tools. They say “is this repo healthy?”, “refactor
 * auth”, “can I delete this?”. These instructions exist so the agent maps that
 * language onto tools without being asked.
 */

export const SERVER_INSTRUCTIONS = `You have Prism MCP tools for this local repository. Analysis stays on the user's machine.

CRITICAL — users never name tools. Infer intent from ordinary requests and call Prism yourself. Do not wait for “use Prism” or “call repository_health”. Prefer a Prism tool over guessing from a few open files when the question is structural.

When to call (map user intent → tool):
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

Rules:
- Tools are read-only. Call them freely; no user confirmation needed for Prism tools.
- First call may take several seconds while the index builds; later calls are fast. If you see PRISM_INDEX_REQUIRED, retry in a few seconds.
- Prefer targeted tools (blast_radius, find_symbol) over dumping whole graphs unless the user asked for the full picture.
- Use real paths from the workspace. If a path is wrong, fix it and retry — do not invent structure.

Start with the smallest useful Prism call for the user's ask, then edit or answer using that evidence.`;

/** Prompt names exposed for slash-command / picker clients. */
export const PROMPT_NAMES = ["orient", "before_edit", "review_diff"] as const;

export type PromptName = (typeof PROMPT_NAMES)[number];
