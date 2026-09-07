import type { ReactNode } from "react";
import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";

type LandingChapterProps = {
  index: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  children: ReactNode;
  className?: string;
  /** Hash target for in-page links (`#playground`). */
  id?: string;
  /** Line under the body — a command, a constraint. */
  note?: ReactNode;
  /** On large screens, product UI left and copy right. Copy stays first on mobile. */
  reverse?: boolean;
};

/** Trinity-style split: copy and looping product UI, alternating sides. */
export function LandingChapter({
  index,
  title,
  body,
  href,
  cta,
  children,
  className = "",
  id,
  note,
  reverse = false,
}: LandingChapterProps) {
  return (
    <section
      {...(id ? { id } : {})}
      className={`scroll-mt-24 border-t border-fd-border px-6 py-20${className ? ` ${className}` : ""}`}
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2">
        <Reveal className={reverse ? "lg:order-2" : undefined}>
          <div className="space-y-4">
            <p className="font-mono text-xs tracking-widest text-fd-primary">
              {index}
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-fd-foreground md:text-4xl">
              {title}
            </h2>
            <p className="max-w-md text-fd-muted-foreground">{body}</p>
            {note}
            <Link href={href} className="inline-block text-sm text-fd-primary">
              {cta} →
            </Link>
          </div>
        </Reveal>
        <Reveal
          delay={0.08}
          y={24}
          className={reverse ? "lg:order-1" : undefined}
        >
          {children}
        </Reveal>
      </div>
    </section>
  );
}
