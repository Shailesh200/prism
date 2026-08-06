import Link from "next/link";
import type { ReactNode } from "react";
import { getAdoptionSnapshot } from "@/lib/adoption";
import { Sparkline } from "@/components/sparkline";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const revalidate = 3600;

const ARCH_LINKS = [
  { href: "/admin/docs/overview", label: "How Prism is built" },
  { href: "/admin/docs/packages", label: "Packages" },
  { href: "/admin/docs/data-flow", label: "Data flow" },
  { href: "/admin/docs/core-sdk", label: "Core SDK" },
  { href: "/admin/docs/extension-points", label: "Extension points" },
  { href: "/admin/docs/decisions", label: "Decisions" },
];

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function Badge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "neutral";
  children: ReactNode;
}) {
  const tones = {
    ok: "border-emerald-500/40 text-emerald-400",
    warn: "border-amber-500/40 text-amber-400",
    bad: "border-rose-500/40 text-rose-400",
    neutral: "border-fd-border text-fd-muted-foreground",
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Instrument({
  label,
  value,
  series,
  hint,
}: {
  label: string;
  value: string;
  series?: number[];
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2 border border-fd-border bg-fd-card/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-fd-muted-foreground">
          {label}
        </span>
        {hint ? (
          <span className="font-mono text-[10px] text-fd-muted-foreground">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-semibold tabular-nums tracking-tight text-fd-foreground">
        {value}
      </div>
      {series && series.length > 1 ? <Sparkline values={series} /> : null}
    </div>
  );
}

export default async function AdminPage() {
  const snap = await getAdoptionSnapshot();
  const docsOk =
    snap.docsHealth.missingDescription === 0 &&
    snap.docsHealth.overBudget === 0;
  const feedErrors = [
    snap.github.error,
    snap.marketplace.error,
    snap.openVsx.error,
  ].filter(Boolean);

  const cliSeries =
    snap.npm.find((p) => p.name === "@repo-prism/cli")?.series ?? [];
  const mcpSeries =
    snap.npm.find((p) => p.name === "@repo-prism/mcp-server")?.series ?? [];

  return (
    <main className="min-h-screen bg-fd-background text-fd-foreground">
      <div className="border-b border-fd-border px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-fd-primary">ADMIN</span>
            <h1 className="text-lg font-semibold tracking-tight">
              Product console
            </h1>
          </div>
          <div className="flex gap-4 text-sm">
            <Link href="/admin/docs" className="text-fd-primary">
              Architecture docs
            </Link>
            <Link href="/" className="text-fd-muted-foreground">
              Public site
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-0 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: mission + instruments */}
        <div className="space-y-8 border-fd-border px-6 py-10 lg:border-r">
          {/* Mission brief */}
          <section className="space-y-3 border border-fd-border bg-fd-card/30 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">mission brief</Badge>
              <Badge tone={docsOk ? "ok" : "warn"}>
                docs {docsOk ? "clean" : "needs attention"}
              </Badge>
              <Badge tone={feedErrors.length ? "warn" : "ok"}>
                feeds {feedErrors.length ? "partial" : "ok"}
              </Badge>
            </div>
            <p className="text-xl font-medium tracking-tight md:text-2xl">
              <span className="text-fd-primary">
                {snap.release.latest ?? "—"}
              </span>
              {" · "}
              {fmt(snap.marketplace.installs)} Marketplace installs
              {" · "}
              {fmt(snap.github.stars)} stars
              {" · "}
              {snap.docsHealth.pages} public docs pages
            </p>
            <p className="text-sm text-fd-muted-foreground">
              Snapshot {new Date(snap.fetchedAt).toLocaleString("en-GB")} · ISR
              1h · public APIs only · no product telemetry
            </p>
          </section>

          {/* Instrument panel */}
          <section className="space-y-3">
            <h2 className="font-mono text-xs uppercase tracking-wider text-fd-muted-foreground">
              Instruments
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Instrument
                label="Marketplace"
                value={fmt(snap.marketplace.installs)}
                hint={
                  snap.marketplace.rating != null
                    ? `★ ${snap.marketplace.rating.toFixed(1)}`
                    : undefined
                }
              />
              <Instrument
                label="Open VSX"
                value={fmt(snap.openVsx.downloads)}
              />
              <Instrument label="GitHub stars" value={fmt(snap.github.stars)} />
              <Instrument
                label="Open issues"
                value={fmt(snap.github.openIssues)}
              />
              <Instrument
                label="CLI npm / 30d"
                value={fmt(
                  snap.npm.find((p) => p.name === "@repo-prism/cli")?.downloads,
                )}
                series={cliSeries}
                hint="daily"
              />
              <Instrument
                label="MCP npm / 30d"
                value={fmt(
                  snap.npm.find((p) => p.name === "@repo-prism/mcp-server")
                    ?.downloads,
                )}
                series={mcpSeries}
                hint="daily"
              />
              <Instrument
                label="CLI commands"
                value={fmt(snap.surfaces.cliCommands)}
              />
              <Instrument
                label="MCP tools"
                value={fmt(snap.surfaces.mcpTools)}
              />
              <Instrument
                label="Changelog entries"
                value={fmt(snap.release.entries)}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-mono text-xs uppercase tracking-wider text-fd-muted-foreground">
              Docs health
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              <Instrument label="Pages" value={fmt(snap.docsHealth.pages)} />
              <Instrument
                label="Missing description"
                value={fmt(snap.docsHealth.missingDescription)}
              />
              <Instrument
                label="Over word budget"
                value={fmt(snap.docsHealth.overBudget)}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-mono text-xs uppercase tracking-wider text-fd-muted-foreground">
              npm packages / 30d
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {snap.npm.map((pkg) => (
                <Instrument
                  key={pkg.name}
                  label={pkg.name}
                  value={fmt(pkg.downloads)}
                  series={pkg.series}
                />
              ))}
            </div>
          </section>

          {feedErrors.length > 0 ? (
            <p className="font-mono text-xs text-amber-400">
              Feed warnings: {feedErrors.join(" · ")}
            </p>
          ) : null}

          <p className="text-xs text-fd-muted-foreground">
            Website traffic: enable Vercel Web Analytics on the project (not
            duplicated here).
          </p>
        </div>

        {/* Right: architecture console */}
        <aside className="space-y-6 bg-[color-mix(in_oklab,var(--prism-panel)_40%,transparent)] px-6 py-10">
          <div className="space-y-2">
            <h2 className="font-mono text-xs uppercase tracking-wider text-fd-primary">
              Architecture
            </h2>
            <p className="text-sm text-fd-muted-foreground">
              Internal docs — same markdown as the repo, served only under
              /admin/docs.
            </p>
          </div>
          <ul className="space-y-1">
            {ARCH_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block border-b border-fd-border py-3 text-sm text-fd-foreground transition hover:text-fd-primary"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/admin/docs"
            className="inline-flex rounded-md border border-fd-border px-3 py-2 text-sm text-fd-primary"
          >
            Open docs index →
          </Link>
        </aside>
      </div>
    </main>
  );
}
