import type { ReactNode } from "react";
import { cx } from "./cx";

/** Dark chat or terminal frame. Colour lines with `.d .g .y .r .b .w` spans and `.ln` rows. */
export function Window({
  title,
  kind = "term",
  children,
}: {
  title: string;
  kind?: "chat" | "term";
  children: ReactNode;
}) {
  return (
    <div className="vis dark">
      <div className="bar">
        <i />
        <i />
        <i />
        <b>{title}</b>
      </div>
      <div className={cx("body", kind === "chat" && "chat")}>{children}</div>
    </div>
  );
}

const WHO = { you: "You", prism: "Prism", agent: "Agent" } as const;

export function Bubble({
  who,
  name,
  children,
}: {
  who: keyof typeof WHO;
  /** Label above the text; defaults to You, Prism or Agent. */
  name?: string;
  children: ReactNode;
}) {
  return (
    <div className={`bub ${who}`}>
      <span className="who">{name ?? WHO[who]}</span>
      {children}
    </div>
  );
}

export function ToolTag({ children }: { children: ReactNode }) {
  return <span className="tl">{children}</span>;
}
