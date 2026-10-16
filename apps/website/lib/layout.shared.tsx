import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";
import Link from "next/link";
import { GitHubStar } from "@/components/github-star";
import { GITHUB } from "@/lib/github";
import { prismhqEvents, trackProps } from "@/lib/pulse";

export { GITHUB };

/** Prompt lockup. The image already contains the wordmark. */
export function BrandLockup({
  variant = "horizontal",
  height = 24,
  alt = "Prism",
}: {
  variant?: "horizontal" | "docs" | "mark";
  height?: number;
  alt?: string;
}) {
  const spec = {
    horizontal: {
      dark: "/brand/horizontal-dark.png",
      light: "/brand/horizontal-light.png",
      width: Math.round((height * 150) / 32),
    },
    docs: {
      dark: "/brand/docs-header-dark.png",
      light: "/brand/docs-header-light.png",
      width: Math.round((height * 224) / 28),
    },
    mark: {
      dark: "/brand/mark-dark.png",
      light: "/brand/mark-light.png",
      width: height,
    },
  }[variant];

  return (
    <span className="inline-flex items-center">
      <Image
        src={spec.dark}
        alt={alt}
        width={spec.width}
        height={height}
        className="logo-on-dark h-auto w-auto"
        style={{ height, width: "auto" }}
      />
      <Image
        src={spec.light}
        alt=""
        width={spec.width}
        height={height}
        className="logo-on-light h-auto w-auto"
        style={{ height, width: "auto" }}
      />
    </span>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <BrandLockup />,
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
            text: "Envelope",
            url: "/products#envelope",
            description: "Receipts for Intelligence calls. Never source.",
          },
          {
            text: "Prepare",
            url: "/products#prepare",
            description: "Pack, reuse, House Style — no file bodies.",
          },
          {
            text: "Guard",
            url: "/products#guard",
            description: "Read the dirty files that can actually hurt.",
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
            {...trackProps(prismhqEvents.ctaClick, "nav-get-started")}
          >
            Get started
          </Link>
        ),
      },
    ],
    // Star lives in links[] as GitHubStar — do not also set githubUrl.
  };
}
