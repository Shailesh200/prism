import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";

export const GITHUB = "https://github.com/Shailesh200/prism";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image
            src="/brand/prism-mark.png"
            alt=""
            width={24}
            height={24}
            className="rounded-sm"
          />
          <span className="font-semibold tracking-tight">Prism</span>
        </>
      ),
      url: "/",
    },
    links: [
      { text: "Docs", url: "/docs", active: "nested-url" },
      { text: "Features", url: "/features" },
      { text: "Products", url: "/products" },
      { text: "What's new", url: "/whats-new" },
    ],
    // Single GitHub control — do not also add a links[] icon (duplicates).
    githubUrl: GITHUB,
  };
}
