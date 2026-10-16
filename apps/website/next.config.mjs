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
  transpilePackages: ["@repo-prism/dispatch"],
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
        destination: "/install",
        permanent: true,
      },
      {
        source: "/docs/start/what-is-prism",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/:surface(cli|ide|mcp)/install",
        destination: "/install",
        permanent: true,
      },
      {
        source: "/docs/:surface(cli|ide|mcp)/usage",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/mcp/dispatch",
        destination: "/docs/mcp-tools",
        permanent: true,
      },
      {
        source: "/docs/mcp/prompts",
        destination: "/docs/mcp-tools",
        permanent: true,
      },
      {
        source: "/docs/ide/settings",
        destination: "/install/cursor",
        permanent: true,
      },
      {
        source: "/docs/cli/commands",
        destination: "/docs/cli",
        permanent: true,
      },
      {
        source: "/docs/mcp/tools",
        destination: "/docs/mcp-tools",
        permanent: true,
      },
      {
        source: "/docs/reference/faq",
        destination: "/docs/faq",
        permanent: true,
      },
      {
        source: "/docs/reference/troubleshooting",
        destination: "/docs/troubleshooting",
        permanent: true,
      },
      {
        source: "/docs/reference/known-limitations",
        destination: "/docs/faq",
        permanent: true,
      },
      {
        source: "/getting-started/:path*",
        destination: "/docs/quickstart",
        permanent: true,
      },
      {
        source: "/docs/getting-started/:path*",
        destination: "/docs/quickstart",
        permanent: true,
      },
      {
        source: "/using/cli",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/using/cli",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/using/mcp",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/using/mcp",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/using/vscode-extension",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/using/vscode-extension",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/using/cursor",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/using/cursor",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/using/playground",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/using/playground",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/features",
        destination: "/benchmarks",
        permanent: true,
      },
      {
        source: "/features/catalog",
        destination: "/docs/mcp-tools",
        permanent: true,
      },
      {
        source: "/docs/features/catalog",
        destination: "/docs/mcp-tools",
        permanent: true,
      },
      {
        source: "/features/map",
        destination: "/docs/map-and-index",
        permanent: true,
      },
      {
        source: "/docs/features/map",
        destination: "/docs/map-and-index",
        permanent: true,
      },
      {
        source: "/features/impact-analysis",
        destination: "/docs/prepare",
        permanent: true,
      },
      {
        source: "/docs/features/impact-analysis",
        destination: "/docs/prepare",
        permanent: true,
      },
      {
        source: "/features/health",
        destination: "/docs/map-and-index",
        permanent: true,
      },
      {
        source: "/docs/features/health",
        destination: "/docs/map-and-index",
        permanent: true,
      },
      {
        source: "/features/trends",
        destination: "/docs/map-and-index",
        permanent: true,
      },
      {
        source: "/docs/features/trends",
        destination: "/docs/map-and-index",
        permanent: true,
      },
      {
        source: "/features/domains",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/features/domains",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/features/bundle-weight",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/features/bundle-weight",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/features/core-web-vitals",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/features/core-web-vitals",
        destination: "/docs",
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
        destination: "/docs/blast-radius",
        permanent: true,
      },
      {
        source: "/docs/concepts/dependency-graph",
        destination: "/docs/blast-radius",
        permanent: true,
      },
      {
        source: "/concepts/knowledge-graph",
        destination: "/docs/blast-radius",
        permanent: true,
      },
      {
        source: "/docs/concepts/knowledge-graph",
        destination: "/docs/blast-radius",
        permanent: true,
      },
      {
        source: "/concepts/feature-graph",
        destination: "/docs/blast-radius",
        permanent: true,
      },
      {
        source: "/docs/concepts/feature-graph",
        destination: "/docs/blast-radius",
        permanent: true,
      },
      {
        source: "/concepts/stack-detection",
        destination: "/docs/map-and-index",
        permanent: true,
      },
      {
        source: "/docs/concepts/stack-detection",
        destination: "/docs/map-and-index",
        permanent: true,
      },
      {
        source: "/concepts/repository-dna",
        destination: "/docs/map-and-index",
        permanent: true,
      },
      {
        source: "/docs/concepts/repository-dna",
        destination: "/docs/map-and-index",
        permanent: true,
      },
      {
        source: "/concepts/blast-radius",
        destination: "/docs/prepare",
        permanent: true,
      },
      {
        source: "/docs/concepts/blast-radius",
        destination: "/docs/prepare",
        permanent: true,
      },
      {
        source: "/concepts/health-score",
        destination: "/docs/map-and-index",
        permanent: true,
      },
      {
        source: "/docs/concepts/health-score",
        destination: "/docs/map-and-index",
        permanent: true,
      },

      {
        source: "/docs/start/install",
        destination: "/install",
        permanent: true,
      },
      {
        source: "/docs/usage",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/start/:path*",
        destination: "/docs/quickstart",
        permanent: true,
      },
      {
        source: "/docs/guides/:path*",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/reference/:path*",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/help/:path*",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/concepts/:path*",
        destination: "/docs",
        permanent: true,
      },
      {
        source: "/docs/cli/:path*",
        destination: "/docs/cli",
        permanent: true,
      },
      {
        source: "/docs/ide/:path*",
        destination: "/install",
        permanent: true,
      },
      {
        source: "/docs/mcp/:path*",
        destination: "/docs/mcp-tools",
        permanent: true,
      },
    ];
  },
};

export default withMDX(config);
