"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";

const SURFACES = [
  {
    href: "/docs/start/install",
    title: "CLI",
    body: "prism commands for terminals and CI.",
  },
  {
    href: "/docs/start/install",
    title: "AI agents (MCP)",
    body: "Prepare, Guard, the stop receipt, findings, and the graph — nine default tools.",
  },
  {
    href: "/docs/guides/envelope",
    title: "Envelope",
    body: "The local index, plus a receipt for every Prism tool call. Never source.",
  },
  {
    href: "/docs/guides/prepare-a-change",
    title: "Prepare",
    body: "One call before you edit: pack, reuse, House Style, work order.",
  },
  {
    href: "/docs/guides/guard-a-session",
    title: "Guard",
    body: "Rank this session’s dirty files so you read the high-blast ones first.",
  },
] as const;

export function SurfacesStrip() {
  return (
    <section className="border-t border-fd-border px-6 py-20">
      <div className="mx-auto w-full max-w-5xl space-y-10">
        <Reveal>
          <div className="space-y-3">
            <p className="font-mono text-xs tracking-widest text-fd-primary">
              Nº10
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-fd-foreground md:text-3xl">
              One engine, every surface
            </h2>
            <p className="max-w-md text-fd-muted-foreground">
              Install where you work. Every surface calls the same Core, and
              reads the same local index.
            </p>
          </div>
        </Reveal>
        <ul className="divide-y divide-fd-border border-y border-fd-border">
          {SURFACES.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.06} y={14}>
              <li>
                <Link
                  href={s.href}
                  className="group flex flex-col gap-2 py-5 transition sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
                >
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-xs text-fd-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-display text-lg font-medium text-fd-foreground group-hover:text-fd-primary md:text-xl">
                      {s.title}
                    </span>
                  </div>
                  <p className="max-w-md text-sm text-fd-muted-foreground sm:text-right">
                    {s.body}
                  </p>
                </Link>
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
