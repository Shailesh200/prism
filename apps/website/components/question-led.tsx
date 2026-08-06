import Link from "next/link";

const QUESTIONS = [
  {
    q: "What is in this repo?",
    a: "DNA, the map, and stack detection orient you without reading every file.",
    href: "/docs/guides/understand-a-repo",
    cta: "Understand a repo",
  },
  {
    q: "What breaks if I change this?",
    a: "Blast radius traces dependents, tests, and features before you edit.",
    href: "/docs/guides/before-you-edit",
    cta: "Before you edit",
  },
  {
    q: "Is the codebase getting healthier?",
    a: "Engineering health and trends show drift, debt, and hotspots over time.",
    href: "/docs/guides/track-health",
    cta: "Track health",
  },
];

export function QuestionLed() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20">
      <h2 className="mb-10 max-w-xl text-3xl font-semibold tracking-tight text-fd-foreground md:text-4xl">
        Three questions Prism answers
      </h2>
      <div className="grid gap-6 md:grid-cols-3">
        {QUESTIONS.map((item, i) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex flex-col gap-4 border-t border-fd-border pt-6 transition hover:border-fd-primary"
          >
            <span className="font-mono text-xs text-fd-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-xl font-medium tracking-tight text-fd-foreground md:text-2xl">
              {item.q}
            </h3>
            <p className="flex-1 text-sm leading-relaxed text-fd-muted-foreground">
              {item.a}
            </p>
            <span className="text-sm text-fd-primary group-hover:underline">
              {item.cta} →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
