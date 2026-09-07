import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";
import Link from "next/link";
import { GitHubStar } from "@/components/github-star";
import { GITHUB } from "@/lib/github";

export { GITHUB };

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
      {
        type: "menu",
        text: "Product",
        url: "/products",
        items: [
          {
            text: "Playground",
            url: "/products#playground",
            description: "Spectrum, DNA, blast, and domains — local.",
          },
          {
            text: "Intelligence",
            url: "/products#intelligence",
            description: "DNA, blast radius, and stack domains.",
          },
          {
            text: "Dispatch",
            url: "/products#dispatch",
            description: "Hand a change to a teammate.",
          },
        ],
      },
      { text: "Docs", url: "/docs", active: "nested-url" },
      { text: "Install", url: "/install" },
      { text: "What's new", url: "/whats-new" },
      { text: "Benchmarks", url: "/benchmarks" },
      {
        type: "custom",
        secondary: true,
        children: <GitHubStar />,
      },
      {
        type: "custom",
        secondary: true,
        children: (
          <Link
            href="/install"
            className="inline-flex h-8 items-center rounded-md border border-fd-border bg-fd-secondary px-3 text-sm font-medium text-fd-primary transition hover:border-fd-primary hover:bg-fd-accent"
          >
            Get started
          </Link>
        ),
      },
    ],
    // Star lives in links[] as GitHubStar — do not also set githubUrl.
  };
}
