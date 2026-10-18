import { source } from "@/lib/source";
import { SITE_DESCRIPTION, siteOrigin } from "@/lib/seo";

// Built once: every docs page as plain Markdown, for answer engines.
export const dynamic = "force-static";

export async function GET() {
  const site = siteOrigin();
  const pages = await Promise.all(
    source.getPages().map(async (page) => {
      const text = await page.data.getText("processed");
      return `# ${page.data.title}\n\nURL: ${site}${page.url}\n${
        page.data.description ? `\n${page.data.description}\n` : ""
      }\n${text.trim()}\n`;
    }),
  );
  const body = `# Prism documentation\n\n> ${SITE_DESCRIPTION}\n\nThe short map is ${site}/llms.txt.\n\n${pages.join("\n---\n\n")}`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
