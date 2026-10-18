import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/** `children` sits in a <p>, so keep it to inline content. */
export function Card({
  icon,
  title,
  children,
  fx = true,
  level = 3,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  fx?: boolean;
  /** 2 when the cards sit straight under the page h1. */
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={cx("card", fx && "fx")}>
      {icon && <span className="ic">{icon}</span>}
      <Heading className="t">{title}</Heading>
      <p>{children}</p>
    </div>
  );
}

export function FeatureList({
  items,
}: {
  items: Array<{ title: string; body: ReactNode; href?: string }>;
}) {
  return (
    <div className="flist">
      {items.map((item) => (
        <div key={item.title}>
          <span className="ck">✓</span>
          <div>
            {item.href ? (
              <Link href={item.href}>
                <b>{item.title}</b>
              </Link>
            ) : (
              <b>{item.title}</b>
            )}
            <p>{item.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A big serif number with a plain-words caption. */
export function Stat({
  n,
  unit,
  children,
}: {
  n: string;
  unit?: string;
  children: ReactNode;
}) {
  return (
    <div className="card stat">
      <div className="num">
        {n}
        {unit && <small>{unit}</small>}
      </div>
      <p>{children}</p>
    </div>
  );
}

export function Steps({
  items,
}: {
  items: Array<{ title: string; body: ReactNode }>;
}) {
  return (
    <div className="steps">
      {items.map((item, i) => (
        <div className="step" key={item.title}>
          <div className="n">{i + 1}</div>
          <div>
            <h3 className="t">{item.title}</h3>
            <p>{item.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
