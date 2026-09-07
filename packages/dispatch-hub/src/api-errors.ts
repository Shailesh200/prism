/**
 * Hub HTTP errors as sentences people can act on.
 *
 * Status codes stay machine-readable. The `error` string is what the Console
 * toasts, so snake_case labels like `unauthorized` never leave this file.
 */

export const HUB_ERROR = {
  origin: "This origin is not allowed to talk to the Console.",
  unauthorized:
    "This page needs a Prism session. Reopen the Console from Prism to get a fresh token.",
  titleRequired: "Give this job a title and pick a repository.",
  workspaceJob: "Say which repository this job belongs to.",
  prdRequired: "Write a brief before sending it.",
  jobMissing: "That job is not on this Console.",
  workspaceRequired: "Pick a repository first.",
  pathRequired: "Say which folder to add.",
  noteMissing: "That write-up is not on this Console.",
  actionRequired: "Say which repository and which action.",
  badPath: "That path is not allowed.",
  notFound: "Nothing here at that address.",
  noteRead: "Could not read that write-up.",
  generic: "The Console hit an error. Try again.",
} as const;

/** Lowercase protocol labels from older hubs — do not toast these. */
const MACHINE_ERROR =
  /^(unauthorized|not found|bad path|origin not allowed|job not found|note not found|prd required|workspace required|workspace and title required|workspace and job required|workspace and action required|path required)$/i;

export function isMachineErrorLabel(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (MACHINE_ERROR.test(trimmed)) return true;
  if (!/\s/.test(trimmed) && trimmed === trimmed.toLowerCase()) return true;
  return false;
}

export function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const row = body as Record<string, unknown>;
  for (const key of ["error", "message", "detail"]) {
    const value = row[key];
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!text || isMachineErrorLabel(text)) continue;
    return text;
  }
  return fallback;
}

export function publicCaughtError(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  const first = raw.split("\n")[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (!first || isMachineErrorLabel(first)) return HUB_ERROR.generic;
  const clipped = first.length > 240 ? `${first.slice(0, 237)}…` : first;
  if (/[.!?]$/.test(clipped)) return clipped;
  const lead = clipped.charAt(0).toUpperCase() + clipped.slice(1);
  return `${lead}.`;
}
