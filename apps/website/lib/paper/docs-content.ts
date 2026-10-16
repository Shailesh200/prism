export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "note"; text: string }
  | { kind: "commands"; commands: string[] };

export type DocPage = {
  slug: string;
  title: string;
  description: string;
  group: string;
  blocks: DocBlock[];
};

const TOOLS: Array<[string, string]> = [
  [
    "prepare_change",
    "Files, reuse, House Style, notes and a work order before an edit",
  ],
  ["work_order", "In-scope, off-limits and needs-sign-off paths for a task"],
  ["guard_session", "Rank this session’s dirty files by blast"],
  ["review_changes", "Blast, test impact and a risk band for a diff"],
  ["blast_radius", "What depends on a file or symbol, and the risk band"],
  ["test_impact", "Test files that reach a change"],
  ["safe_delete", "Whether a file or symbol can be removed"],
  ["rename_impact", "Every edit site a rename would touch"],
  ["find_references", "Who calls or imports a symbol"],
  ["find_symbol", "Where a symbol is declared"],
  ["search_symbols", "Substring or regex search over symbol names"],
  ["repository_overview", "A one-call summary of the repository"],
  ["repository_dna", "Languages, frameworks and stack"],
  ["repository_health", "Health score and the factors behind it"],
  ["repository_map", "Structural map at a zoom level"],
  ["explain_area", "What a file or folder is for"],
  ["explore_code", "Usages, ownership and similar code"],
  ["landmarks", "Entrypoints, package roots and feature anchors"],
  ["list_packages", "Packages in the workspace"],
  ["stack_profile", "Detected stack"],
  ["dependency_graph", "Import graph, files or packages"],
  ["dependency_cycles", "Import and re-export cycles"],
  ["dependency_route", "How one file reaches another"],
  ["knowledge_graph", "Symbol graph"],
  ["feature_graph", "Inferred features and how they depend on each other"],
  ["list_features", "Inferred features and their files"],
  ["changed_paths", "Paths changed in the working tree or against a base"],
  ["list_findings", "Unused exports, duplicate implementations, wrappers"],
  ["queue_finding", "Hand one finding to a background job"],
  ["agents_md", "Generate or check the living AGENTS.md, outside the repo"],
  ["workspace_status", "Whether the workspace is ready"],
  ["capabilities", "What this build can run"],
  ["engineering_health", "Entropy, drift, debt, churn and hotspots"],
  ["testing_report", "Test structure and coverage already on disk"],
  ["security_report", "Left-shift checks"],
  ["backend_report", "Routes, data layer, env vars and jobs"],
  ["health_history", "Health score over stored snapshots"],
  ["breaking_change_hints", "Deprecated hint tool"],
  ["start_my_day", "Standup briefing for this repository"],
  ["use_skill", "Load a skill from ~/.prism/dispatch/skills"],
  ["remember", "Save, list or forget a scoped memory"],
  ["start_job", "Hand a change to a background teammate"],
  ["list_jobs", "Where jobs stand"],
  ["job_logs", "Console for one job"],
  ["job_control", "Pause, resume, cancel or retry a job"],
  ["working_set", "Files and symbols a job already knows"],
  ["configure", "Read or update local Dispatch settings"],
  ["init", "One-time worker sign-in"],
  ["wake", "Bring local workers back"],
  ["sleep", "Park local workers"],
  ["dispatch_doctor", "Whether local teammates can run"],
];

export const DOC_GROUPS = [
  "Get started",
  "Using Prism",
  "Reference",
  "Help",
] as const;

export const DOCS: DocPage[] = [
  {
    slug: "",
    title: "Introduction",
    description:
      "Prism maps a TypeScript or JavaScript repo on your machine and answers your coding agent from that index.",
    group: "Get started",
    blocks: [
      { kind: "h2", text: "Who it is for" },
      {
        kind: "p",
        text: "Developers who use Claude Code, Cursor, Codex or opencode on a TypeScript or JavaScript codebase.",
      },
      { kind: "h2", text: "What it does" },
      {
        kind: "ul",
        items: [
          "Prepare lists the files, helpers, House Style and work order before an edit.",
          "Blast radius, references and test impact say what a change reaches.",
          "Review rolls a diff into a risk band: low, mid or high.",
          "An Envelope line records each Intelligence call locally, without source.",
        ],
      },
      { kind: "h2", text: "What it does not do" },
      {
        kind: "p",
        text: "Prism doesn’t write code for you. Your agent makes the edits. Analysis has no model behind it.",
      },
      { kind: "h2", text: "Start" },
      { kind: "commands", commands: ["npx -y @repo-prism/cli doctor"] },
      {
        kind: "p",
        text: "Then add the MCP server from the [install guide](/install).",
      },
    ],
  },
  {
    slug: "quickstart",
    title: "Quickstart",
    description: "Check the repo, connect an agent, ask in plain words.",
    group: "Get started",
    blocks: [
      { kind: "h2", text: "Before you start" },
      {
        kind: "ul",
        items: [
          "Node.js 22 or newer (`node --version`). The CLI package declares this.",
          "A project folder. Git is optional; history-based answers say when it is missing.",
          "One agent: Claude Code, Cursor, Codex or opencode.",
        ],
      },
      { kind: "h2", text: "1. Check the repo" },
      {
        kind: "commands",
        commands: ["cd /path/to/your/repo", "npx -y @repo-prism/cli doctor"],
      },
      {
        kind: "p",
        text: "Doctor prints the workspace it chose. A first run builds the index when a command needs it.",
      },
      { kind: "h2", text: "2. Connect the agent" },
      { kind: "p", text: "Use the [install pages](/install). Claude Code:" },
      {
        kind: "commands",
        commands: [
          "claude mcp add prism -- npx -y --prefer-online @repo-prism/mcp-server@latest",
        ],
      },
      {
        kind: "note",
        text: "There is no `prism start` and no `prism install <agent>` in this CLI.",
      },
      { kind: "h2", text: "3. Ask" },
      {
        kind: "p",
        text: "Restart the agent. Ask “what breaks if I change src/billing/totals.ts?”. You do not type tool names. The agent can call `blast_radius` or `prepare_change`.",
      },
      { kind: "h2", text: "4. Read the band" },
      {
        kind: "commands",
        commands: ["npx -y @repo-prism/cli review --fail-on high"],
      },
      {
        kind: "p",
        text: "Exit code 1 means the risk is at or above the band you named.",
      },
    ],
  },
  {
    slug: "how-prism-works",
    title: "How Prism works",
    description:
      "A local index, MCP tools, and a review. No model in the analysis.",
    group: "Get started",
    blocks: [
      { kind: "h2", text: "The index" },
      {
        kind: "p",
        text: "Prism reads files, symbols, imports and tests. `prism index` builds or refreshes it. Later commands reuse it.",
      },
      { kind: "h2", text: "A change" },
      {
        kind: "ol",
        items: [
          "You ask in plain words.",
          "`prepare_change` returns files, reuse, House Style, notes and a work order.",
          "Your agent edits.",
          "`guard_session` ranks the dirty files. `review_changes` adds test impact and a band.",
        ],
      },
      { kind: "h2", text: "Where state lives" },
      {
        kind: "p",
        text: "Production writes `~/.prism/workspaces/<key>/`, not a `.prism` directory inside the checkout. `PRISM_HOME` moves the library.",
      },
      { kind: "h2", text: "Background jobs" },
      {
        kind: "p",
        text: "`start_job` can hand work to a local teammate. That path is separate from the read-only analysis tools. Prism still holds no third-party credentials.",
      },
    ],
  },
  {
    slug: "prepare",
    title: "Prepare",
    description:
      "One call before you edit: pack, reuse, House Style, notes, work order.",
    group: "Using Prism",
    blocks: [
      { kind: "h2", text: "From the agent" },
      {
        kind: "p",
        text: "`prepare_change` takes a `task` in plain language and an optional `budget` (default 4,000 map tokens, allowed 200–20,000). The answer is paths, symbol names and why. Never file bodies.",
      },
      { kind: "h2", text: "From the terminal" },
      {
        kind: "commands",
        commands: ['prism prepare "add VAT to invoice totals"'],
      },
      { kind: "h2", text: "What comes back" },
      {
        kind: "ul",
        items: [
          "Pack: files to open.",
          "Reuse: helpers that already exist.",
          "House Style: three exemplars.",
          "Notes: remembered facts and ADR hits, when the index has them.",
          "Work order: in scope, off-limits (generated or vendor), needs sign-off.",
        ],
      },
      {
        kind: "note",
        text: "Ambiguous names come back as candidates. The tool does not pick one silently.",
      },
    ],
  },
  {
    slug: "blast-radius",
    title: "Blast radius",
    description: "Dependents, callers, tests and a risk band.",
    group: "Using Prism",
    blocks: [
      { kind: "h2", text: "Who calls this?" },
      { kind: "commands", commands: ["prism refs getUser"] },
      {
        kind: "p",
        text: "The agent tool is `find_references`, not a `graph` mode. Two symbols that share a name stay `ambiguous`.",
      },
      { kind: "h2", text: "What a change touches" },
      { kind: "commands", commands: ["prism blast src/billing/totals.ts"] },
      {
        kind: "p",
        text: "Import edges are marked measured, heuristic or inferred. Inferred is not load-bearing until you open the file.",
      },
      { kind: "h2", text: "Risk bands" },
      {
        kind: "table",
        headers: ["Band", "Label"],
        rows: [
          ["low", "Low Impact"],
          ["mid", "Moderate Impact"],
          ["high", "High Impact Potential"],
        ],
      },
      { kind: "h2", text: "Related" },
      {
        kind: "table",
        headers: ["Tool", "CLI"],
        rows: [
          ["test_impact", "prism test-impact <target>"],
          ["safe_delete", "prism safe-delete <target>"],
          ["rename_impact", "prism rename <target> [newName]"],
        ],
      },
    ],
  },
  {
    slug: "guard-review",
    title: "Guard and review",
    description:
      "guard_session ranks dirty files. review_changes is a separate tool.",
    group: "Using Prism",
    blocks: [
      { kind: "h2", text: "Guard" },
      {
        kind: "p",
        text: "`guard_session` ranks the working tree minus any `preExistingChanges` you pass, riskiest first. A file may be flagged as a duplicate, an orphan, or a package boundary. It is not a substitute for review.",
      },
      { kind: "h2", text: "Review" },
      {
        kind: "p",
        text: "`review_changes` takes optional paths and an optional git `base`. Omit paths and it uses the working tree. The CLI:",
      },
      {
        kind: "commands",
        commands: ["prism review --base origin/main --fail-on high"],
      },
      {
        kind: "p",
        text: "`--fail-on` exits 1 when the risk is at or above `low`, `mid` or `high`.",
      },
      {
        kind: "note",
        text: "This release does not fold review into `guard_session`. There is no `review: true` field.",
      },
    ],
  },
  {
    slug: "hooks-and-strength",
    title: "How Prism joins your agent",
    description:
      "Prism joins through the MCP server. There is no strength command in this release.",
    group: "Using Prism",
    blocks: [
      { kind: "h2", text: "MCP" },
      {
        kind: "p",
        text: "Claude Code, Cursor, Codex and opencode talk to `@repo-prism/mcp-server`. The canonical entry is in `packages/mcp-server/mcp-install.json`: `npx -y --prefer-online @repo-prism/mcp-server@latest` with `NODE_USE_SYSTEM_CA=1`.",
      },
      { kind: "h2", text: "What is not in this release" },
      {
        kind: "ul",
        items: [
          "No `prism strength full|lite|off`.",
          "No session hooks that block an edit by default. Off-limits paths are reported on the work order. A write veto runs only when an Accepted ADR arms it.",
          "No installer that writes a rule file for you.",
        ],
      },
      { kind: "h2", text: "The bin name" },
      {
        kind: "p",
        text: "The server package exposes a `prism-mcp` binary. The install this site documents uses `npx` so you do not have to put that binary on `PATH` yourself.",
      },
    ],
  },
  {
    slug: "receipts",
    title: "Receipts",
    description:
      "The Envelope is a local ledger of Intelligence calls. It is not a SHIP or NO-SHIP verdict.",
    group: "Using Prism",
    blocks: [
      { kind: "h2", text: "What is stored" },
      {
        kind: "p",
        text: "Each successful Intelligence call appends one JSON line to `~/.prism/envelope-ledger.jsonl`. The line has the tool name, item counts, whether the list was truncated, the limit, and the JSON byte size.",
      },
      { kind: "h2", text: "What is not stored" },
      {
        kind: "p",
        text: "No prompts, no paths, and no file bodies. The file is never uploaded.",
      },
      { kind: "h2", text: "Honest lists" },
      {
        kind: "p",
        text: "A list tool returns `items`, `totalCount` and `truncated`. Fifty of sixty must say so.",
      },
      {
        kind: "note",
        text: "This release has no `prism receipts` command and no SHIP, NOT PROVEN or NO-SHIP verdict.",
      },
    ],
  },
  {
    slug: "lenses",
    title: "Lenses",
    description:
      "Risk bands are the review angles in this release. Named lenses are not.",
    group: "Using Prism",
    blocks: [
      { kind: "h2", text: "What you can ask" },
      {
        kind: "p",
        text: "`blast_radius` and `review_changes` return a band: low (Low Impact), mid (Moderate Impact), or high (High Impact Potential).",
      },
      { kind: "h2", text: "What is not shipped" },
      {
        kind: "p",
        text: "There is no `prism lens` command, no `~/.prism/lenses/lenses.json`, and no Architect, QA or Dev lens with automatic routing.",
      },
      { kind: "commands", commands: ["prism review --fail-on mid"] },
    ],
  },
  {
    slug: "habits",
    title: "Habits",
    description: "start_my_day and use_skill. There is no habits.json command.",
    group: "Using Prism",
    blocks: [
      { kind: "h2", text: "Start my day" },
      {
        kind: "p",
        text: "Ask “start my day”. The agent calls `start_my_day`: yesterday, open items, leftover jobs, and one suggested focus. Tools that are not connected are named.",
      },
      { kind: "h2", text: "Skills" },
      {
        kind: "p",
        text: "`use_skill` loads a skill from `~/.prism/dispatch/skills`, or a skill that ships with Prism. Omit the name to list them. Prism does not write your editor’s skill folder.",
      },
      {
        kind: "note",
        text: "`prism habit add` is not a command. Prism does not store or run a list of shell steps for you.",
      },
    ],
  },
  {
    slug: "memory",
    title: "Memory",
    description: "remember saves a fact for later jobs and for prepare.",
    group: "Using Prism",
    blocks: [
      { kind: "h2", text: "The tool" },
      {
        kind: "p",
        text: "`remember` saves, lists or forgets a memory. Scope is job, repo or user. A fact can attach to a symbol or a path; a rename moves it. Code-changing rules need `confirm: true`.",
      },
      { kind: "h2", text: "Where it shows up" },
      {
        kind: "p",
        text: "`prepare_change` can return those notes with the file they belong to. `start_job` can inject repo memories into the next job prompt.",
      },
      {
        kind: "note",
        text: "There is no `prism remember` CLI in this release. Ask the agent.",
      },
    ],
  },
  {
    slug: "map-and-index",
    title: "Repo map and index",
    description: "prism map, prism index, and the repository tools.",
    group: "Using Prism",
    blocks: [
      { kind: "h2", text: "Map" },
      { kind: "commands", commands: ["prism map", "prism map --zoom package"] },
      {
        kind: "p",
        text: "The agent tool is `repository_map`. Zoom levels come from the map model. `repository_dna` and `repository_overview` answer “what is this repo?” in one call.",
      },
      { kind: "h2", text: "Index" },
      { kind: "commands", commands: ["prism index"] },
      {
        kind: "p",
        text: "Commands that need an index build one. `PRISM_INDEX_REQUIRED` means it is not ready yet.",
      },
      { kind: "h2", text: "Structure commands" },
      {
        kind: "p",
        text: "`prism deps`, `prism cycles`, `prism symbol`, `prism refs`, `prism route`, `prism explain`, `prism explore`.",
      },
    ],
  },
  {
    slug: "mcp-tools",
    title: "MCP tools",
    description: "Every tool the Prism MCP server exposes.",
    group: "Reference",
    blocks: [
      {
        kind: "p",
        text: "The server exposes 51 tools. Intelligence tools read the index. Dispatch tools manage jobs and memories under `~/.prism` and do not index. List tools accept `limit` and return `totalCount` and `truncated`.",
      },
      { kind: "h2", text: "Tools" },
      { kind: "table", headers: ["Tool", "What it answers"], rows: TOOLS },
    ],
  },
  {
    slug: "cli",
    title: "CLI",
    description:
      "Commands from the prism CLI, grouped as the program defines them.",
    group: "Reference",
    blocks: [
      { kind: "h2", text: "Run it" },
      {
        kind: "commands",
        commands: [
          "npx -y @repo-prism/cli doctor",
          "npm install -g @repo-prism/cli",
        ],
      },
      {
        kind: "p",
        text: "After a global install the binary is `prism`. These groups match `packages/cli/src/commands.ts`.",
      },
      { kind: "h2", text: "Diagnostics" },
      { kind: "p", text: "`doctor`, `index`, `completions`." },
      { kind: "h2", text: "Understand a repository" },
      {
        kind: "p",
        text: "`dna`, `health`, `map`, `explain`, `explore`, `stack`, `features`, `landmarks`, `packages`.",
      },
      { kind: "h2", text: "Assess a change" },
      {
        kind: "p",
        text: "`prepare`, `blast`, `review`, `safe-delete`, `rename`, `test-impact`.",
      },
      { kind: "h2", text: "Inspect structure" },
      { kind: "p", text: "`deps`, `cycles`, `symbol`, `refs`, `route`." },
      { kind: "h2", text: "Reports" },
      {
        kind: "p",
        text: "`engineering`, `testing`, `security`, `backend`, `bundle`, `agents-md`, `findings`.",
      },
      {
        kind: "note",
        text: "Not in this CLI: `start`, `install`, `uninstall`, `upgrade`, `strength`, `habit`, `lens`, `receipts`, `graph`, `remember`.",
      },
    ],
  },
  {
    slug: "configuration",
    title: "Configuration",
    description: "MCP config files and where Prism keeps state.",
    group: "Reference",
    blocks: [
      { kind: "h2", text: "MCP server entry" },
      {
        kind: "p",
        text: "Command `npx`, args `-y`, `--prefer-online`, `@repo-prism/mcp-server@latest`, env `NODE_USE_SYSTEM_CA=1`. That is `packages/mcp-server/mcp-install.json`.",
      },
      { kind: "h2", text: "Per client" },
      {
        kind: "table",
        headers: ["Client", "File"],
        rows: [
          ["Claude Code", "~/.claude.json or .mcp.json — mcpServers.prism"],
          [
            "Cursor",
            "~/.cursor/mcp.json or .cursor/mcp.json — mcpServers.prism",
          ],
          ["Codex", "~/.codex/config.toml — [mcp_servers.prism]"],
          ["opencode", "opencode.json — mcp.prism, local command"],
        ],
      },
      { kind: "h2", text: "Workspace" },
      {
        kind: "p",
        text: "The CLI resolves the repo as `--workspace`, then `PRISM_WORKSPACE`, then the git root, then the current directory. The MCP server asks the client for its open folders.",
      },
    ],
  },
  {
    slug: "environment",
    title: "Environment variables",
    description: "PRISM_HOME and PRISM_WORKSPACE.",
    group: "Reference",
    blocks: [
      { kind: "h2", text: "Variables" },
      {
        kind: "table",
        headers: ["Variable", "Effect"],
        rows: [
          ["PRISM_HOME", "Where Prism keeps its library. Default is ~/.prism"],
          [
            "PRISM_WORKSPACE",
            "Which repo to analyse when you do not pass --workspace",
          ],
          [
            "NODE_USE_SYSTEM_CA",
            "Lets the npm download trust a corporate proxy CA. Set on the MCP server, not on analysis",
          ],
        ],
      },
      {
        kind: "note",
        text: "This release does not read `PRISM_AUTOPREPARE` or `PRISM_SKIP_SELF_UPDATE`.",
      },
    ],
  },
  {
    slug: "data-and-files",
    title: "Data and files",
    description:
      "Production state lives under ~/.prism. The checkout stays clean.",
    group: "Reference",
    blocks: [
      { kind: "h2", text: "Library" },
      {
        kind: "table",
        headers: ["Path", "What"],
        rows: [
          ["~/.prism/workspaces/<key>/cache/", "The index"],
          [
            "~/.prism/workspaces/<key>/dispatch/",
            "Jobs, memories and notes for that repo",
          ],
          ["~/.prism/dispatch/skills/", "Skills `use_skill` can load"],
          [
            "~/.prism/envelope-ledger.jsonl",
            "Intelligence call receipts, never source",
          ],
        ],
      },
      {
        kind: "p",
        text: "The key is a hash of the workspace path. `PRISM_HOME` moves the whole tree. Production does not write `<repo>/.prism`.",
      },
      { kind: "h2", text: "Living AGENTS.md" },
      {
        kind: "p",
        text: "`prism agents-md generate` writes `~/.prism/workspaces/<key>/agents.md`. It is not written into git.",
      },
    ],
  },
  {
    slug: "errors",
    title: "Error codes",
    description: "Stable Prism error codes from packages/shared.",
    group: "Reference",
    blocks: [
      { kind: "h2", text: "Codes" },
      {
        kind: "table",
        headers: ["Code", "Means"],
        rows: [
          ["PRISM_UNKNOWN", "Unexpected; see the message"],
          ["PRISM_VALIDATION", "An argument is missing or wrong"],
          ["PRISM_NOT_FOUND", "No file or symbol matches"],
          ["PRISM_INVALID_PATH", "The path is outside the repo"],
          ["PRISM_INVALID_ID", "The id is not valid"],
          ["PRISM_WORKSPACE_NOT_OPEN", "No repo is open"],
          ["PRISM_INDEX_REQUIRED", "The index is not ready; retry shortly"],
          ["PRISM_INDEX_FAILED", "Indexing did not finish"],
          ["PRISM_ANALYZER_FAILED", "A file could not be analysed"],
          ["PRISM_GRAPH_ERROR", "The graph query could not run"],
          ["PRISM_IO_ERROR", "A file could not be read or written"],
          ["PRISM_UNSUPPORTED", "This build does not support it"],
          ["PRISM_CANCELLED", "The request was cancelled"],
        ],
      },
    ],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    description: "Start with prism doctor.",
    group: "Help",
    blocks: [
      { kind: "h2", text: "Run doctor" },
      { kind: "commands", commands: ["npx -y @repo-prism/cli doctor"] },
      {
        kind: "p",
        text: "It prints the workspace and the index state. A warn on a first index is expected.",
      },
      { kind: "h2", text: "The agent sees no tools" },
      {
        kind: "ul",
        items: [
          "The config command is `npx`, with the args from the install page.",
          "Restart the agent after editing the config.",
          "Cursor: enable the prism server under MCP settings.",
        ],
      },
      { kind: "h2", text: "PRISM_INDEX_REQUIRED" },
      {
        kind: "p",
        text: "Run `prism index` in the repo and retry. A shallow git clone limits history-based answers; those are marked unavailable rather than shown as zero.",
      },
      { kind: "h2", text: "Node" },
      { kind: "p", text: "The published CLI asks for Node.js 22 or newer." },
    ],
  },
  {
    slug: "upgrade-and-uninstall",
    title: "Upgrade and uninstall",
    description: "Keep @latest. Remove the MCP entry you added.",
    group: "Help",
    blocks: [
      { kind: "h2", text: "Upgrade" },
      {
        kind: "p",
        text: "The documented server uses `@repo-prism/mcp-server@latest`, so the next launch can pick up a publish. Restart the agent after a publish. For a global CLI: `npm install -g @repo-prism/cli`.",
      },
      { kind: "h2", text: "Remove the agent entry" },
      {
        kind: "p",
        text: "Delete the `prism` key from the MCP config you edited, then restart the agent. There is no `prism uninstall` command.",
      },
      { kind: "h2", text: "Remove local data" },
      {
        kind: "p",
        text: "Delete `~/.prism` if you want the library gone. That folder is outside the checkout.",
      },
    ],
  },
  {
    slug: "faq",
    title: "FAQ",
    description: "Privacy, languages, and what Prism will not do.",
    group: "Help",
    blocks: [
      { kind: "h2", text: "Does my code leave my machine?" },
      {
        kind: "p",
        text: "Analysis makes no network calls. A test runs the analysis surface with the socket layer trapped. A few optional features can reach the network, and each stays off until you turn it on. None of them send source.",
      },
      { kind: "h2", text: "Is Prism an AI coding assistant?" },
      {
        kind: "p",
        text: "No. The analysis engine has no model in it and generates nothing.",
      },
      { kind: "h2", text: "Which languages?" },
      {
        kind: "p",
        text: "TypeScript and JavaScript are fully analysed. Other languages are indexed for structure, size and churn.",
      },
      { kind: "h2", text: "Do I need git?" },
      {
        kind: "p",
        text: "No. Churn, ownership and review read history when it exists, and say when it does not.",
      },
      { kind: "h2", text: "Is there a hosted version?" },
      {
        kind: "p",
        text: "No. There is no account and nothing to sign up for.",
      },
      { kind: "h2", text: "How much does it cost?" },
      { kind: "p", text: "Nothing. The licence is MIT." },
    ],
  },
];

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}

export function findDoc(slug: string | undefined): DocPage | undefined {
  const key = slug ?? "";
  return DOCS.find((page) => page.slug === key);
}

export function docSearch(query: string): DocPage[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return DOCS.slice(0, 8);
  return DOCS.filter((page) => {
    const hay = [
      page.title,
      page.description,
      ...page.blocks.flatMap((block) => {
        if (block.kind === "p" || block.kind === "h2" || block.kind === "note")
          return [block.text];
        if (
          block.kind === "ul" ||
          block.kind === "ol" ||
          block.kind === "commands"
        )
          return block.kind === "commands" ? block.commands : block.items;
        return [...block.headers, ...block.rows.flat()];
      }),
    ]
      .join("\n")
      .toLowerCase();
    return hay.includes(needle);
  }).slice(0, 12);
}
