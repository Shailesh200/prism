import { source } from "@/lib/source";
import { siteOrigin } from "@/lib/seo";
import { PRISM_TOOL_COUNT } from "@repo-prism/shared";

/**
 * llms.txt — the curated map answer engines read first.
 *
 * Generated from the docs source at request time so a new page appears here
 * the moment it exists, with its own description, instead of waiting for
 * someone to remember this file. Marketing pages are listed by hand (there
 * are five; a collection would be theatre).
 */
export async function GET() {
  const site = siteOrigin();

  const pages = source
    .getPages()
    .map(
      (page) =>
        `- [${page.data.title}](${site}${page.url}): ${page.data.description ?? ""}`,
    )
    .join("\n");

  const body = `# Prism

> Local-first software intelligence for repositories — maps, graphs, blast
> radius, health, Prepare, Envelope, and Guard — analysed on your machine.
> Exposed as a CLI, VS Code / Cursor extensions, and an MCP server
> (${PRISM_TOOL_COUNT} tools) for AI agents. Dispatch adds background
> teammates that edit your checkout while Prism runs this repository's checks.

## Product

- [Install](${site}/install): Node 26+, pick a surface, confirm it works
- [Products](${site}/products): Spectrum, Intelligence, Envelope, Prepare, Guard, Dispatch
- [Benchmarks](${site}/benchmarks): task-led features plus measured orientation savings
- [What's new](${site}/whats-new): release timeline
- [Privacy](${site}/privacy): no account, no telemetry, consent-gated network
- [Security](${site}/security): reporting policy

## Documentation

${pages}

## Notes for agents

- Core analysis makes no network calls; optional network features are
  consent-gated and individually opt-in.
- State lives in \`.prism/\` inside the repository; it is a derived cache.
- TypeScript/JavaScript get symbol-level analysis; other languages get
  structure, size, and churn.
- Task guides under /docs/guides answer "how do I …" faster than the
  concept pages. Before an edit, agents should call prepare_change
  (pack + reuse + House Style, no file bodies) instead of dumping the repo.
- Envelope is a local ledger of Intelligence calls (counts and bytes, never
  source). Guard ranks a dirty session by blast. Findings stay open until
  a re-scan drops the fingerprint.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
