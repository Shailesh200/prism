/**
 * Three ways to show a change receipt (M-092): plain text for a terminal and
 * the agent, markdown for a PR comment, and an SVG card for sharing. Pure, so
 * the stop hook, the CLI and the GitHub Action all render the same thing.
 */

import {
  blockingChecks,
  preexistingFailures,
  type ChangeReceipt,
  type ReceiptLensLine,
} from "./receipt.js";

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The first line of every rendering: the verdict. */
export function receiptHeadline(receipt: ChangeReceipt): string {
  switch (receipt.verdict) {
    case "clean":
      return "Prism · nothing changed";
    case "failed":
      return `Prism · failed (${plural(blockingChecks(receipt).length, "check")})`;
    case "unproven":
      return `Prism · unproven (${plural(receipt.notProven.length, "file")})`;
    default:
      return "Prism · proven";
  }
}

function touchedLine(receipt: ChangeReceipt): string {
  const more = receipt.touched.truncated ? "+" : "";
  return `${plural(receipt.touched.totalFiles, "file")}${more} · ${plural(receipt.touched.dependents, "dependent")}`;
}

function provenParts(receipt: ChangeReceipt): string[] {
  const parts = receipt.checks
    .filter((c) => c.status === "passed")
    .map((c) => `${c.name} ✓`);
  if (receipt.testMode === "scoped" && receipt.testFiles.length > 0) {
    parts.unshift(plural(receipt.testFiles.length, "scoped test file"));
  }
  if (receipt.testMode === "skipped") parts.push("checks not run");
  return parts;
}

const LENS_MARK = { pass: "✓", concern: "△", fail: "✗" } as const;

/** Five seconds to read. Plain text, safe for a terminal and a chat. */
export function renderReceipt(
  receipt: ChangeReceipt,
  lenses: readonly ReceiptLensLine[] = receipt.lenses ?? [],
): string {
  if (receipt.verdict === "clean") return receiptHeadline(receipt);
  const pad = (label: string): string => label.padEnd(15, " ");
  const lines = [receiptHeadline(receipt)];
  lines.push(`${pad("Touched")} ${touchedLine(receipt)}`);
  const proven = provenParts(receipt);
  if (proven.length > 0) lines.push(`${pad("Proven")} ${proven.join(" · ")}`);
  for (const check of blockingChecks(receipt)) {
    const unknown = check.cause === "unknown" ? " (baseline unknown)" : "";
    lines.push(
      `${pad("Failed")} ${check.name} ✗ ${check.detail}${unknown}`.trimEnd(),
    );
  }
  for (const check of preexistingFailures(receipt)) {
    lines.push(`${pad("Already failing")} ${check.name} — ${check.detail}`);
  }
  for (const item of receipt.notProven.slice(0, 5)) {
    lines.push(`${pad("Not proven")} ${item.path} — ${item.reason}`);
  }
  if (receipt.notProven.length > 5) {
    lines.push(`${pad("")} …and ${receipt.notProven.length - 5} more`);
  }
  for (const flag of receipt.flags.slice(0, 4)) {
    lines.push(`${pad("Flag")} ${flag.kind}: ${flag.path} — ${flag.detail}`);
  }
  if (receipt.envelope) lines.push(`${pad("Envelope")} ${receipt.envelope}`);
  if (lenses.length > 0) {
    lines.push(
      `${pad("Lenses")} ${lenses
        .map(
          (l) =>
            `${l.lens} ${LENS_MARK[l.verdict]}${l.summary ? ` ${l.summary}` : ""}`,
        )
        .join(" · ")}`,
    );
  }
  return lines.join("\n");
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** For a PR comment. GitHub-flavoured markdown, no HTML. */
export function renderReceiptMarkdown(receipt: ChangeReceipt): string {
  const lines = [`### ${receiptHeadline(receipt)}`, ""];
  if (receipt.verdict === "clean") return lines.join("\n").trimEnd();
  lines.push("| | |", "|---|---|", `| Touched | ${touchedLine(receipt)} |`);
  const proven = provenParts(receipt);
  if (proven.length > 0) lines.push(`| Proven | ${cell(proven.join(" · "))} |`);
  for (const check of blockingChecks(receipt)) {
    lines.push(
      `| **Failed** | \`${cell(check.name)}\` — ${cell(check.detail)} |`,
    );
  }
  for (const check of preexistingFailures(receipt)) {
    lines.push(
      `| Already failing | \`${cell(check.name)}\` — ${cell(check.detail)} |`,
    );
  }
  for (const item of receipt.notProven.slice(0, 10)) {
    lines.push(
      `| Not proven | \`${cell(item.path)}\` — ${cell(item.reason)} |`,
    );
  }
  for (const flag of receipt.flags.slice(0, 6)) {
    lines.push(
      `| Flag | ${flag.kind}: \`${cell(flag.path)}\` — ${cell(flag.detail)} |`,
    );
  }
  if (receipt.envelope) lines.push(`| Envelope | ${cell(receipt.envelope)} |`);
  lines.push(
    "",
    `<sub>Checks ran locally in ${(receipt.durationMs / 1000).toFixed(1)}s. Prism calls no model.</sub>`,
  );
  return lines.join("\n");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const VERDICT_COLOR: Record<ChangeReceipt["verdict"], string> = {
  clean: "#6b7280",
  proven: "#16a34a",
  unproven: "#d97706",
  failed: "#dc2626",
};

/** A 600px-wide card for sharing. Self-contained SVG, system fonts only. */
export function renderReceiptSvg(receipt: ChangeReceipt): string {
  const rows: [string, string][] = [];
  if (receipt.verdict !== "clean") {
    rows.push(["Touched", touchedLine(receipt)]);
    const proven = provenParts(receipt);
    if (proven.length > 0) rows.push(["Proven", proven.join(" · ")]);
    for (const check of blockingChecks(receipt).slice(0, 3)) {
      rows.push(["Failed", `${check.name} — ${check.detail}`]);
    }
    for (const check of preexistingFailures(receipt).slice(0, 2)) {
      rows.push(["Already failing", check.name]);
    }
    for (const item of receipt.notProven.slice(0, 3)) {
      rows.push(["Not proven", item.path]);
    }
  }
  const clip = (text: string, max: number): string =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;
  const height = 96 + rows.length * 28;
  const body = rows
    .map(
      ([label, value], i) =>
        `<text x="24" y="${100 + i * 28}" fill="#6b7280" font-size="14">${escapeXml(label)}</text>` +
        `<text x="160" y="${100 + i * 28}" fill="#111827" font-size="14">${escapeXml(clip(value, 60))}</text>`,
    )
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${height}" viewBox="0 0 600 ${height}" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif">`,
    `<rect width="600" height="${height}" rx="12" fill="#ffffff" stroke="#e5e7eb"/>`,
    `<rect width="8" height="${height}" rx="4" fill="${VERDICT_COLOR[receipt.verdict]}"/>`,
    `<text x="24" y="52" fill="#111827" font-size="22" font-weight="600">${escapeXml(receiptHeadline(receipt))}</text>`,
    body,
    `</svg>`,
  ].join("");
}

/** What the agent must act on, or null when there is nothing to fix. */
export function receiptFeedback(receipt: ChangeReceipt): string | null {
  const failed = blockingChecks(receipt);
  if (failed.length === 0) return null;
  const lines = [
    "Prism ran the checks this change reaches and they failed. Fix these before finishing:",
    ...failed.map((c) => `- ${c.name}: ${c.detail}`),
  ];
  const already = preexistingFailures(receipt);
  if (already.length > 0) {
    lines.push(
      `Already failing before this session, not yours to fix: ${already.map((c) => c.name).join(", ")}.`,
    );
  }
  if (receipt.testMode === "scoped" && receipt.testFiles.length > 0) {
    lines.push(
      `Scoped tests: ${receipt.testFiles.slice(0, 10).join(", ")}${receipt.testFiles.length > 10 ? ", …" : ""}`,
    );
  }
  return lines.join("\n");
}
