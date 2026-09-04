"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Magnetic } from "@/components/motion/Magnetic";
import { useGSAP } from "@gsap/react";
import { CopyInstall } from "@/components/copy-install";
import { HeroConstellation } from "@/components/hero-constellation";
import {
  ensureGsap,
  prefersReducedMotion,
  safeSetVisible,
  SplitText,
} from "@/lib/gsap";

export function HomeHero() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const gsap = ensureGsap();

      const mark = root.querySelector("[data-hero-mark]");
      const title = root.querySelector("[data-hero-title]");
      const sub = root.querySelector("[data-hero-sub]");
      const meta = root.querySelector("[data-hero-meta]");
      const actions = root.querySelector("[data-hero-actions]");
      const install = root.querySelector("[data-hero-install]");

      const copy = [mark, title, sub, meta, actions, install].filter(Boolean);
      gsap.set(copy, {
        clearProps: "opacity,visibility,transform",
        autoAlpha: 1,
      });

      if (prefersReducedMotion()) return;

      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });

      if (mark) {
        tl.from(mark, { autoAlpha: 0, y: 12, duration: 0.5 }, 0);
      }

      if (title) {
        const split = SplitText.create(title, { type: "chars", mask: "chars" });
        tl.from(
          split.chars,
          { yPercent: 110, stagger: 0.03, duration: 0.85, ease: "power4.out" },
          0.1,
        );
      }

      if (sub) {
        tl.from(sub, { y: 16, autoAlpha: 0, duration: 0.55 }, 0.45);
      }

      if (meta) {
        tl.from(meta, { y: 12, autoAlpha: 0, duration: 0.45 }, 0.6);
      }

      if (actions) {
        tl.from(actions, { y: 14, autoAlpha: 0, duration: 0.45 }, 0.7);
      }

      if (install) {
        tl.from(install, { y: 14, autoAlpha: 0, duration: 0.45 }, 0.85);
      }

      return () => {
        safeSetVisible(copy);
      };
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      className="relative grid min-h-[92svh] w-full grid-cols-1 overflow-hidden lg:grid-cols-2"
    >
      <div className="relative z-10 flex flex-col justify-center gap-8 px-6 py-16 md:px-12 lg:py-24">
        <div data-hero-mark>
          <Image
            src="/brand/prism-mark.png"
            alt=""
            width={56}
            height={56}
            className="rounded-lg"
            priority
          />
        </div>
        <div className="space-y-5">
          <h1
            data-hero-title
            className="font-display text-5xl font-semibold tracking-tight text-fd-foreground md:text-7xl"
          >
            Prism
          </h1>
          <p
            data-hero-sub
            className="max-w-md text-lg text-fd-muted-foreground md:text-xl"
          >
            Turn a repository into terrain you can navigate.
          </p>
          <p
            data-hero-meta
            className="max-w-md font-mono text-xs tracking-wide text-fd-foreground md:text-sm"
          >
            Local-first · Answers without a model · No account
          </p>
        </div>
        <div data-hero-actions className="flex flex-wrap gap-3">
          <Magnetic>
            <Link
              href="/docs/start/install"
              className="inline-block rounded-md bg-fd-primary px-4 py-2.5 text-sm font-medium text-fd-primary-foreground"
            >
              Get started
            </Link>
          </Magnetic>
          <Link
            href="/docs"
            className="rounded-md border border-fd-border px-4 py-2.5 text-sm text-fd-foreground"
          >
            Read the docs
          </Link>
        </div>
        <div data-hero-install className="max-w-xl">
          <CopyInstall />
        </div>
      </div>
      <div className="relative min-h-[300px] border-t border-fd-border lg:min-h-0 lg:border-l lg:border-t-0">
        <HeroConstellation />
      </div>
    </section>
  );
}
