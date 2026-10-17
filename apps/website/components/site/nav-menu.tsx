"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { HOW_IT_WORKS, NAV_LINKS, PRODUCTS, SHEET_GROUPS } from "@/lib/nav";
import { Logo } from "./logo";

function useIsActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(`${href}/`);
}

/** Desktop links: the Product dropdown, then the plain links. The current page gets the underline. */
export function NavLinks() {
  const isActive = useIsActive();
  const [open, setOpen] = useState(false);
  // Opened by hovering: a click then keeps it open instead of closing it.
  const hovered = useRef(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!host.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <nav className="links" aria-label="Main">
      <div
        ref={host}
        className="pmenu-host"
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse") return;
          hovered.current = true;
          setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse" || !hovered.current) return;
          hovered.current = false;
          setOpen(false);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
      >
        <button
          type="button"
          className={isActive("/product") ? "on" : undefined}
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => {
            if (hovered.current) hovered.current = false;
            else setOpen((o) => !o);
          }}
        >
          Product
          <svg className="chev" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </button>
        {open && (
          <div className="pmenu" onClick={() => setOpen(false)}>
            <div>
              {PRODUCTS.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className={isActive(p.href) ? "on" : undefined}
                >
                  <b>{p.label}</b>
                  <span>{p.blurb}</span>
                </Link>
              ))}
              <Link href={HOW_IT_WORKS.href} className="all">
                <b>{HOW_IT_WORKS.label} →</b>
              </Link>
            </div>
          </div>
        )}
      </div>
      {NAV_LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={isActive(l.href) ? "on" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Burger and the full-screen sheet shown below 860px. */
/** `star` is the server-rendered Star button, so the count needs no client fetch. */
export function MobileMenu({ star }: { star: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="burger"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <i />
        <i />
        <i />
      </button>
      {open && (
        <div
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          <div className="top">
            <Logo />
            <button
              type="button"
              className="close"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="grp">
            <div className="eyebrow">Product</div>
            {PRODUCTS.map((p) => (
              <Link key={p.href} href={p.href}>
                {p.label}
              </Link>
            ))}
          </div>
          {SHEET_GROUPS.map((g) => (
            <div className="grp" key={g.title}>
              <div className="eyebrow">{g.title}</div>
              {g.links.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
          <div className="acts">
            <Button href="/install">Install Prism</Button>
            {star}
          </div>
        </div>
      )}
    </>
  );
}
