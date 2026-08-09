/**
 * Render a sticky PR comment body from `prism review --json` output (M-060).
 *
 * Usage: node render-comment.mjs <review.json> > comment.md
 */

import { readFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const STICKY_MARKER = "<!-- prism-review-sticky -->";

/**
 * @param {unknown} envelope Prism `{ ok, data }` JSON or a bare review object
 * @returns {string} Markdown body including the sticky marker
 */
export function renderReviewComment(envelope) {
  const review = unwrapReview(envelope);
  const risk = Math.round(Number(review.overallRisk ?? 0));
  const band = bandLabel(risk);
  const base = review.base ?? "working tree";
  const items = Array.isArray(review.items) ? review.items : [];

  const lines = [
    STICKY_MARKER,
    "",
    "## Prism change review",
    "",
    `| | |`,
    `|---|---|`,
    `| Base | \`${base}\` |`,
    `| Overall risk | **${risk}/100** (${band}) |`,
    `| Changed files | ${items.length} |`,
    `| Affected files | ${review.totalAffectedFiles ?? "—"} |`,
    `| Tests likely affected | ${review.totalTestsAffected ?? countTests(items)} |`,
    "",
  ];

  if (items.length === 0) {
    lines.push("_No changes to review._", "");
    return lines.join("\n");
  }

  lines.push(
    "### Per-file blast",
    "",
    "| File | Risk | Affects | Tests |",
    "|---|---:|---:|---:|",
  );

  const sorted = [...items].toSorted(
    (a, b) => Number(b.risk ?? 0) - Number(a.risk ?? 0),
  );
  for (const item of sorted.slice(0, 25)) {
    const path = String(item.path ?? "");
    const itemRisk = Math.round(Number(item.risk ?? 0));
    const affects = Number(item.affectedFilesCount ?? 0);
    const tests = Array.isArray(item.testsLikelyAffected)
      ? item.testsLikelyAffected.length
      : 0;
    lines.push(
      `| \`${path}\` | ${itemRisk} (${bandLabel(itemRisk)}) | ${affects} | ${tests} |`,
    );
  }
  if (sorted.length > 25) {
    lines.push("", `_…and ${sorted.length - 25} more changed files._`);
  }

  const testsToRun = uniqueTests(sorted).slice(0, 20);
  lines.push("", "### Tests to run", "");
  if (testsToRun.length === 0) {
    lines.push("_No likely-affected tests reported._", "");
  } else {
    for (const test of testsToRun) {
      lines.push(`- \`${test}\``);
    }
    lines.push("");
  }

  lines.push(
    "<sub>Posted by the [Prism Review](https://github.com/Shailesh200/prism/tree/main/action) GitHub Action. Re-runs update this comment in place.</sub>",
    "",
  );
  return lines.join("\n");
}

function unwrapReview(envelope) {
  if (
    envelope &&
    typeof envelope === "object" &&
    "ok" in envelope &&
    envelope.ok === true &&
    "data" in envelope
  ) {
    return /** @type {{ data?: object }} */ (envelope).data ?? {};
  }
  return envelope && typeof envelope === "object" ? envelope : {};
}

function bandLabel(score) {
  if (score >= 60) return "High";
  if (score >= 20) return "Moderate";
  return "Low";
}

function countTests(items) {
  return uniqueTests(items).length;
}

function uniqueTests(items) {
  const seen = new Set();
  for (const item of items) {
    if (!Array.isArray(item.testsLikelyAffected)) continue;
    for (const path of item.testsLikelyAffected) seen.add(String(path));
  }
  return [...seen].toSorted();
}

function isMain() {
  try {
    const self = realpathSync(fileURLToPath(import.meta.url));
    const invoked = realpathSync(process.argv[1] ?? "");
    return self === invoked;
  } catch {
    return false;
  }
}

if (isMain()) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: node render-comment.mjs <review.json>");
    process.exit(2);
  }
  const envelope = JSON.parse(readFileSync(path, "utf8"));
  process.stdout.write(renderReviewComment(envelope));
}
