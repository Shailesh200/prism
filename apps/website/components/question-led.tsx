"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";

const QUESTIONS = [
  {
    q: "What is in this repo?",
    a: "DNA, the map, and stack detection orient you without reading every file.",
    href: "/docs/guides/understand-a-repo",
    cta: "Understand a repo",
  },
  {
    q: "What should I open for this task?",
    a: "Prepare returns a pack, reuse, and House Style — paths only, never file bodies.",
    href: "/docs/guides/prepare-a-change",
    cta: "Prepare a change",
  },
  {
    q: "What breaks if I change this?",
    a: "Blast radius traces dependents, tests, and features before you edit.",
    href: "/docs/guides/before-you-edit",
    cta: "Before you edit",
  },
  {
    q: "What should I read first after a messy session?",
    a: "Guard ranks this session’s dirty files by blast. Pre-existing dirt stays out.",
    href: "/docs/guides/guard-a-session",
    cta: "Guard a session",
  },
  {
    q: "Did the agent dump the repo?",
    a: "Envelope is the receipt: bytes kept vs dump, truncated lists that admitted it.",
    href: "/docs/guides/envelope",
    cta: "Envelope and Iris",
  },
  {
    q: "Is the codebase getting healthier?",
    a: "Findings stay open until a re-scan drops the fingerprint. Health tracks the rest.",
    href: "/docs/guides/findings",
    cta: "Findings",
  },
];

export function QuestionLed() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20">
      <Reveal>
        <div className="mb-10 space-y-3">
          <p className="font-mono text-xs tracking-widest text-fd-primary">
            Nº09
          </p>
          <h2 className="max-w-xl font-display text-3xl font-semibold tracking-tight text-fd-foreground md:text-4xl">
            Questions Prism answers
          </h2>
        </div>
      </Reveal>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {QUESTIONS.map((item, i) => (
          <Reveal key={item.href} delay={i * 0.08} y={16}>
            <Link
              href={item.href}
              className="group flex h-full flex-col gap-4 border-t border-fd-border pt-6 transition hover:border-fd-primary"
            >
              <span className="font-mono text-xs text-fd-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display text-xl font-medium tracking-tight text-fd-foreground md:text-2xl">
                {item.q}
              </h3>
              <p className="flex-1 text-sm leading-relaxed text-fd-muted-foreground">
                {item.a}
              </p>
              <span className="text-sm text-fd-primary group-hover:underline">
                {item.cta} →
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
