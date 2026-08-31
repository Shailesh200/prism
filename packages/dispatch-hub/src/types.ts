import type { JobRecord } from "@repo-prism/dispatch";

export type JobStatus = JobRecord["status"];

export type HubRecord = {
  readonly port: number;
  readonly pid: number;
  readonly version: string;
  readonly token: string;
  readonly startedAt: string;
};

export type WorkspaceEntry = {
  readonly path: string;
  readonly label: string;
  readonly lastSeenAt: string;
};

export type WorkspaceRegistry = {
  readonly workspaces: readonly WorkspaceEntry[];
};

export type JobSnapshot = {
  readonly id: string;
  readonly title: string;
  readonly status: JobStatus;
  readonly workspacePath: string;
  readonly workspaceLabel: string;
  readonly branch: string;
  readonly lastActivity: string;
  readonly resultSummary?: string;
  readonly errorMessage?: string;
  readonly verification?: "passed" | "failed" | "skipped";
  readonly verificationDetail?: string;
  readonly commitSha?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly elapsedMs: number;
};

export type HubEvent =
  | { readonly type: "snapshot"; readonly jobs: readonly JobSnapshot[] }
  | { readonly type: "job.updated"; readonly job: JobSnapshot }
  | {
      readonly type: "job.finished";
      readonly job: JobSnapshot;
      readonly notice: string;
    };

export const IN_FLIGHT_STATUSES: readonly JobStatus[] = [
  "ready",
  "booting",
  "running",
  "waiting_on_you",
  "blocked",
];

export const TERMINAL_STATUSES: readonly JobStatus[] = [
  "done",
  "error",
  "cancelled",
];
