import { source } from "@/lib/source";

/**
 * llms.txt — the curated map answer engines read first.
 *
 * Generated from the docs source at request time so a new page appears here
 * the moment it exists, with its own description, instead of waiting for
 * someone to remember this file. Marketing pages are listed by hand (there
 * are five; a collection would be theatre).
 */
export async function GET() {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.prismhq.in";

  const pages = source
    .getPages()
    .map(
      (page) =>
        `- [${page.data.title}](${site}${page.url}): ${page.data.description ?? ""}`,
    )
    .join("\n");

  const body = `# Prism

> Local-first software intelligence for repositories — maps, graphs, blast
> radius, and health, analysed on your machine. Exposed as a CLI, VS Code /
> Cursor extensions, and an MCP server (41 tools) for AI agents. Dispatch adds
> background teammates that edit your checkout while Prism runs the checks.

## Product

- [Features](${site}/features): task-led feature index
- [Products](${site}/products): every surface and how to install it
- [Benchmarks](${site}/benchmarks): measured agent-orientation savings
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
  concept pages.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
