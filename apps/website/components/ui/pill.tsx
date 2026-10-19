import type { ReactNode } from "react";

export function Pill({
  tone,
  children,
}: {
  tone?: "ok" | "warn" | "bad" | "tool" | "brand";
  children: ReactNode;
}) {
  return <span className={tone ? `pill ${tone}` : "pill"}>{children}</span>;
}

/** Verdict chip: SHIP, NOT PROVEN, NO-SHIP. */
export function Chip({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  return <span className={`chip ${tone}`}>{children}</span>;
}
