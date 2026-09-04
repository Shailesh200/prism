import Link from "next/link";
import { GITHUB } from "@/lib/layout.shared";

/**
 * Site footer for the marketing pages.
 *
 * Server component — no motion, no client JS. The footer is where crawlers
 * and readers who scroll to the bottom expect the sitemap to live, so every
 * link here is a plain anchor and the columns mirror the docs structure.
 */

const COLUMNS: Array<{
  title: string;
  links: Array<{ href: string; label: string }>;
}> = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/products", label: "Products" },
      { href: "/benchmarks", label: "Benchmarks" },
      { href: "/whats-new", label: "What's new" },
    ],
  },
  {
    title: "Docs",
    links: [
      { href: "/docs/what-is-prism", label: "What is Prism" },
      { href: "/docs/start/install", label: "Install" },
      { href: "/docs/usage", label: "Usage" },
      { href: "/docs/guides/understand-a-repo", label: "Task guides" },
      { href: "/docs/guides/dispatch", label: "Dispatch" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/docs/help/faq", label: "FAQ" },
      { href: "/docs/help/troubleshooting", label: "Troubleshooting" },
      { href: "/docs/help/known-limitations", label: "Known limitations" },
      { href: "/docs/reference/capabilities", label: "Capabilities" },
      { href: "/docs/reference/mcp-tools", label: "MCP tools" },
    ],
  },
  {
    title: "Project",
    links: [
      { href: GITHUB, label: "GitHub" },
      { href: "/privacy", label: "Privacy" },
      { href: "/security", label: "Security" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-fd-border px-6 py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={`Footer — ${col.title}`}>
              <h2 className="font-mono text-xs tracking-widest text-fd-primary">
                {col.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-fd-muted-foreground transition hover:text-fd-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t border-fd-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fd-muted-foreground">
            Prism — local-first software intelligence.
          </p>
          <p className="font-mono text-xs text-fd-muted-foreground">
            No account · No network calls · Your code stays on your machine
          </p>
        </div>
      </div>
    </footer>
  );
}
