"use client";

import { useEffect, useState } from "react";
import {
  GITHUB,
  GITHUB_API_REPO,
  formatStarCount,
  parseStarCount,
} from "@/lib/github";
import { prismhqEvents, trackProps } from "@/lib/pulse";

type GitHubStarProps = {
  size?: "sm" | "lg";
};

/**
 * Prism-styled GitHub control.
 *
 * GitHub will not star a repo from another origin without the visitor's
 * OAuth token (PUT /user/starred/…). This control matches site chrome and
 * opens the public repo, where Star is one click. Do not also pass
 * `githubUrl` to fumadocs.
 */
export function GitHubStar({ size = "sm" }: GitHubStarProps) {
  const [count, setCount] = useState<number | null>(null);
  const large = size === "lg";

  useEffect(() => {
    let cancelled = false;
    fetch(GITHUB_API_REPO, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!cancelled) setCount(parseStarCount(payload));
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label =
    count === null
      ? "Star Shailesh200/prism on GitHub"
      : count === 1
        ? "Star Shailesh200/prism on GitHub, 1 star"
        : `Star Shailesh200/prism on GitHub, ${count} stars`;

  return (
    <a
      href={GITHUB}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      {...trackProps(prismhqEvents.ctaClick, "github")}
      className={
        large
          ? "group inline-flex h-10 items-center gap-2 rounded-md border border-fd-primary bg-transparent px-4 font-mono text-sm text-fd-primary transition hover:bg-fd-primary hover:text-fd-primary-foreground"
          : "group inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-[color-mix(in_oklab,var(--prism-brand)_40%,var(--prism-line))] bg-transparent px-2.5 font-mono text-[11px] text-fd-primary transition hover:border-fd-primary hover:bg-[color-mix(in_oklab,var(--prism-brand)_14%,transparent)]"
      }
    >
      <GitHubIcon className={large ? "size-4" : "size-3.5"} />
      <span className="whitespace-nowrap">Star on GitHub</span>
      {count !== null ? (
        <span
          className={
            large
              ? "border-l border-fd-primary/40 pl-2 tabular-nums"
              : "border-l border-fd-primary/35 pl-1.5 tabular-nums"
          }
        >
          {formatStarCount(count)}
        </span>
      ) : null}
    </a>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
