"use client";

import { useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useGSAP } from "@gsap/react";
import { ensureGsap, prefersReducedMotion, safeSetVisible } from "@/lib/gsap";

interface PageEnterProps {
  children: ReactNode;
  className?: string;
}

/** Soft fade-in on mount / route change — never leaves content hidden. */
export function PageEnter({ children, className = "" }: PageEnterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const gsap = ensureGsap();

      safeSetVisible(el);

      if (prefersReducedMotion()) return;

      const tween = gsap.fromTo(
        el,
        { autoAlpha: 0.35, y: 12 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
          onComplete: () => safeSetVisible(el),
        },
      );

      const safety = window.setTimeout(() => safeSetVisible(el), 800);

      return () => {
        window.clearTimeout(safety);
        tween.kill();
        safeSetVisible(el);
      };
    },
    { dependencies: [pathname] },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
