"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { PRODUCTS } from "@/lib/nav";
import { Container } from "@/components/ui/container";

/** The sticky product strip. On a narrow screen it scrolls sideways, starting at the current page. */
export function ProductStrip({ current }: { current: string }) {
  const on = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    on.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, []);
  return (
    <nav aria-label="Product" className="pnav">
      <Container>
        <span className="eyebrow mr-3">Product</span>
        {PRODUCTS.map((p) => (
          <Link
            key={p.href}
            ref={p.href === current ? on : undefined}
            href={p.href}
            aria-current={p.href === current ? "page" : undefined}
          >
            {p.label}
          </Link>
        ))}
      </Container>
    </nav>
  );
}
