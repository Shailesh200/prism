"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";

const SURFACES = [
  {
    href: "/docs/cli/install",
    title: "CLI",
    body: "prism commands for terminals and CI.",
  },
  {
    href: "/docs/ide/install",
    title: "IDE extension",
    body: "VS Code and Cursor — same Map and blast UI.",
  },
  {
    href: "/docs/mcp/install",
    title: "AI agents (MCP)",
    body: "Structure for agents — Prism does not write code.",
  },
  {
    href: "/docs/start/playground",
    title: "Playground",
    body: "Local web UI over the same Core SDK.",
  },
] as const;

export function SurfacesStrip() {
  return (
    <section className="border-t border-fd-border px-6 py-20">
      <div className="mx-auto w-full max-w-5xl space-y-10">
        <Reveal>
          <div className="space-y-3">
            <p className="font-mono text-xs tracking-widest text-fd-primary">
              Nº04
            </p>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-fd-foreground md:text-3xl">
              One engine, four surfaces
            </h2>
            <p className="max-w-md text-fd-muted-foreground">
              Install where you work. Every surface calls the same Core.
            </p>
          </div>
        </Reveal>
        <ul className="divide-y divide-fd-border border-y border-fd-border">
          {SURFACES.map((s, i) => (
            <Reveal key={s.href} delay={i * 0.06} y={14}>
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
