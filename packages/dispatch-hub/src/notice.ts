import type { JobSnapshot } from "./types.js";

export type JobNoticeCopy = {
  readonly title: string;
  readonly body: string;
};

/**
 * Chat-safe toast copy (ADR-0039). Title is the job title; body is the
 * result or error. Never a worktree path, never a job-<hex> id.
 */
export function formatJobFinishedNotice(job: JobSnapshot): JobNoticeCopy {
  const title = job.title.trim() || "Dispatch job";
  if (job.status === "error") {
    return {
      title: `${title} failed`,
      body: clip(job.errorMessage || "The teammate hit an error."),
    };
  }
  if (job.status === "cancelled") {
    return {
      title: `${title} was cancelled`,
      body: "Say where are we in chat if you want to resume.",
    };
  }
  const result = job.resultSummary?.trim() || "Wrapped up.";
  const checks =
    job.verification === "failed"
      ? job.verificationDetail || "Checks failed."
      : job.verification === "passed"
        ? "Checks passed."
        : "";

  // A review is the one finish that needs the human to do something, so say
  // what changed and that nothing landed for them.
  if (job.status === "needs_review") {
    const files = job.review?.files.length ?? 0;
    const churn = job.review
      ? ` (+${job.review.totalAdded} -${job.review.totalRemoved})`
      : "";
    const what =
      files > 0
        ? `${files} file${files === 1 ? "" : "s"} changed${churn}, nothing merged for you.`
        : "Nothing was merged for you.";
    return {
      title: `${title} is ready for your review`,
      body: clip([what, checks].filter(Boolean).join(" ")),
    };
  }

  return {
    title: `${title} finished`,
    body: clip([result, checks].filter(Boolean).join(" ")),
  };
}

function clip(text: string, max = 180): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}
