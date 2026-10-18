/**
 * The review a person reads. The finding count has no Receipt.
 * One explanation line sits in the middle. One Receipt sits at the end.
 */

import type { CodeReading } from "@repo-prism/shared";
import { paint, renderHeading } from "../output.js";

const SEVERITY_LABEL = {
  critical: "Critical",
  high: "High",
  low: "Low",
  nit: "Nit",
} as const;

function findingCount(count: number): string {
  return `${count} ${count === 1 ? "finding" : "findings"}`;
}

function section(label: string, text: string, color: boolean): string {
  return `   - ${paint(`${label}:`, "bold", color)} ${text}`;
}

/** Human text for `prism review`. Risk stays out of this text. */
export function renderReviewReading(
  reading: CodeReading,
  options: {
    readonly color: boolean;
    readonly limit: number;
    readonly beforeReceipt?: readonly string[];
  },
): string[] {
  const { color } = options;
  const lines: string[] = [
    renderHeading("Review", color),
    findingCount(reading.notes.length),
  ];

  let number = 0;
  for (const severity of ["critical", "high", "low", "nit"] as const) {
    const notes = reading.notes.filter((note) => note.severity === severity);
    if (notes.length === 0) continue;
    lines.push("", renderHeading(SEVERITY_LABEL[severity], color));
    for (const note of notes) {
      number += 1;
      lines.push(
        "",
        `${number}. ${paint(note.title, "bold", color)} (\`${note.where}\`)`,
        section("This code", note.thisCode, color),
        section("Breaks when", note.breaksWhen, color),
        section("Change", note.change, color),
        section("Left as is", note.leftAsIs, color),
      );
    }
  }

  const open = reading.targets.slice(0, options.limit);
  if (open.length > 0) {
    lines.push("", renderHeading("Still to read", color));
    for (const target of open) lines.push(`- ${target.path}`);
  }

  if (reading.receipt.why) lines.push("", reading.receipt.why);
  lines.push("", paint(reading.notChecked, "dim", color));

  const extra = options.beforeReceipt ?? [];
  if (extra.length > 0) lines.push("", ...extra);

  const tone =
    reading.receipt.verdict === "NO-SHIP"
      ? "red"
      : reading.receipt.verdict === "SHIP"
        ? "green"
        : "yellow";
  lines.push(
    "",
    renderHeading("Receipt", color),
    paint(reading.receipt.verdict, tone, color),
  );
  if (reading.receipt.next) lines.push(reading.receipt.next);
  return lines;
}
