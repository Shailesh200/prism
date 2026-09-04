import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import Link from "next/link";
import type { Metadata } from "next";
import { PageEnter } from "@/components/motion/PageEnter";
import { StaggerGrid } from "@/components/motion/StaggerGrid";
import { SectionIntro } from "@/components/motion/SectionIntro";
import { SiteFooter } from "@/components/site-footer";

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
    href: "/docs/guides/dispatch#local-workers",
    title: "Dispatch a teammate",
    body: "Hand a change to a background teammate in your editor; Prism runs the checks when it stops.",
  },
  {
    href: "/docs/guides/dispatch#talk-in-chat",
    title: "Start my day",
    body: "A standup briefing: yesterday's jobs, what's waiting, suggested focus.",
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
      <PageEnter>
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 py-16">
          <SectionIntro
            index="Nº FEATURES"
            title="Features"
            description="Task guides first. The capability table is the exhaustive index."
          />
          <StaggerGrid items="li">
            <ul className="divide-y divide-fd-border border-y border-fd-border">
              {FEATURES.map((f, i) => (
                <li key={f.href}>
                  <Link
                    href={f.href}
                    className="group flex flex-col gap-2 py-5 transition sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
                  >
                    <div className="flex items-baseline gap-4">
                      <span className="font-mono text-xs text-fd-primary">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-display text-lg font-medium text-fd-foreground group-hover:text-fd-primary">
                        {f.title}
                      </span>
                    </div>
                    <p className="max-w-md text-sm text-fd-muted-foreground sm:text-right">
                      {f.body}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </StaggerGrid>
        </main>
      </PageEnter>
      <SiteFooter />
    </HomeLayout>
  );
}
