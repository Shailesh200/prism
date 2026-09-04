import { legal } from "@/.source/server";
import { getMDXComponents } from "@/components/mdx";

/**
 * Renders a repo-root legal file (PRIVACY.md / SECURITY.md) through the same
 * MDX pipeline as the docs — real tables, headings and code instead of a
 * <pre> of raw markdown. The repo-root file stays the single source of truth;
 * the `legal` collection in source.config.ts compiles it at build time.
 */
export function LegalDoc({ file }: { file: "PRIVACY.md" | "SECURITY.md" }) {
  const doc = legal.find((entry) => entry.info.path === file);
  if (!doc) return null;
  const MDX = doc.body;
  return (
    <div className="prose max-w-none">
      <MDX components={getMDXComponents()} />
    </div>
  );
}
