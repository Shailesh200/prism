import { defineConfig, defineDocs } from "fumadocs-mdx/config";

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
