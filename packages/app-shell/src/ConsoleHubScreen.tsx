/**
 * Iris, Jobs, and Skills on the one Dashboard — native screens, never an iframe.
 */

import { EmptyState, Text } from "@repo-prism/ui";
import type { ConsoleStatus } from "@repo-prism/shared";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { ConsoleJobsScreen } from "./ConsoleJobsScreen.js";
import { dashboardLink } from "./hub-link.js";
import { ComposeDrawer, InstructionDrawer } from "./hub/compose-drawer.js";
import { ConsoleToastHost, showConsoleToast } from "./hub/console-toast.js";
import { EnvelopeDetailsView } from "./hub/envelope-details-view.js";
import { PrepareHistoryPage } from "./hub/prepare-history.js";
import { SKILL_PLAYBOOK } from "./hub/fleet.js";
import { IntelligenceView } from "./hub/intelligence-view.js";
import { jobActionHandlers } from "./hub/job-actions.js";
import { configureHubApi, getJson, postJson } from "./hub/session.js";
import { SkillsView } from "./hub/skills-view.js";
import type { JobSummary, JobWorkspaceChip } from "./jobs-types.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";

export type ConsoleHubScreenProps = {
  readonly view: "iris" | "jobs" | "skills";
  readonly irisPane?: "envelope" | "prepare";
  readonly repoLabel: string;
  readonly workspacePath?: string;
  readonly branch?: string | undefined;
  readonly user?: AppSidebarUser | null;
  readonly onNavigate: (view: AppView) => void;
  readonly onIrisPane?: (pane: "envelope" | "prepare" | undefined) => void;
  readonly status: ConsoleStatus | undefined;
  readonly onRetry: () => void;
};

type ComposeState =
  | {
      readonly open: true;
      readonly title?: string;
      readonly prd?: string;
      readonly playbook?: string;
      readonly skillName?: string;
      readonly skillUpdate?: boolean;
      readonly skillDraft?: {
        readonly name: string;
        readonly description: string;
        readonly body: string;
      };
      readonly workspace?: string;
    }
  | { readonly open: false };

export function ConsoleHubScreen(props: ConsoleHubScreenProps): ReactElement {
  const link = dashboardLink(props.status);
  useEffect(() => {
    configureHubApi(link?.base ?? "");
  }, [link?.base]);

  if (props.view === "jobs") {
    return (
      <ConsoleJobsScreen
        repoLabel={props.repoLabel}
        onNavigate={props.onNavigate}
        status={props.status}
        onRetry={props.onRetry}
        {...(props.workspacePath !== undefined
          ? { workspacePath: props.workspacePath }
          : {})}
        {...(props.branch !== undefined ? { branch: props.branch } : {})}
        {...(props.user !== undefined ? { user: props.user } : {})}
      />
    );
  }

  const token = link?.token ?? "";
  return (
    <div className={shellRootClass("console-hub")}>
      <AppSidebar
        variant={shellNavVariant()}
        active={props.view}
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />
      <div className="ov-main console-hub__main">
        {link ? (
          <HubNativePane
            view={props.view}
            token={token}
            repoLabel={props.repoLabel}
            onNavigate={props.onNavigate}
            {...(props.workspacePath !== undefined
              ? { workspacePath: props.workspacePath }
              : {})}
            {...(props.irisPane !== undefined
              ? { irisPane: props.irisPane }
              : {})}
            {...(props.onIrisPane !== undefined
              ? { onIrisPane: props.onIrisPane }
              : {})}
          />
        ) : (
          <EmptyState
            variant="page"
            title={props.view === "iris" ? "Iris" : "Skills"}
          >
            This view opens once Prism is awake. It starts itself the first time
            an agent calls a Prism tool. Ask Prism anything in chat, then try
            again.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function HubNativePane(props: {
  readonly view: "iris" | "skills";
  readonly token: string;
  readonly repoLabel: string;
  readonly workspacePath?: string;
  readonly irisPane?: "envelope" | "prepare";
  readonly onNavigate: (view: AppView) => void;
  readonly onIrisPane?: (pane: "envelope" | "prepare" | undefined) => void;
}): ReactElement {
  const jobs = useDashboardJobs(props.token, props.workspacePath);
  const [pane, setPane] = useState<"envelope" | "prepare" | undefined>(
    props.irisPane,
  );
  const [prepareRun, setPrepareRun] = useState<string | undefined>();
  useEffect(() => {
    setPane(props.irisPane);
  }, [props.irisPane]);

  const workspaces = useMemo((): JobWorkspaceChip[] => {
    if (!props.workspacePath) return [];
    return [
      {
        path: props.workspacePath,
        label: props.repoLabel,
        jobCount: jobs.filter(
          (job) => job.workspacePath === props.workspacePath,
        ).length,
      },
    ];
  }, [jobs, props.repoLabel, props.workspacePath]);

  if (props.view === "iris" && pane === "envelope") {
    return (
      <EnvelopeDetailsView
        token={props.token}
        jobs={jobs}
        workspaces={workspaces}
        {...(props.workspacePath ? { selectedPath: props.workspacePath } : {})}
        onBack={() => {
          setPane(undefined);
          if (props.onIrisPane) props.onIrisPane(undefined);
          else props.onNavigate("iris");
        }}
        onOpenJob={() => props.onNavigate("jobs")}
      />
    );
  }
  if (props.view === "iris" && pane === "prepare") {
    return props.workspacePath ? (
      <PrepareHistoryPage
        token={props.token}
        workspace={props.workspacePath}
        {...(prepareRun ? { initialRun: prepareRun } : {})}
        onBack={() => {
          setPrepareRun(undefined);
          setPane(undefined);
          if (props.onIrisPane) props.onIrisPane(undefined);
          else props.onNavigate("iris");
        }}
      />
    ) : (
      <EmptyState variant="page" title="Prepare History">
        Select a repository first.
      </EmptyState>
    );
  }
  if (props.view === "iris") {
    return (
      <IntelligenceView
        token={props.token}
        jobs={jobs}
        workspaces={workspaces}
        {...(props.workspacePath ? { selectedPath: props.workspacePath } : {})}
        onMoreDetails={() => {
          setPane("envelope");
          props.onIrisPane?.("envelope");
        }}
        onOpenPreparePage={(initialRun) => {
          setPrepareRun(initialRun);
          setPane("prepare");
          props.onIrisPane?.("prepare");
        }}
      />
    );
  }
  return <SkillsHost token={props.token} jobs={jobs} workspaces={workspaces} />;
}

function SkillsHost(props: {
  readonly token: string;
  readonly jobs: readonly JobSummary[];
  readonly workspaces: readonly JobWorkspaceChip[];
}): ReactElement {
  const [compose, setCompose] = useState<ComposeState>({ open: false });
  const [pendingSkill, setPendingSkill] = useState<
    { readonly title: string; readonly queuedAt: string } | undefined
  >();
  const [instructJob, setInstructJob] = useState<JobSummary | undefined>();
  const composeQueuedRef = useRef(false);
  const control = (action: string, id: string): void => {
    void postJson(`/api/jobs/${encodeURIComponent(id)}/control`, props.token, {
      action,
    }).catch((cause) =>
      showConsoleToast(
        cause instanceof Error ? cause.message : String(cause),
        "error",
      ),
    );
  };
  const jobActions = jobActionHandlers({
    onConfirm: (job) => control("confirm", job.id),
    onCancel: (job) => control("cancel", job.id),
    onAddInstruction: (job) => {
      setCompose({ open: false });
      setInstructJob(job);
    },
    onDelete: (job) => control("delete", job.id),
  });

  return (
    <>
      <div className="jobs-screen skills-host">
        <div className="jobs-screen__head">
          <div>
            <Text variant="title" as="h1" className="jobs-screen__title">
              Skills
            </Text>
            <Text variant="lede" as="p" className="jobs-screen__lede">
              Workflows Prism can run for this machine — yours and the ones that
              shipped with it.
            </Text>
          </div>
        </div>
        <SkillsView
          token={props.token}
          repos={props.workspaces}
          jobs={props.jobs}
          {...(pendingSkill
            ? {
                pendingGenerateTitle: pendingSkill.title,
                pendingGenerateQueuedAt: pendingSkill.queuedAt,
              }
            : {})}
          onWatchJob={() => undefined}
          jobActions={jobActions}
          onPendingGenerateConsumed={() => setPendingSkill(undefined)}
          onCloseCompose={() => {
            setCompose({ open: false });
            setPendingSkill(undefined);
          }}
          onGenerate={(input) => {
            composeQueuedRef.current = false;
            setInstructJob(undefined);
            setCompose({
              open: true,
              title: input.title,
              ...(input.prd ? { prd: input.prd } : {}),
              playbook: input.playbook ?? SKILL_PLAYBOOK,
              ...(input.skillName ? { skillName: input.skillName } : {}),
              ...(input.skillUpdate ? { skillUpdate: true } : {}),
              ...(input.skillDraft ? { skillDraft: input.skillDraft } : {}),
              ...(input.workspace ? { workspace: input.workspace } : {}),
            });
          }}
        />
      </div>
      {compose.open ? (
        <ComposeDrawer
          token={props.token}
          workspaces={props.workspaces}
          {...(compose.workspace
            ? { defaultWorkspace: compose.workspace }
            : {})}
          {...(compose.title ||
          compose.prd ||
          compose.skillName ||
          compose.workspace
            ? {
                preset: {
                  title: compose.title ?? "",
                  prd: compose.prd ?? "",
                  ...(compose.playbook ? { playbook: compose.playbook } : {}),
                  ...(compose.skillName
                    ? { skillName: compose.skillName }
                    : {}),
                  ...(compose.skillUpdate ? { skillUpdate: true } : {}),
                  ...(compose.skillDraft
                    ? { skillDraft: compose.skillDraft }
                    : {}),
                },
              }
            : {})}
          onClose={() => {
            setCompose({ open: false });
            if (!composeQueuedRef.current) setPendingSkill(undefined);
          }}
          onQueued={(message) => {
            composeQueuedRef.current = true;
            showConsoleToast(message);
            if (compose.title) {
              setPendingSkill({
                title: compose.title,
                queuedAt: new Date().toISOString(),
              });
            }
          }}
        />
      ) : null}
      {instructJob ? (
        <InstructionDrawer
          token={props.token}
          job={instructJob}
          workspaces={props.workspaces}
          onClose={() => setInstructJob(undefined)}
          onSent={(message) => showConsoleToast(message)}
        />
      ) : null}
      <ConsoleToastHost />
    </>
  );
}

function useDashboardJobs(
  token: string,
  workspacePath?: string,
): readonly JobSummary[] {
  const [jobs, setJobs] = useState<readonly JobSummary[]>([]);
  useEffect(() => {
    if (!token && typeof window === "undefined") return;
    let alive = true;
    const read = (): void => {
      const query = workspacePath
        ? `?workspace=${encodeURIComponent(workspacePath)}`
        : "";
      void getJson<{ jobs?: readonly JobSummary[] }>(`/api/jobs${query}`, token)
        .then((body) => {
          if (alive) setJobs(body.jobs ?? []);
        })
        .catch(() => {
          if (alive) setJobs([]);
        });
    };
    read();
    const timer = window.setInterval(read, 8_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [token, workspacePath]);
  return jobs;
}
