/**
 * Three ways to show a change receipt (M-092): plain text for a terminal and
 * the agent, markdown for a PR comment, and an SVG card for sharing. Pure, so
 * the stop hook, the CLI and the GitHub Action all render the same thing.
 */

import {
  blockingChecks,
  offLimitsTouched,
  preexistingFailures,
  shipVerdict,
  shipVerdictLabel,
  type ChangeReceipt,
  type ReceiptLensLine,
  type ReceiptProof,
  type ShipVerdict,
} from "./receipt.js";
import type { Finding } from "./schemas.js";
import { sessionValueLine } from "./session-value.js";
import { findingsFromReceiptParts } from "./structured-finding.js";

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The first line of every rendering: the verdict (plan P11). */
export function receiptHeadline(receipt: ChangeReceipt): string {
  if (nothingChanged(receipt)) return "Prism · nothing changed";
  const verdict = shipVerdict(receipt);
  if (verdict === "NO-SHIP") {
    const failed = blockingChecks(receipt).length;
    const offLimits = offLimitsTouched(receipt).length;
    const why = [
      ...(failed > 0 ? [`${plural(failed, "check")} failed`] : []),
      ...(offLimits > 0 ? [`${plural(offLimits, "off-limits path")}`] : []),
      ...(receipt.reason === "wrong_result" ? ["wrong result"] : []),
    ];
    return `Prism · NO-SHIP (${why.join(", ")})`;
  }
  return `Prism · ${shipVerdictLabel(receipt)}`;
}

/** A clean tree: `proven` with nothing to show. */
export function nothingChanged(receipt: ChangeReceipt): boolean {
  return receipt.touched.totalFiles === 0 && receipt.unsupported.length === 0;
}

/**
 * The one line the plan's smoke test reads (Appendix C SMK-8):
 * `Prism receipt: changed 1 file, 3 dependents, N tests reach it — SHIP`.
 */
export function receiptSummaryLine(receipt: ChangeReceipt): string {
  const verdict = shipVerdictLabel(receipt);
  const changed = receipt.touched.totalFiles + receipt.unsupported.length;
  const more = receipt.touched.truncated ? "+" : "";
  return `Prism receipt: changed ${changed}${more} ${changed === 1 ? "file" : "files"}, ${plural(receipt.touched.dependents, "dependent")}, ${plural(receipt.testFiles.length, "test")} reach it — ${verdict}`;
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
  if (receipt.checksState === "pending") parts.push("checks still running");
  else if (receipt.testMode === "skipped") parts.push("checks not run");
  return parts;
}

/**
 * Structured findings (P18), derived from flags + lens checks when absent,
 * ordered by agreement (P11): a file several sources flag comes before a
 * single-source finding, then higher risk first. Stable otherwise.
 */
export function receiptFindings(receipt: ChangeReceipt): Finding[] {
  const findings = receipt.findings ?? findingsFromReceiptParts(receipt);
  const sourcesByFile = new Map<string, Set<string>>();
  for (const f of findings) {
    const set = sourcesByFile.get(f.where) ?? new Set<string>();
    for (const source of f.sources) set.add(source);
    sourcesByFile.set(f.where, set);
  }
  for (const check of blockingChecks(receipt)) {
    for (const where of sourcesByFile.keys()) {
      if (check.detail.includes(where))
        sourcesByFile.get(where)!.add(check.name);
    }
  }
  const agreement = (f: Finding) => sourcesByFile.get(f.where)?.size ?? 1;
  const risk = { high: 2, med: 1, low: 0 } as const;
  return findings
    .map((f, i) => ({ f, i }))
    .sort(
      (a, b) =>
        agreement(b.f) - agreement(a.f) ||
        risk[b.f.riskIfSkipped] - risk[a.f.riskIfSkipped] ||
        a.i - b.i,
    )
    .map((row) => row.f);
}

/** `run: <command> (in pkg, ~4 s) → proves a.ts, b.ts` (P11). */
export function proofLine(proof: ReceiptProof): string {
  const where = proof.cwd === "." ? "" : `in ${proof.cwd}, `;
  const time =
    proof.estimateMs === undefined
      ? ""
      : `~${Math.max(1, Math.round(proof.estimateMs / 1000))} s`;
  const meta = `${where}${time}`.replace(/, $/, "");
  const proves = proof.proves.slice(0, 3).join(", ");
  const more = proof.proves.length > 3 ? ` +${proof.proves.length - 3}` : "";
  return `run: ${proof.command}${meta ? ` (${meta})` : ""} → proves ${proves}${more}`;
}

/** `where — what → fix (risk)`: one line, every field (P18). */
function findingLine(f: Finding): string {
  return `${f.where} — ${f.what} → ${f.fix} (${f.riskIfSkipped} risk)`;
}

const LENS_MARK = { pass: "✓", concern: "△", fail: "✗" } as const;

/** Five seconds to read. Plain text, safe for a terminal and a chat. */
export function renderReceipt(
  receipt: ChangeReceipt,
  lenses: readonly ReceiptLensLine[] = receipt.lenses ?? [],
): string {
  const pad = (label: string): string => label.padEnd(15, " ");
  const earlier = receipt.earlier
    ? [`${pad("Earlier change")} ${receipt.earlier.summary}`]
    : [];
  if (nothingChanged(receipt))
    return [receiptHeadline(receipt), ...earlier].join("\n");
  // The summary line already says what was touched (files, dependents).
  const lines = [
    receiptHeadline(receipt),
    receiptSummaryLine(receipt),
    ...earlier,
  ];
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
  for (const check of receipt.checks.filter((c) => c.status === "timeout")) {
    lines.push(`${pad("Timed out")} ${check.name} — ${check.detail}`);
  }
  for (const f of receiptFindings(receipt).slice(0, 4)) {
    lines.push(`${pad("Finding")} ${findingLine(f)}`);
  }
  for (const item of receipt.notProven.slice(0, 5)) {
    lines.push(`${pad("Not proven")} ${item.path} — ${item.reason}`);
  }
  if (receipt.notProven.length > 5) {
    lines.push(`${pad("")} …and ${receipt.notProven.length - 5} more`);
  }
  if (receipt.proof)
    lines.push(`${pad("Prove it")} ${proofLine(receipt.proof)}`);
  if (receipt.unsupported.length > 0) {
    lines.push(
      `${pad("Not analysed")} ${receipt.unsupported.slice(0, 5).join(", ")}${receipt.unsupported.length > 5 ? ", …" : ""} (TypeScript and JavaScript only in 2.0)`,
    );
  }
  const value = receipt.value ? sessionValueLine(receipt.value) : null;
  if (value) lines.push(value);
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
  if (nothingChanged(receipt)) return lines.join("\n").trimEnd();
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
  for (const f of receiptFindings(receipt).slice(0, 6)) {
    lines.push(`| Finding | ${cell(findingLine(f))} |`);
  }
  for (const item of receipt.notProven.slice(0, 10)) {
    lines.push(
      `| Not proven | \`${cell(item.path)}\` — ${cell(item.reason)} |`,
    );
  }
  if (receipt.proof) {
    lines.push(`| Prove it | ${cell(proofLine(receipt.proof))} |`);
  }
  const value = receipt.value ? sessionValueLine(receipt.value) : null;
  if (value)
    lines.push(
      `| This session | ${cell(value.replace(/^Prism this session: /, ""))} |`,
    );
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

const VERDICT_COLOR: Record<ShipVerdict, string> = {
  SHIP: "#16a34a",
  "NOT PROVEN": "#d97706",
  "NO-SHIP": "#dc2626",
};

/** A 600px-wide card for sharing. Self-contained SVG, system fonts only. */
export function renderReceiptSvg(receipt: ChangeReceipt): string {
  const rows: [string, string][] = [];
  if (!nothingChanged(receipt)) {
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
    `<rect width="8" height="${height}" rx="4" fill="${nothingChanged(receipt) ? "#6b7280" : VERDICT_COLOR[shipVerdict(receipt)]}"/>`,
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
