import { defineConfig } from "vitepress";

const GITHUB = "https://github.com/Shailesh200/prism";

export default defineConfig({
  title: "Prism",
  description:
    "A local-first software intelligence engine. Maps, graphs, impact analysis and health for your repository — without your code leaving your machine.",
  lang: "en-GB",
  cleanUrls: true,
  lastUpdated: true,

  // Every link in these docs is written as a relative path to a real file, so a
  // dead link means a page was moved or deleted. That should fail the build
  // rather than ship.
  ignoreDeadLinks: false,

  head: [
    ["meta", { name: "theme-color", content: "#6366f1" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "Prism" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Understand any codebase. Locally, with no account and nothing uploaded.",
      },
    ],
  ],

  themeConfig: {
    outline: [2, 3],

    nav: [
      { text: "Get started", link: "/getting-started/what-is-prism" },
      { text: "Concepts", link: "/concepts/repository-index" },
      { text: "Using Prism", link: "/using/cli" },
      { text: "Reference", link: "/reference/cli-commands" },
      { text: "GitHub", link: GITHUB },
    ],

    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "What is Prism", link: "/getting-started/what-is-prism" },
          { text: "Install", link: "/getting-started/install" },
          { text: "Quickstart", link: "/getting-started/quickstart" },
        ],
      },
      {
        text: "Concepts",
        collapsed: false,
        items: [
          { text: "The repository index", link: "/concepts/repository-index" },
          { text: "Dependency graph", link: "/concepts/dependency-graph" },
          { text: "Knowledge graph", link: "/concepts/knowledge-graph" },
          { text: "Feature graph", link: "/concepts/feature-graph" },
          { text: "Signal provenance", link: "/concepts/signal-provenance" },
          { text: "Risk bands", link: "/concepts/risk-bands" },
          { text: "Health score", link: "/concepts/health-score" },
          { text: "Blast radius", link: "/concepts/blast-radius" },
          { text: "Repository DNA", link: "/concepts/repository-dna" },
          { text: "Stack detection", link: "/concepts/stack-detection" },
          {
            text: "Consent and privacy",
            link: "/concepts/consent-and-privacy",
          },
        ],
      },
      {
        text: "Features",
        collapsed: false,
        items: [
          { text: "The map", link: "/features/map" },
          { text: "Impact analysis", link: "/features/impact-analysis" },
          { text: "Engineering health", link: "/features/health" },
          { text: "Trends", link: "/features/trends" },
          { text: "Domain screens", link: "/features/domains" },
          { text: "Bundle weight", link: "/features/bundle-weight" },
          { text: "Core Web Vitals", link: "/features/core-web-vitals" },
        ],
      },
      {
        text: "Using Prism",
        collapsed: false,
        items: [
          { text: "CLI", link: "/using/cli" },
          { text: "VS Code extension", link: "/using/vscode-extension" },
          { text: "Cursor", link: "/using/cursor" },
          { text: "AI agents (MCP)", link: "/using/mcp" },
          { text: "Playground", link: "/using/playground" },
        ],
      },
      {
        text: "Architecture",
        collapsed: false,
        items: [
          { text: "How Prism is built", link: "/architecture/overview" },
          { text: "The packages", link: "/architecture/packages" },
          { text: "Data flow", link: "/architecture/data-flow" },
          { text: "The Core SDK", link: "/architecture/core-sdk" },
          { text: "Extension points", link: "/architecture/extension-points" },
          { text: "Decisions", link: "/architecture/decisions" },
        ],
      },
      {
        text: "Reference",
        collapsed: false,
        items: [
          { text: "CLI commands", link: "/reference/cli-commands" },
          { text: "MCP tools", link: "/reference/mcp-tools" },
          { text: "Configuration", link: "/reference/configuration" },
          { text: "Troubleshooting", link: "/reference/troubleshooting" },
          { text: "Known limitations", link: "/reference/known-limitations" },
          { text: "FAQ", link: "/reference/faq" },
          { text: "Glossary", link: "/reference/glossary" },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: GITHUB }],

    editLink: {
      pattern: `${GITHUB}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },

    search: { provider: "local" },

    footer: {
      message: "Local-first. Nothing leaves your machine.",
      copyright: "Prism",
    },
  },
});
