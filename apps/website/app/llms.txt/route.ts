import { source } from "@/lib/source";
import { AGENTS } from "@/lib/agents";
import { HOW_IT_WORKS, PRODUCTS } from "@/lib/nav";
import { siteOrigin } from "@/lib/seo";
import { PRISM_TOOL_COUNT } from "@repo-prism/shared";

/**
 * llms.txt — the curated map answer engines read first.
 *
 * Docs pages come from the docs source. Marketing pages are the current
 * routes (product, install, changelog, legal).
 */
export const dynamic = "force-static";

export async function GET() {
  const site = siteOrigin();

  const pages = source
    .getPages()
    .map(
      (page) =>
        `- [${page.data.title}](${site}${page.url}): ${page.data.description ?? ""}`,
    )
    .join("\n");

  const productAbout: Record<string, string> = {
    "/product/prepare":
      "files, tests, helpers to reuse and one run command before the edit",
    "/product/blast-radius": "what depends on a file or symbol",
    "/product/guardrails":
      "safe delete and rename; Claude Code and opencode can stop a generated-file edit",
    "/product/receipts": "SHIP, NOT PROVEN or NO-SHIP from your checks",
    "/product/review":
      "reads the change and returns Critical, High, Low, and Nit findings, then a Receipt",
    "/product/lenses": "Dev, Architect, QA or your own, each with its checks",
    "/product/habits":
      "saved routines stored as skills; your agent runs the steps",
    "/product/cli": "the same answers from the terminal",
  };
  const products = PRODUCTS.map(
    (item) =>
      `- [${item.label}](${site}${item.href}): ${productAbout[item.href] ?? item.label}`,
  ).join("\n");

  const installs = AGENTS.map(
    (agent) =>
      `- [${agent.name}](${site}/install/${agent.slug}): ${agent.gets}`,
  ).join("\n");

  const body = `# Prism

> Software intelligence for coding agents. Prepare hands the agent the files
> to edit. Lenses keep the work in your house style and on your map. Review
> reads the change and returns findings, then a Receipt: SHIP, NOT PROVEN, or
> NO-SHIP. Free and MIT; analysis runs on your machine. Exposed as a CLI and an
> MCP server (${PRISM_TOOL_COUNT} tools), wired by \`prism install\`.

Every docs page in full: ${site}/llms-full.txt

## Product

- [Home](${site}/): what Prism does
- [${HOW_IT_WORKS.label}](${site}${HOW_IT_WORKS.href}): map, prepare, guard, review
- [Install](${site}/install): prism start or prism install
${installs}
${products}
- [Benchmarks](${site}/benchmarks): what we measured, including where Prism did not help
- [Changelog](${site}/changelog): Prism 2.0, then the 1.x notes
- [Open source](${site}/open-source): MIT licence and contributing
- [Privacy](${site}/privacy): no account, no telemetry; data stays in ~/.prism/
- [Security](${site}/security): how to report a vulnerability

## Documentation

${pages}

## Notes for agents

- Analysis makes no network calls. A published install checks the npm registry
  for a newer version at most once a day (PRISM_SKIP_SELF_UPDATE=1 turns that
  off). The check sends no repository data.
- Prism's library lives in \`~/.prism/\`, not in the checkout.
- Before an edit, call prepare_change. The automatic prompt lists at most
  three files Prism is sure of.
- A stop receipt is SHIP, NOT PROVEN (with the cheapest command that would
  prove it) or NO-SHIP.
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
