import {
  defineCollections,
  defineConfig,
  defineDocs,
  frontmatterSchema,
} from "fumadocs-mdx/config";
import lastModified from "fumadocs-mdx/plugins/last-modified";
import { z } from "zod";

export const docs = defineDocs({
  dir: "../../docs",
  docs: {
    files: [
      "**/*.{md,mdx}",
      "!architecture/**",
      "!guides/wire-into-ci.mdx",
      // Held until round 5 passes (Prepare and Lenses), and benchmark docs
      // with token and cost numbers.
      "!guides/prepare-a-change.mdx",
      "!guides/before-you-edit.mdx",
      "!guides/lenses.mdx",
      "!guides/remember-context.mdx",
      "!benchmarks/**",
    ],
    schema: frontmatterSchema.extend({
      source: z.string().optional(),
    }),
    // Plain Markdown of each page, for /llms-full.txt.
    postprocess: { includeProcessedMarkdown: true },
  },
  meta: {
    files: ["**/meta.json", "!architecture/**", "!benchmarks/**"],
  },
});

export const adminDocs = defineDocs({
  dir: "../../docs/architecture",
});

/**
 * Repo-root legal files, rendered with the same MDX pipeline as the docs so
 * /privacy and /security get real tables and headings instead of a <pre>.
 * content/legal holds symlinks to the repo-root files — the root file stays
 * the single source of truth, and the watcher sees a two-file directory
 * instead of the whole repository (pointing a collection at `../../` scans
 * every node_modules in the repo and dies EMFILE).
 */
export const legal = defineCollections({
  type: "doc",
  dir: "content/legal",
});

/** Release highlight posts for /changelog/[slug]. */
export const posts = defineCollections({
  type: "doc",
  dir: "content/posts",
  schema: frontmatterSchema.extend({
    version: z.string().optional(),
  }),
});

export default defineConfig({
  // Each docs page's last commit time, for the sitemap and TechArticle.
  plugins: [lastModified({ filter: (collection) => collection === "docs" })],
  mdxOptions: {
    rehypeCodeOptions: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    },
  },
});
