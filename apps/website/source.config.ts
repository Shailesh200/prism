import {
  defineCollections,
  defineConfig,
  defineDocs,
  frontmatterSchema,
} from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
  dir: "../../docs",
  docs: {
    files: ["**/*.{md,mdx}", "!architecture/**"],
  },
  meta: {
    files: ["**/meta.json", "!architecture/**"],
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

/** Release highlight posts for /whats-new/[slug]. */
export const posts = defineCollections({
  type: "doc",
  dir: "content/posts",
  schema: frontmatterSchema.extend({
    version: z.string().optional(),
  }),
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    },
  },
});
