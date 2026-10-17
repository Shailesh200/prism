import type { ReactNode } from "react";
import { InfoIcon } from "./icons";

export function Callout({
  tone = "brand",
  title,
  children,
}: {
  tone?: "brand" | "info";
  title?: string;
  children: ReactNode;
}) {
  if (tone === "brand") return <div className="callout">{children}</div>;
  return (
    <div className="info">
      <span className="ii">
        <InfoIcon />
      </span>
      <div>
        {title && <b>{title}</b>}
        <div className="tx">{children}</div>
      </div>
    </div>
  );
}
