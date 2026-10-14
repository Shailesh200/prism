/**
 * `prism` with no subcommand (M-097). Index, print a report card, write
 * graph.html. Findings are only the measured ones: a cycle, an untested
 * hotspot, an orphan. Nothing is uploaded.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphReportData, HealthScore } from "@repo-prism/shared";
import { ok } from "@repo-prism/shared";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import { writeGraphFiles } from "./graph.js";
import type { CommandHandler } from "../runtime.js";

export type ReportCardInput = {
  readonly repository: string;
  readonly health: HealthScore | null;
  readonly domains: readonly string[];
  readonly report: GraphReportData;
};

export function renderReportCard(input: ReportCardInput): string {
  const lines: string[] = ["Prism", ""];
  const health = input.health;
  lines.push(
    health
      ? `${input.repository}  ·  health ${Math.round(health.score)} (${health.grade})`
      : input.repository,
  );
  if (input.domains.length > 0) {
    lines.push(input.domains.slice(0, 4).join(" · "));
  }
  if (health) {
    const factors = [...health.factors]
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
    if (factors.length > 0) {
      lines.push(
        "",
        "What holds the score down",
        ...factors.map(
          (factor) => `  ${factor.label}  ${Math.round(factor.score)}`,
        ),
      );
    }
  }
  const findings = cardFindings(input.report);
  lines.push("", "Findings");
  if (findings.length === 0) {
    lines.push(
      "  No cycle, untested hotspot, or orphan in the measured graph.",
    );
  } else {
    for (const finding of findings) {
      lines.push(`  ${finding.title}`, `  ${finding.why}`, "");
    }
  }
  lines.push("Next: add Prism to your editor, or run prism graph open.");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function cardFindings(
  report: GraphReportData,
): { title: string; why: string }[] {
  const out: { title: string; why: string }[] = [];
  const cycle = report.cycles[0];
  if (cycle && cycle.length > 0) {
    out.push({
      title: `Cycle  ${cycle[0]}`,
      why: "These files import each other. A change in one cannot land alone.",
    });
  }
  const hotspot = report.untestedHotspots[0];
  if (hotspot) {
    out.push({
      title: `Untested  ${hotspot.path}`,
      why: `Imported by ${hotspot.importedBy} files, and no test reaches it.`,
    });
  }
  const orphan = report.orphans[0];
  if (orphan) {
    out.push({
      title: `Orphan  ${orphan}`,
      why: "Nothing imports it, and it imports nothing.",
    });
  }
  return out.slice(0, 3);
}

export function healthBadgeSvg(score: number, grade: string): string {
  const rounded = Math.round(score);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="20" role="img" aria-label="health ${rounded}">
  <rect width="128" height="20" fill="#0f1419"/>
  <text x="8" y="14" fill="#8b9bab" font-family="ui-sans-serif,system-ui" font-size="11">health ${rounded} ${grade}</text>
</svg>
`;
}

export const firstRunCommand: CommandHandler = async (context) => {
  context.progress("Indexing…");
  const opened = await context.open();
  if (!opened.ok) return opened;
  const workspace = opened.value;
  const exported = await workspace.exportGraph();
  if (!exported.ok) return exported;
  const healthResult = await workspace.getHealth();
  const stack = await workspace.getStackProfile();
  const health = healthResult.ok ? healthResult.value : null;
  const domains = stack.ok ? stack.value.domains : [];
  const card = renderReportCard({
    repository: exported.value.graph.repository,
    health,
    domains,
    report: exported.value.report,
  });
  const out = join(workspacePrismDir(workspace.rootPath), "graph");
  const files = writeGraphFiles(out, exported.value);
  if (context.args.flag("badge") && health) {
    const badgeDir = join(workspace.rootPath, ".prism");
    mkdirSync(badgeDir, { recursive: true });
    writeFileSync(
      join(badgeDir, "health.svg"),
      healthBadgeSvg(health.score, health.grade),
    );
  }
  if (!context.args.flag("noOpen") && process.stdout.isTTY) {
    const { spawn } = await import("node:child_process");
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    const child = spawn(command, [files.html], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }
  return ok({
    data: {
      repository: exported.value.graph.repository,
      health: health ? { score: health.score, grade: health.grade } : null,
      findings: cardFindings(exported.value.report),
      graph: files.html,
    },
    human: () => card,
  });
};
