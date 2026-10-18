import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { CtaBand } from "@/components/ui/cta-band";
import { PageHero } from "@/components/ui/page-hero";
import { JsonLd } from "@/components/json-ld";
import { PRODUCTS } from "@/lib/nav";
import { breadcrumbJsonLd } from "@/lib/seo";
import { ProductStrip } from "./product-strip";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

/** Chrome shared by every /product/<slug> page: nav, the product strip, the closing CTA and the footer. */
export function ProductPage({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const href = `/product/${slug}`;
  const label = PRODUCTS.find((item) => item.href === href)?.label ?? slug;
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Product", path: PRODUCTS[0].href },
          { name: label, path: href },
        ])}
      />
      <SiteNav />
      <ProductStrip current={href} />
      <main>
        {children}
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}

/** The top of a product page: the headline on the left, the chat/terminal pair and its caption on the right. */
export function ProductHero({
  title,
  lede,
  pair,
  caption,
  actions,
}: {
  title: ReactNode;
  lede: ReactNode;
  pair: ReactNode;
  caption?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <PageHero
      title={title}
      lede={lede}
      actions={actions}
      aside={
        <>
          {pair}
          {caption && <p className="cap">{caption}</p>}
        </>
      }
    />
  );
}

/** A titled section with a chat/terminal pair beside it. */
export function ExampleRow({
  eyebrow,
  title,
  lede,
  children,
  note,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede: ReactNode;
  children: ReactNode;
  /** A short note under the row, inside the same section. */
  note?: ReactNode;
}) {
  return (
    <section className="sec">
      <Container className="grid2 grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] xrow">
        <div className="xrow-copy">
          {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
          <h2 className="d3">{title}</h2>
          <p className="lede mt-3.5 text-lg">{lede}</p>
        </div>
        <div>{children}</div>
      </Container>
      {note && <Container className="mt-6">{note}</Container>}
    </section>
  );
}

/** A row of three feature `Card`s. */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <section className="sec">
      <Container>
        <div className="grid3">{children}</div>
      </Container>
    </section>
  );
}
