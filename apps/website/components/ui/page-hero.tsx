import type { ReactNode } from "react";
import { Container } from "./container";

export function PageHero({
  eyebrow,
  title,
  lede,
  actions,
  aside,
}: {
  eyebrow?: string;
  /** Serif headline; wrap the italic part in <em>. */
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  /** A visual beside the text. Makes the hero two columns with the smaller headline. */
  aside?: ReactNode;
}) {
  const text = (
    <div>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 className={aside ? "d2" : "d1"}>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
  return (
    <section className="phero">
      {aside ? (
        <Container className="grid2">
          {text}
          <div>{aside}</div>
        </Container>
      ) : (
        <Container>{text}</Container>
      )}
    </section>
  );
}
