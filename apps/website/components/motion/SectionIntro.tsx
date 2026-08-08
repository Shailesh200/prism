"use client";

import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";

interface SectionIntroProps {
  index: string;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

/** Mono index · display title · one supporting line. */
export function SectionIntro({
  index,
  title,
  description,
  children,
  className = "",
}: SectionIntroProps) {
  return (
    <Reveal className={className}>
      <header className="space-y-3">
        <p className="font-mono text-xs tracking-widest text-fd-primary">
          {index}
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-fd-foreground md:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-fd-muted-foreground">{description}</p>
        ) : null}
        {children}
      </header>
    </Reveal>
  );
}
