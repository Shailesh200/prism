import { isMissingGitRepoMessage } from "./git.js";
import { displayJobId, isOpaqueJobId } from "./job-id.js";
import type { JobRecord } from "./types.js";

export function jobRef(job: { id: string; title: string }): string {
  const title = job.title.trim();
  const id = displayJobId(job);
  if (!title) return id;
  if (title.toLowerCase() === id.toLowerCase()) return title;
  return `${title} (${id})`;
}

export function statusPhrase(status: string): string {
  switch (status) {
    case "booting":
      return "starting";
    case "waiting_on_you":
      return "waiting on you";
    case "blocked":
      return "stuck";
    case "error":
      return "stopped";
    case "cancelled":
      return "cancelled";
    case "done":
      return "done";
    case "paused":
      return "paused";
    case "ready":
      return "ready";
    case "running":
      return "running";
    default:
      return status.replaceAll("_", " ");
  }
}

export function agentNameForJob(job: { id: string; title: string }): string {
  const title = job.title.trim() || displayJobId(job);
  const name = `Prism · ${title}`;
  return name.length > 80 ? `${name.slice(0, 77)}…` : name;
}

export function signedInSpeak(email?: string): string {
  return email?.trim() ? `You're set as ${email.trim()}.` : "You're set.";
}

export function needsSignInSpeak(): string {
  return [
    "A Cursor sign-in page should open in your browser. Finish that, then we can start jobs.",
    "If you see Authenticating prism with Skip, click Skip — that card is not the sign-in.",
  ].join(" ");
}

export function initSpeak(ready: boolean, email?: string): string {
  if (!ready) return needsSignInSpeak();
  return `${signedInSpeak(email)} Say “start working on …” with a ticket and what you want done.`;
}

export function missingGitRepoSpeak(): string {
  return [
    "Prism does not see a git repository here, so it cannot start a teammate.",
    "Open the project folder that contains .git — or set PRISM_WORKSPACE to that path — then reload prism and retry.",
  ].join(" ");
}

export function gitFailureSpeak(detail: string): string {
  if (isMissingGitRepoMessage(detail)) return missingGitRepoSpeak();
  const cleaned = stripSecrets(detail);
  return cleaned
    ? `Could not prepare a place for the teammate (${cleaned}).`
    : "Could not prepare a place for the teammate. Open the git project folder and retry.";
}

export function doctorSpeak(
  checks: readonly { id: string; ok: boolean }[],
): string {
  const byId = Object.fromEntries(checks.map((check) => [check.id, check.ok]));
  if (byId.git === false) return missingGitRepoSpeak();
  if (byId.cursor_workers === false) return needsSignInSpeak();
  if (byId.cursor_sdk === false) {
    return "Reload the prism MCP server, then say prism init.";
  }
  if (byId.jobs === false) {
    return "You already have the maximum number of jobs going. Finish or cancel one first.";
  }
  if (byId.disk === false) {
    return "This machine is low on disk. Free some space, then start a job again.";
  }
  if (byId.ram === false) {
    return "This machine is low on memory. Close extra Cursor windows, then start a job.";
  }
  if (checks.every((check) => check.ok)) {
    return `${signedInSpeak()} Say “start working on …” when you want a teammate on a ticket.`;
  }
  return "Something needs a moment. Say prism init, then try again.";
}

export function startJobSpeak(job: JobRecord): string {
  const id = displayJobId(job);
  return [
    `Started ${jobRef(job)}. A teammate is working in its own worktree, so you can keep chatting or start another job.`,
    `Say “where are we” anytime for live status — including when it finishes or if it fails.`,
    `Pause or cancel with “pause ${id}”.`,
  ].join(" ");
}

export function alreadyRunningSpeak(job: JobRecord): string {
  const activity = job.lastActivity?.trim();
  return activity
    ? `${jobRef(job)} is already running — ${activity}. Say “where are we” for live status.`
    : `${jobRef(job)} is already running. Say “where are we” for live status.`;
}

export function recordedJobSpeak(job: JobRecord, reason: string): string {
  return `${jobRef(job)} is saved, but ${reason}`;
}

export function overlapSpeak(input: {
  readonly title: string;
  readonly dirty: boolean;
}): string {
  const dirty = input.dirty ? " (with uncommitted changes)" : "";
  return `“${input.title}” is already using that workspace${dirty}. Say yes if you still want a second teammate there.`;
}

export type JobListRow = {
  id: string;
  title: string;
  status: string;
  agentStatus: string;
  gitStatus: string;
  lastActivity?: string;
  resultSummary?: string;
  errorMessage?: string;
};

export function listJobsSpeak(rows: readonly JobListRow[]): string {
  if (rows.length === 0) {
    return "Nothing running. Say “start working on …” with a ticket and what you want done.";
  }
  const finished = rows.filter(
    (job) => job.status === "done" || job.status === "error",
  );
  const live = rows.filter(
    (job) =>
      job.status === "running" ||
      job.status === "booting" ||
      job.status === "ready" ||
      job.status === "waiting_on_you" ||
      job.status === "blocked",
  );
  const other = rows.filter(
    (job) => job.status === "paused" || job.status === "cancelled",
  );
  const lines: string[] = [];
  for (const job of finished) lines.push(finishedLine(job));
  for (const job of live) lines.push(liveLine(job));
  for (const job of other) {
    lines.push(
      [jobRef(job), statusPhrase(job.status)].filter(Boolean).join(" — "),
    );
  }
  return lines.join("\n");
}

function finishedLine(job: JobListRow): string {
  if (job.status === "error") {
    return [
      jobRef(job),
      "failed",
      job.errorMessage || "The teammate hit an error. Say resume to try again.",
    ].join(" — ");
  }
  return [jobRef(job), "finished", job.resultSummary || "Wrapped up."].join(
    " — ",
  );
}

function liveLine(job: JobListRow): string {
  const git = firstGitLine(job.gitStatus);
  const activity = job.lastActivity?.trim();
  const gone = teammateLine(job.status, job.agentStatus);
  const bits = [
    jobRef(job),
    statusPhrase(job.status),
    activity,
    gone,
    git,
  ].filter(Boolean);
  return bits.join(" — ");
}

function firstGitLine(gitStatus: string): string {
  const line = gitStatus.split("\n")[0]?.trim() ?? "";
  if (!line || line === "clean") return "";
  const dirty = gitStatus.split("\n").filter((row) => row.trim()).length;
  return dirty === 1 ? "1 uncommitted file" : `${dirty} uncommitted files`;
}

function teammateLine(status: string, agentStatus: string): string {
  const gone =
    status === "running" &&
    (agentStatus === "unknown" ||
      agentStatus === "n/a" ||
      agentStatus === "error" ||
      /not found/i.test(agentStatus));
  if (gone) return "teammate stopped — say resume to continue";
  return "";
}

export function controlSpeak(
  action: "pause" | "resume" | "cancel",
  job: { id: string; title: string },
): string {
  const verb =
    action === "pause"
      ? "Paused"
      : action === "cancel"
        ? "Cancelled"
        : "Resumed";
  return `${verb} ${jobRef(job)}.`;
}

export function missingJobSpeak(
  ref: string,
  jobs: readonly { id: string; title: string }[],
): string {
  if (jobs.length === 0) {
    return `I couldn’t find “${ref}”. Nothing is running.`;
  }
  const list = jobs.map((job) => jobRef(job)).join("; ");
  return `I couldn’t find “${ref}”. Running: ${list}.`;
}

export function ambiguousJobSpeak(
  jobs: readonly { id: string; title: string }[],
): string {
  return `Which one? ${jobs.map((job) => jobRef(job)).join("; ")}`;
}

function stripSecrets(detail: string): string {
  return detail
    .replace(/crsr_[a-z0-9]+/gi, "")
    .replace(/CURSOR_API_KEY/g, "")
    .replace(/api[_-]?key\s*[:=]\s*\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function publicWorkerError(detail: string): string {
  if (
    /not installed|cannot find module|CURSOR_API_KEY|api key|mcp\.json/i.test(
      detail,
    )
  ) {
    return "the teammate didn’t start. Say prism init, then try again.";
  }
  const cleaned = stripSecrets(detail);
  return cleaned
    ? `the teammate didn’t start (${cleaned}).`
    : "the teammate didn’t start. Say prism init, then try again.";
}

export function publicRunFailure(detail: string): string {
  if (
    /not installed|cannot find module|CURSOR_API_KEY|api key|mcp\.json/i.test(
      detail,
    )
  ) {
    return "The teammate hit an error. Say prism init, then resume.";
  }
  const cleaned = stripSecrets(detail);
  return cleaned
    ? `The teammate hit an error (${cleaned}).`
    : "The teammate hit an error. Say resume to try again.";
}

export function leftoverFocusSpeak(job: {
  id: string;
  title: string;
  nextStep: string;
}): string {
  const step = job.nextStep.trim();
  if (isInternalNextStep(step)) {
    return `Continue ${jobRef(job)}.`;
  }
  return step ? `Continue ${jobRef(job)}: ${step}` : `Continue ${jobRef(job)}.`;
}

function isInternalNextStep(step: string): boolean {
  return (
    isOpaqueJobId(step) ||
    /CURSOR_API_KEY|mcp\.json|agent booting|worker running|cursor-auth/i.test(
      step,
    )
  );
}
