import { DOCS, docHref } from "@/lib/paper/docs-content";
import { siteOrigin } from "@/lib/seo";
import { PRISM_TOOL_COUNT } from "@repo-prism/shared";

/**
 * llms.txt — the curated map answer engines read first.
 */
export function GET() {
  const site = siteOrigin();
  const pages = DOCS.map(
    (page) =>
      `- [${page.title}](${site}${docHref(page.slug)}): ${page.description}`,
  ).join("\n");

  const body = `# Prism

> Local-first software intelligence for a TypeScript or JavaScript repository.
> It gives a coding agent the files, tests and code to reuse before an edit,
> then ranks the change. Analysis runs on your machine. Not a coding model.
> MCP server with ${PRISM_TOOL_COUNT} tools, plus a CLI.

## Product

- [Install](${site}/install): Node.js 22+, connect Claude Code, Cursor, Codex or opencode, then \`npx -y @repo-prism/cli doctor\`
- [How it works](${site}/how-it-works): map, prepare, guard, review
- [Benchmarks](${site}/benchmarks): tool-call savings from the published sample
- [Changelog](${site}/changelog): CLI and MCP server releases
- [Privacy](${site}/privacy): no account, analysis stays local, library in ~/.prism
- [Security](${site}/security): reporting policy

## Documentation

${pages}

## Notes for agents

- Core analysis makes no network calls. Optional network features are consent-gated and individually opt-in. None send source.
- Production state lives in \`~/.prism/workspaces/<key>/\`, not in a \`.prism/\` directory inside the checkout. \`PRISM_HOME\` moves the library.
- TypeScript and JavaScript get symbol-level analysis. Other languages get structure, size and churn.
- Before an edit, call \`prepare_change\` (pack, reuse, House Style, notes, work order — never file bodies).
- \`review_changes\` is a separate tool from \`guard_session\`. Risk bands are low, mid and high.
- The Envelope ledger at \`~/.prism/envelope-ledger.jsonl\` records tool name, counts, truncation and bytes. Never source.
- There is no \`prism start\`, \`prism install <agent>\`, or SHIP / NOT PROVEN / NO-SHIP verdict in this release.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
