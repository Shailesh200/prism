import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";
import { Chip } from "./pill";
import { Reveal } from "./reveal";

type Verdict = "ok" | "warn" | "bad";

const VERDICT: Record<Verdict, string> = {
  ok: "SHIP",
  warn: "NOT PROVEN",
  bad: "NO-SHIP",
};

export function Receipt({
  verdict,
  why,
  repo,
  summary,
  rows,
  prove,
  size,
}: {
  verdict: Verdict;
  why: ReactNode;
  /** Shown top right, e.g. "~/northwind". */
  repo?: string;
  summary: Array<{ n: ReactNode; label: string }>;
  rows: Array<{ k: string; v: ReactNode }>;
  /** The cheapest proof, for NOT PROVEN. */
  prove?: ReactNode;
  size?: "sm";
}) {
  return (
    <Reveal className={cx("rcpt", verdict, size)}>
      <div className="top">
        <span>Prism receipt</span>
        {repo && <span>{repo}</span>}
      </div>
      <div className="v">
        <Chip tone={verdict}>{VERDICT[verdict]}</Chip>
      </div>
      <div className="why" style={{ "--i": 1 } as CSSProperties}>
        {why}
      </div>
      <div className="sum">
        {summary.map((s, i) => (
          <div key={s.label} style={{ "--i": 2 + i * 0.4 } as CSSProperties}>
            <b>{s.n}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <div className="rows">
        {rows.map((r, i) => (
          <div
            className="rr"
            key={r.k}
            style={{ "--i": 3.2 + i } as CSSProperties}
          >
            <span className="k">{r.k}</span>
            <span>{r.v}</span>
          </div>
        ))}
      </div>
      {prove && (
        <div
          className="prove"
          style={{ "--i": 3.2 + rows.length } as CSSProperties}
        >
          <small>Prove it</small>
          {prove}
        </div>
      )}
      <div className="band" />
    </Reveal>
  );
}
