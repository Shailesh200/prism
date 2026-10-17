import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Window } from "@/components/ui/window";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main>
        <section className="py-9 sm:pt-[110px] sm:pb-[130px]">
          <Container className="grid2">
            <div>
              <div className="eyebrow">404</div>
              <h1 className="d1 mt-[18px] mb-5">
                This page is <em>off the map.</em>
              </h1>
              <p className="lede">
                The link may be old. Try the docs or go back home.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button href="/">Back home</Button>
                <Button href="/docs" variant="line">
                  Open the docs
                </Button>
              </div>
              <nav aria-label="Popular pages" className="mt-7">
                <ul className="flex flex-wrap gap-x-5 gap-y-2 text-ink2">
                  <li>
                    <Link href="/install">Install Prism</Link>
                  </li>
                  <li>
                    <Link href="/product/prepare">Prepare</Link>
                  </li>
                  <li>
                    <Link href="/product/review">Review</Link>
                  </li>
                  <li>
                    <Link href="/how-it-works">How it works</Link>
                  </li>
                  <li>
                    <Link href="/benchmarks">Benchmarks</Link>
                  </li>
                  <li>
                    <Link href="/changelog">Changelog</Link>
                  </li>
                </ul>
              </nav>
            </div>
            <Window title="~/northwind">
              <span className="ln">
                <span className="d">$ </span>prism blast src/this-page.ts
              </span>
              <span className="ln">
                <span className="r">PRISM_NOT_FOUND</span>: File not found in
                index: src/this-page.ts
              </span>
            </Window>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
