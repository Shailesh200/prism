import Link from "next/link";
import type { ReactNode } from "react";
import { PointGrid } from "./blocks";
import { Cta } from "./shell";
import { EmTitle } from "./rich";
import { PRODUCT_LINKS } from "@/lib/paper/nav";

export function ProductView({
  slug,
  title,
  lede,
  visual,
  caption,
  points,
  children,
}: {
  slug: string;
  title: string;
  lede: string;
  visual: ReactNode;
  caption: ReactNode;
  points: Array<{ title: string; text: string }>;
  children?: ReactNode;
}) {
  const current = PRODUCT_LINKS.find((item) => item.href === `/product/${slug}`);
  return (
    <>
      <div className="subnav">
        <div className="wrap">
          <span className="eyebrow" style={{ marginRight: 12 }}>
            Product
          </span>
          {PRODUCT_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className={item.href.endsWith(`/${slug}`) ? "on" : undefined}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <section style={{ padding: "72px 0 80px" }}>
        <div className="wrap grid2">
          <div>
            <div className="eyebrow">{current?.label}</div>
            <h1 className="d2" style={{ margin: "16px 0 20px" }}>
              <EmTitle text={title} />
            </h1>
            <p className="lede">{lede}</p>
          </div>
          <div>
            {visual}
            <p className="cap">{caption}</p>
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="wrap">
          <PointGrid items={points} />
        </div>
      </section>
      {children}
      <Cta />
    </>
  );
}

export function Split({
  eyebrow,
  title,
  text,
  visual,
}: {
  eyebrow?: string;
  title: string;
  text: ReactNode;
  visual: ReactNode;
}) {
  return (
    <section className="sec">
      <div className="wrap grid2" style={{ gridTemplateColumns: "minmax(0,.8fr) minmax(0,1.2fr)" }}>
        <div>
          {eyebrow ? <div className="eyebrow" style={{ marginBottom: 12 }}>{eyebrow}</div> : null}
          <h2 className="d3">
            <EmTitle text={title} />
          </h2>
          <div className="lede" style={{ marginTop: 14, fontSize: 18 }}>
            {text}
          </div>
        </div>
        <div>{visual}</div>
      </div>
    </section>
  );
}
