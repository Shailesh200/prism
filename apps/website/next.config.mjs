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
  async redirects() {
    return [
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
        destination: "/docs/cli/usage",
        permanent: true,
      },
      {
        source: "/docs/using/cli",
        destination: "/docs/cli/usage",
        permanent: true,
      },
      {
        source: "/using/mcp",
        destination: "/docs/mcp/usage",
        permanent: true,
      },
      {
        source: "/docs/using/mcp",
        destination: "/docs/mcp/usage",
        permanent: true,
      },
      {
        source: "/using/vscode-extension",
        destination: "/docs/ide/usage",
        permanent: true,
      },
      {
        source: "/docs/using/vscode-extension",
        destination: "/docs/ide/usage",
        permanent: true,
      },
      {
        source: "/using/cursor",
        destination: "/docs/ide/usage",
        permanent: true,
      },
      {
        source: "/docs/using/cursor",
        destination: "/docs/ide/usage",
        permanent: true,
      },
      {
        source: "/using/playground",
        destination: "/docs/start/playground",
        permanent: true,
      },
      {
        source: "/docs/using/playground",
        destination: "/docs/start/playground",
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
        destination: "/docs/guides/track-health",
        permanent: true,
      },
      {
        source: "/docs/features/health",
        destination: "/docs/guides/track-health",
        permanent: true,
      },
      {
        source: "/features/trends",
        destination: "/docs/guides/track-health",
        permanent: true,
      },
      {
        source: "/docs/features/trends",
        destination: "/docs/guides/track-health",
        permanent: true,
      },
      {
        source: "/features/domains",
        destination: "/docs/guides/investigate-domain",
        permanent: true,
      },
      {
        source: "/docs/features/domains",
        destination: "/docs/guides/investigate-domain",
        permanent: true,
      },
      {
        source: "/features/bundle-weight",
        destination: "/docs/guides/investigate-domain",
        permanent: true,
      },
      {
        source: "/docs/features/bundle-weight",
        destination: "/docs/guides/investigate-domain",
        permanent: true,
      },
      {
        source: "/features/core-web-vitals",
        destination: "/docs/guides/investigate-domain",
        permanent: true,
      },
      {
        source: "/docs/features/core-web-vitals",
        destination: "/docs/guides/investigate-domain",
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
        destination: "/docs/guides/track-health",
        permanent: true,
      },
      {
        source: "/docs/concepts/health-score",
        destination: "/docs/guides/track-health",
        permanent: true,
      },
    ];
  },
};

export default withMDX(config);
