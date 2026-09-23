/**
 * Jobs on the one Dashboard. The playground serves GET /api/jobs from disk;
 * the IDE webview uses the same path on the hub token the host already has.
 */

import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { ConsoleStatus } from "@repo-prism/shared";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { dashboardLink } from "./hub-link.js";
import { JobsScreen } from "./JobsScreen.js";
import type {
  JobConsolePage,
  JobControlAction,
  JobSummary,
  JobsPort,
} from "./jobs-types.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";

const POLL_MS = 2_000;

export type ConsoleJobsScreenProps = {
  readonly repoLabel: string;
  readonly workspacePath?: string;
  readonly branch?: string | undefined;
  readonly user?: AppSidebarUser | null;
  readonly onNavigate: (view: AppView) => void;
  readonly status: ConsoleStatus | undefined;
  readonly onRetry: () => void;
};

type JobsResponse = {
  readonly jobs?: readonly (JobSummary & { readonly workspacePath?: string })[];
  readonly asOf?: string;
  readonly errors?: readonly {
    readonly workspaceLabel?: string;
    readonly workspacePath?: string;
    readonly detail?: string;
  }[];
};

export function ConsoleJobsScreen(props: ConsoleJobsScreenProps): ReactElement {
  const { status } = props;
  const [jobs, setJobs] = useState<readonly JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | undefined>(undefined);
  const [asOf, setAsOf] = useState<string | undefined>(undefined);
  const [workspaceErrors, setWorkspaceErrors] = useState<
    readonly { label: string; detail: string }[]
  >([]);
  const [nonce, setNonce] = useState(0);

  const link = dashboardLink(status);

  useEffect(() => {
    if (!link) {
      setLoading(false);
      return;
    }
    let live = true;

    const read = async (): Promise<void> => {
      try {
        const query = new URLSearchParams();
        if (link.token) query.set("token", link.token);
        if (props.workspacePath) query.set("workspace", props.workspacePath);
        const res = await fetch(`${link.base}/api/jobs?${query}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => undefined)) as
            | { error?: string }
            | undefined;
          throw new Error(
            body?.error?.trim() || `Could not load jobs (HTTP ${res.status})`,
          );
        }
        const body = (await res.json()) as JobsResponse;
        if (!live) return;
        setJobs(body.jobs ?? []);
        setAsOf(body.asOf);
        setWorkspaceErrors(
          (body.errors ?? []).map((row) => ({
            label: row.workspaceLabel ?? row.workspacePath ?? "workspace",
            detail: row.detail ?? "could not be read",
          })),
        );
        setListError(undefined);
      } catch (cause) {
        if (!live) return;
        // Kept rather than cleared: showing the last known list next to an
        // error beats blanking the screen because one poll missed.
        setListError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (live) setLoading(false);
      }
    };

    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [link?.base, link?.token, nonce, props.workspacePath]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const port: JobsPort = {
    async jobLogs(jobId: string, since?: string): Promise<JobConsolePage> {
      if (!link) return { entries: [], truncated: false, totalCount: 0 };
      const params = new URLSearchParams({ token: link.token });
      if (since) params.set("since", since);
      const res = await fetch(
        `${link.base}/api/jobs/${encodeURIComponent(jobId)}/logs?${params}`,
      );
      if (!res.ok) return { entries: [], truncated: false, totalCount: 0 };
      return (await res.json()) as JobConsolePage;
    },
    async control(
      action: JobControlAction,
      jobId: string,
      extra?: { path?: string },
    ): Promise<void> {
      if (!link) return;
      await fetch(
        `${link.base}/api/jobs/${encodeURIComponent(jobId)}/control?token=${encodeURIComponent(link.token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            ...(extra?.path ? { path: extra.path } : {}),
          }),
        },
      );
      refresh();
    },
  };

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
        active="jobs"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        <div className="ov-scroll">
          {status && !status.console ? (
            <div className="int-runtime int-runtime--idle" role="status">
              <p className="int-runtime__line">
                <span
                  className="int-runtime__dot"
                  data-tone="idle"
                  aria-hidden
                />
                Job list is not available yet
              </p>
              <p className="int-connect__hint">
                It starts itself the first time an agent calls a Prism tool. Ask
                Prism anything in chat, then try again.
              </p>
              <button
                type="button"
                className="int-btn int-btn--test"
                onClick={props.onRetry}
              >
                Try again
              </button>
            </div>
          ) : (
            <JobsScreen
              repoLabel={props.repoLabel}
              port={port}
              jobs={jobs}
              loading={loading || !status}
              onRefresh={refresh}
              workspaceErrors={workspaceErrors}
              {...(props.workspacePath
                ? { repoFilter: props.workspacePath }
                : {})}
              {...(listError ? { listError } : {})}
              {...(asOf ? { asOf } : {})}
            />
          )}
        </div>
      </div>
    </div>
  );
}
