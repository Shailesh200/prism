"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Logo } from "./logo";
import { FOOTER, GITHUB_HREF, PRODUCT_LINKS } from "@/lib/paper/nav";

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 .9l2.2 4.6 5 .7-3.6 3.5.9 5L8 12.3 3.5 14.7l.9-5L.8 6.2l5-.7z" />
    </svg>
  );
}

export function StarLink({
  className = "btn star sm",
}: {
  className?: string;
}) {
  return (
    <a
      className={className}
      href={GITHUB_HREF}
      target="_blank"
      rel="noreferrer"
    >
      <GitHubIcon />
      <span>Star on GitHub</span>
      <span className="st">
        <StarIcon />
      </span>
    </a>
  );
}

const NAV: Array<{ href: string; label: string; prefix?: boolean }> = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/docs", label: "Docs", prefix: true },
  { href: "/changelog", label: "Changelog" },
];

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const menuId = useId();
  const productOn = path.startsWith("/product");

  useEffect(() => {
    setOpen(false);
    setMobile(false);
  }, [path]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setMobile(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="beam" />
      <header className="nav">
        <div className="wrap">
          <Link href="/" aria-label="Prism home">
            <Logo variant={path.startsWith("/docs") ? "docs" : "lockup"} />
          </Link>
          <nav className="nav-links" aria-label="Primary">
            <button
              type="button"
              className={`menu-btn${productOn || open ? " on" : ""}`}
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((value) => !value)}
            >
              Product ▾
            </button>
            {NAV.map((item) => {
              const on = item.prefix
                ? path.startsWith(item.href)
                : path === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={on ? "on" : undefined}
                  aria-current={on ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="nav-right">
            <StarLink />
            <Link className="btn dark sm" href="/install">
              Install
            </Link>
          </div>
          <button
            type="button"
            className="burger"
            aria-expanded={mobile}
            aria-controls="mobile-nav"
            onClick={() => setMobile((value) => !value)}
          >
            <span
              className="sr-only"
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                overflow: "hidden",
              }}
            >
              {mobile ? "Close menu" : "Open menu"}
            </span>
            {mobile ? (
              <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>
                ×
              </span>
            ) : (
              <>
                <i />
                <i />
                <i />
              </>
            )}
          </button>
        </div>
        {open ? (
          <div id={menuId} className="product-menu" role="menu">
            {PRODUCT_LINKS.map((item) => (
              <Link key={item.href} href={item.href} role="menuitem">
                <b>{item.label}</b>
                <span>{item.text}</span>
              </Link>
            ))}
            <Link href="/how-it-works" className="wide" role="menuitem">
              <b>How it works →</b>
            </Link>
          </div>
        ) : null}
        <div
          id="mobile-nav"
          className={`mobile-panel${mobile ? " open" : ""}`}
          hidden={!mobile}
        >
          <h2>Product</h2>
          {PRODUCT_LINKS.map((item) => (
            <Link key={item.href} className="big" href={item.href}>
              {item.label}
            </Link>
          ))}
          <h2>Get started</h2>
          <Link className="big" href="/how-it-works">
            How it works
          </Link>
          <Link className="big" href="/benchmarks">
            Benchmarks
          </Link>
          <Link className="big" href="/install">
            Install
          </Link>
          <Link className="big" href="/docs">
            Docs
          </Link>
          <Link className="big" href="/changelog">
            Changelog
          </Link>
          <h2>Project</h2>
          <Link className="big" href="/open-source">
            Open source
          </Link>
          <Link className="big" href="/privacy">
            Privacy
          </Link>
          <Link className="big" href="/security">
            Security
          </Link>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 22,
            }}
          >
            <Link className="btn dark" href="/install">
              Install Prism
            </Link>
            <StarLink className="btn star" />
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="cols">
          <div>
            <Link href="/" aria-label="Prism home">
              <Logo />
            </Link>
            <p style={{ maxWidth: 300, margin: "14px 0 18px" }}>
              Right context, accurate changes and a ranked review for your AI
              coding agent. Runs on your machine.
            </p>
            <StarLink />
          </div>
          {FOOTER.map((column) => (
            <div key={column.title}>
              <h2>{column.title}</h2>
              {column.links.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="base">
          <span>
            MIT licence · <a href="https://www.prismhq.in">prismhq.in</a>
          </span>
          <a href={GITHUB_HREF}>github.com/Shailesh200/prism</a>
        </div>
      </div>
    </footer>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="paper">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <SiteHeader />
      <div id="content">{children}</div>
      <SiteFooter />
    </div>
  );
}

export function Cta() {
  return (
    <section className="sec">
      <div
        className="wrap"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          alignItems: "end",
        }}
      >
        <div>
          <h2 className="d2">
            Try it in <em>your repo.</em>
          </h2>
          <p className="lede" style={{ marginTop: 12 }}>
            One command checks the setup. Connect your agent from the install
            guide.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link className="btn dark" href="/install">
            Install guide
          </Link>
          <StarLink className="btn star" />
        </div>
      </div>
    </section>
  );
}
