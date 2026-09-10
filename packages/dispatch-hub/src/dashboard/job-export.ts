import {
  jobUsageLine,
  type JobConsolePage,
  type JobSummary,
} from "@repo-prism/app-shell";
import { showConsoleToast } from "./console-toast.js";
import { getJson, readToken } from "./session.js";

export function jobLogsFilename(title: string): string {
  const slug =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "job";
  return `${slug}-logs.md`;
}

function stamp(iso: string | undefined, label: string): string | undefined {
  if (!iso?.trim()) return undefined;
  return `${label}: ${iso}`;
}

function entryHeading(entry: JobConsolePage["entries"][number]): string {
  const bits = [entry.ts, entry.phase];
  if (entry.tool) bits.push(entry.tool);
  if (entry.level === "error") bits.push("error");
  return bits.join(" · ");
}

export function formatJobLogsMarkdown(
  job: JobSummary,
  page: JobConsolePage,
): string {
  const usage = jobUsageLine(job.tokenUsage);
  const meta = [
    `Status: ${job.status}`,
    job.workspaceLabel ? `Repository: ${job.workspaceLabel}` : undefined,
    stamp(job.createdAt, "Created"),
    stamp(job.queuedAt, "Queued"),
    stamp(job.startedAt, "Started"),
    stamp(job.finishedAt, "Finished"),
    stamp(job.lastHeartbeat, "Last activity"),
    job.workerModel ? `Model: ${job.workerModel}` : undefined,
    usage ? `Tokens: ${usage}` : undefined,
  ].filter((line): line is string => Boolean(line));

  const brief = job.prd?.trim() ? ["## Brief", "", job.prd.trim(), ""] : [];

  const cap =
    page.truncated && page.totalCount > page.entries.length
      ? `Latest ${page.entries.length} of ${page.totalCount} console lines.`
      : undefined;

  const consoleBody =
    page.entries.length === 0
      ? "_No console lines yet._"
      : page.entries
          .map((entry) => {
            const body = entry.text.trim() || "_empty_";
            return `### ${entryHeading(entry)}\n\n${body}`;
          })
          .join("\n\n");

  return [
    `# ${job.title.trim() || "Job"}`,
    "",
    ...meta.map((line) => `- ${line}`),
    "",
    ...brief,
    "## Console",
    "",
    ...(cap ? [cap, ""] : []),
    consoleBody,
    "",
  ].join("\n");
}

function downloadMarkdown(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportJobLogs(job: JobSummary): Promise<void> {
  const token = readToken();
  if (!token) {
    showConsoleToast("Could not export logs.", "error");
    return;
  }
  const params = new URLSearchParams({ limit: "2000" });
  if (job.workspacePath) params.set("workspace", job.workspacePath);
  try {
    const page = await getJson<JobConsolePage>(
      `/api/jobs/${encodeURIComponent(job.id)}/logs?${params}`,
      token,
    );
    downloadMarkdown(
      jobLogsFilename(job.title),
      formatJobLogsMarkdown(job, page),
    );
    showConsoleToast("Exported logs.");
  } catch {
    showConsoleToast("Could not export logs.", "error");
  }
}
