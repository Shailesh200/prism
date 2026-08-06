import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features",
  description:
    "What Prism can do — maps, blast radius, health, domains, and more.",
};

const FEATURES = [
  {
    href: "/docs/guides/understand-a-repo",
    title: "Orient in a new repo",
    body: "DNA, map, landmarks, and stack profile.",
  },
  {
    href: "/docs/guides/before-you-edit",
    title: "Blast before you edit",
    body: "See dependents, tests, and features in the blast radius.",
  },
  {
    href: "/docs/guides/review-a-pr",
    title: "Review a change",
    body: "Diff-aware impact for pull requests.",
  },
  {
    href: "/docs/guides/delete-safely",
    title: "Delete safely",
    body: "Check whether a symbol or file still has dependents.",
  },
  {
    href: "/docs/guides/track-health",
    title: "Track health",
    body: "Engineering health scores and history.",
  },
  {
    href: "/docs/guides/investigate-domain",
    title: "Domain deep dives",
    body: "Frontend, backend, testing, and security reports.",
  },
  {
    href: "/docs/guides/wire-into-ci",
    title: "CI gates",
    body: "Run Prism in pipelines with fail-on thresholds.",
  },
  {
    href: "/docs/reference/capabilities",
    title: "Full capability table",
    body: "Every command and MCP tool in one lookup.",
  },
];

export default function FeaturesPage() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-16">
        <header className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight">Features</h1>
          <p className="max-w-2xl text-fd-muted-foreground">
            Task guides first. The capability table is the exhaustive index.
          </p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="rounded-xl border border-fd-border p-5 hover:border-[var(--prism-brand,#00c2c2)]"
            >
              <div className="font-medium">{f.title}</div>
              <p className="mt-2 text-sm text-fd-muted-foreground">{f.body}</p>
            </Link>
          ))}
        </div>
      </main>
    </HomeLayout>
  );
}
