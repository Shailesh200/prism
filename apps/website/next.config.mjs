import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  outputFileTracingRoot: repoRoot,
  async headers() {
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
      return [
        {
          source: "/:path*",
          headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
        },
      ];
    }
    return [];
  },
  async redirects() {
    return [
      // Docs restructure (M-067): the per-surface CLI / IDE / MCP lanes were
      // folded into one Install page and one Usage page, so every lane URL
      // that was ever shared has to keep resolving.
      {
        source: "/docs/start/get-started",
        destination: "/docs/start/install",
        permanent: true,
      },
      {
        source: "/docs/start/what-is-prism",
        destination: "/docs/what-is-prism",
        permanent: true,
      },
      {
        source: "/docs/:surface(cli|ide|mcp)/install",
        destination: "/docs/start/install",
        permanent: true,
      },
      {
        source: "/docs/:surface(cli|ide|mcp)/usage",
        destination: "/docs/usage",
        permanent: true,
      },
      {
        source: "/docs/mcp/dispatch",
        destination: "/docs/usage",
        permanent: true,
      },
      {
        source: "/docs/mcp/prompts",
        destination: "/docs/reference/mcp-prompts",
        permanent: true,
      },
      {
        source: "/docs/ide/settings",
        destination: "/docs/start/install",
        permanent: true,
      },
      {
        source: "/docs/reference/ide-settings",
        destination: "/docs/start/install",
        permanent: true,
      },
      {
        source: "/docs/cli/commands",
        destination: "/docs/reference/cli-commands",
        permanent: true,
      },
      {
        source: "/docs/mcp/tools",
        destination: "/docs/reference/mcp-tools",
        permanent: true,
      },
      {
        source: "/docs/reference/faq",
        destination: "/docs/help/faq",
        permanent: true,
      },
      {
        source: "/docs/reference/troubleshooting",
        destination: "/docs/help/troubleshooting",
        permanent: true,
      },
      {
        source: "/docs/reference/known-limitations",
        destination: "/docs/help/known-limitations",
        permanent: true,
      },
      {
        source: "/getting-started/:path*",
        destination: "/docs/start/:path*",
        permanent: true,
      },
      {
        source: "/docs/getting-started/:path*",
        destination: "/docs/start/:path*",
        permanent: true,
      },
      {
        source: "/using/cli",
        destination: "/docs/usage",
        permanent: true,
      },
      {
        source: "/docs/using/cli",
        destination: "/docs/usage",
        permanent: true,
      },
      {
        source: "/using/mcp",
        destination: "/docs/usage",
        permanent: true,
      },
      {
        source: "/docs/using/mcp",
        destination: "/docs/usage",
        permanent: true,
      },
      {
        source: "/using/vscode-extension",
        destination: "/docs/usage",
        permanent: true,
      },
      {
        source: "/docs/using/vscode-extension",
        destination: "/docs/usage",
        permanent: true,
      },
      {
        source: "/using/cursor",
        destination: "/docs/usage",
        permanent: true,
      },
      {
        source: "/docs/using/cursor",
        destination: "/docs/usage",
        permanent: true,
      },
      {
        source: "/using/playground",
        destination: "/docs/start/install",
        permanent: true,
      },
      {
        source: "/docs/using/playground",
        destination: "/docs/start/install",
        permanent: true,
      },
      {
        source: "/features",
        destination: "/benchmarks",
        permanent: true,
      },
      // The Product menu has no overview page; each product has its own.
      {
        source: "/products",
        destination: "/product/review",
        permanent: true,
      },
      // Prepare and Lenses are held until round 5 passes: temporary (307).
      {
        source:
          "/docs/guides/:page(prepare-a-change|before-you-edit|lenses|remember-context)",
        destination: "/docs",
        permanent: false,
      },
      {
        source: "/docs/benchmarks/:page(2\\.x|2\\.x-per-task|2\\.x\\.json)",
        destination: "/benchmarks",
        permanent: false,
      },
      {
        source: "/product/:page(prepare|lenses)",
        destination: "/docs",
        permanent: false,
      },
      // /whats-new/rss.xml stays a route handler. The slug rule must not take it.
      {
        source: "/whats-new",
        destination: "/changelog",
        permanent: true,
      },
      {
        source: "/whats-new/:version(\\d+\\.\\d+\\.\\d+)",
        destination: "/changelog#:version",
        permanent: true,
      },
      {
        source: "/whats-new/:slug((?!rss\\.xml$).*)",
        destination: "/changelog/:slug",
        permanent: true,
      },
      {
        source: "/features/catalog",
        destination: "/docs/reference/capabilities",
        permanent: true,
      },
      {
        source: "/docs/features/catalog",
        destination: "/docs/reference/capabilities",
        permanent: true,
      },
      {
        source: "/features/map",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/docs/features/map",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/features/impact-analysis",
        destination: "/docs/guides/before-you-edit",
        permanent: true,
      },
      {
        source: "/docs/features/impact-analysis",
        destination: "/docs/guides/before-you-edit",
        permanent: true,
      },
      {
        source: "/features/health",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/docs/features/health",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/features/trends",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/docs/features/trends",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/features/domains",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/docs/features/domains",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/features/bundle-weight",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/docs/features/bundle-weight",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/features/core-web-vitals",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/docs/features/core-web-vitals",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      // Prism 2.0 removed these pages; old links land on the closest living one.
      {
        source: "/docs/start/playground",
        destination: "/docs/start/install",
        permanent: true,
      },
      {
        source: "/docs/guides/:page(track-health|investigate-domain)",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/docs/guides/dispatch",
        destination: "/docs/usage",
        permanent: true,
      },
      {
        source: "/docs/concepts/consent-and-privacy",
        destination: "/privacy",
        permanent: true,
      },
      {
        source: "/admin/docs",
        destination: "/admin/docs/overview",
        permanent: false,
      },
      {
        source: "/architecture",
        destination: "/admin/docs/overview",
        permanent: true,
      },
      {
        source: "/architecture/:path*",
        destination: "/admin/docs/:path*",
        permanent: true,
      },
      {
        source: "/docs/architecture",
        destination: "/admin/docs/overview",
        permanent: true,
      },
      {
        source: "/docs/architecture/:path*",
        destination: "/admin/docs/:path*",
        permanent: true,
      },
      {
        source: "/concepts/dependency-graph",
        destination: "/docs/concepts/graphs",
        permanent: true,
      },
      {
        source: "/docs/concepts/dependency-graph",
        destination: "/docs/concepts/graphs",
        permanent: true,
      },
      {
        source: "/concepts/knowledge-graph",
        destination: "/docs/concepts/graphs",
        permanent: true,
      },
      {
        source: "/docs/concepts/knowledge-graph",
        destination: "/docs/concepts/graphs",
        permanent: true,
      },
      {
        source: "/concepts/feature-graph",
        destination: "/docs/concepts/graphs",
        permanent: true,
      },
      {
        source: "/docs/concepts/feature-graph",
        destination: "/docs/concepts/graphs",
        permanent: true,
      },
      {
        source: "/concepts/stack-detection",
        destination: "/docs/concepts/dna-and-stack",
        permanent: true,
      },
      {
        source: "/docs/concepts/stack-detection",
        destination: "/docs/concepts/dna-and-stack",
        permanent: true,
      },
      {
        source: "/concepts/repository-dna",
        destination: "/docs/concepts/dna-and-stack",
        permanent: true,
      },
      {
        source: "/docs/concepts/repository-dna",
        destination: "/docs/concepts/dna-and-stack",
        permanent: true,
      },
      {
        source: "/concepts/blast-radius",
        destination: "/docs/guides/before-you-edit",
        permanent: true,
      },
      {
        source: "/docs/concepts/blast-radius",
        destination: "/docs/guides/before-you-edit",
        permanent: true,
      },
      {
        source: "/concepts/health-score",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
      {
        source: "/docs/concepts/health-score",
        destination: "/docs/guides/understand-a-repo",
        permanent: true,
      },
    ];
  },
};

export default withMDX(config);
