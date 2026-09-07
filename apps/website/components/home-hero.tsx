"use client";

import { useRef } from "react";
import Link from "next/link";
import { Magnetic } from "@/components/motion/Magnetic";
import { useGSAP } from "@gsap/react";
import { CopyCommand } from "@/components/copy-command";
import { GitHubStar } from "@/components/github-star";
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

      const kicker = root.querySelector("[data-hero-kicker]");
      const title = root.querySelector("[data-hero-title]");
      const sub = root.querySelector("[data-hero-sub]");
      const actions = root.querySelector("[data-hero-actions]");
      const install = root.querySelector("[data-hero-install]");

      const copy = [kicker, title, sub, actions, install].filter(Boolean);
      gsap.set(copy, {
        clearProps: "opacity,visibility,transform",
        autoAlpha: 1,
      });

      if (prefersReducedMotion()) return;

      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });

      if (kicker) {
        tl.from(kicker, { autoAlpha: 0, y: 12, duration: 0.45 }, 0);
      }

      if (title) {
        const split = SplitText.create(title, { type: "words", mask: "words" });
        tl.from(
          split.words,
          { yPercent: 110, stagger: 0.04, duration: 0.85, ease: "power4.out" },
          0.08,
        );
      }

      if (sub) {
        tl.from(sub, { y: 16, autoAlpha: 0, duration: 0.5 }, 0.4);
      }

      if (actions) {
        tl.from(actions, { y: 14, autoAlpha: 0, duration: 0.45 }, 0.55);
      }

      if (install) {
        tl.from(install, { y: 14, autoAlpha: 0, duration: 0.45 }, 0.7);
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
      className="relative overflow-hidden px-6 pb-12 pt-16 md:pt-24"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
        <p
          data-hero-kicker
          className="font-mono text-xs tracking-widest text-fd-primary"
        >
          Local-first · No account · No model
        </p>
        <h1
          data-hero-title
          className="mt-6 max-w-4xl text-balance font-display text-4xl font-semibold tracking-tight sm:text-6xl md:text-7xl"
        >
          <span className="text-fd-foreground">Software intelligence.</span>{" "}
          <span className="text-fd-primary">A teammate for every agent.</span>
        </h1>
        <p
          data-hero-sub
          className="mt-6 max-w-2xl text-base text-fd-muted-foreground md:text-lg"
        >
          Not a coding model. Local software intelligence — maps, blast radius,
          and health for the repo on your machine. Dispatch is the teammate: it
          runs in the agent you already have, on any MCP host.
        </p>
        <div
          data-hero-actions
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Magnetic>
            <Link
              href="/install"
              className="inline-block rounded-md bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground"
            >
              Get started
            </Link>
          </Magnetic>
          <GitHubStar size="lg" />
        </div>
        <div data-hero-install className="mt-8 w-full max-w-xl">
          <CopyCommand command="npx -y @repo-prism/cli doctor" />
        </div>
      </div>
    </section>
  );
}
