import { createElement, type ReactNode } from "react";

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function safeHref(href: string): string | null {
  if (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("mailto:")
  ) {
    return href;
  }
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") return href;
  } catch {
    return null;
  }
  return null;
}

/** Render changelog / highlight inline markup (**bold**, `code`, [links](url)). */
export function renderInlineMarkdown(text: string): ReactNode {
  const parts = text.split(TOKEN);
  return parts.map((part, index) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return createElement("strong", { key: index }, bold[1]);

    const code = /^`([^`]+)`$/.exec(part);
    if (code) return createElement("code", { key: index }, code[1]);

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const href = safeHref(link[2]);
      if (!href) return link[1];
      const external =
        href.startsWith("http://") || href.startsWith("https://");
      return createElement(
        "a",
        {
          key: index,
          href,
          ...(external ? { target: "_blank", rel: "noreferrer" } : {}),
        },
        link[1],
      );
    }

    return part;
  });
}
