import { defineConfig, defineDocs, frontmatterSchema } from "fumadocs-mdx/config";
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

export const posts = defineDocs({
  dir: "content/posts",
  docs: {
    schema: frontmatterSchema.extend({
      version: z.string().optional(),
    }),
  },
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
