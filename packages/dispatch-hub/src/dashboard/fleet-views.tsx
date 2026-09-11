import {
  formatPrismDate,
  isLiveJob,
  jobBadgeTone,
  jobBadgePulse,
  jobDisplayLabel,
  jobUsageFigures,
  jobUsageLine,
  type JobSummary,
  type JobWorkspaceChip,
} from "@repo-prism/app-shell";
import {
  Accordion,
  Badge,
  Button,
  Checkbox,
  DateRangePicker,
  Drawer,
  Popover,
  ScreenSkeleton,
  Sparkline,
  Table,
  ToggleGroup,
  Truncate,
  isActivateTarget,
  listCursorDelta,
  pageShortcutBlocked,
  sortRows,
  type DateRangeValue,
  type TableColumn,
  type TableSort,
} from "@repo-prism/ui";
import { Activity, LayoutGrid, List } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  FLEET_RANGE_PRESETS,
  attentionJobs,
  compactJobPrd,
  FAILURES_VISIBLE,
  groupJobsByRepo,
  jobChecksRunning,
  jobTreeLabel,
  jobsChronological,
  jobsInRange,
  overflowMoreLabel,
  repoInitials,
  selectedRangeWindow,
  sparklineValues,
  stackVisible,
  timelineRepoStatus,
  verifyTag,
  visibleFleetRepos,
  waitedWorkedLabel,
  type FleetRange,
  type FleetTimeRange,
  type FleetViewMode,
  type RepoFleet,
} from "./fleet.js";
import {
  JobActions,
  jobActionHandlers,
  type JobActionHandlers,
} from "./job-actions.js";
import { RepoSelect } from "./repo-select.js";

export function DashboardToolbar(props: {
  readonly token: string;
  readonly rangeValue: DateRangeValue;
  readonly onRangeValue: (next: DateRangeValue) => void;
  readonly nowMs: number;
  readonly mode: FleetViewMode;
  readonly onMode: (mode: FleetViewMode) => void;
  readonly minMs?: number;
  readonly repos?: readonly JobWorkspaceChip[];
  readonly repoFilter?: string;
  readonly onRepoFilter?: (path: string) => void;
}): ReactElement {
  return (
    <div className="fleet-toolbar">
      <ToggleGroup
        aria-label="View"
        className="fleet-toolbar__views"
        value={props.mode}
        onChange={(id) => props.onMode(id as FleetViewMode)}
        options={[
          {
            id: "timeline",
            label: "Pulse",
            icon: <Activity size={14} aria-hidden />,
          },
          {
            id: "board",
            label: "Board",
            icon: <LayoutGrid size={14} aria-hidden />,
          },
          {
            id: "list",
            label: "List",
            icon: <List size={14} aria-hidden />,
          },
        ]}
      />
      <div className="fleet-toolbar__end">
        <DateRangePicker
          aria-label="Time range"
          className="fleet-toolbar__range-select"
          presets={FLEET_RANGE_PRESETS}
          value={props.rangeValue}
          nowMs={props.nowMs}
          {...(props.minMs !== undefined ? { minMs: props.minMs } : {})}
          presetWindow={(id, nowMs) =>
            selectedRangeWindow(
              (FLEET_RANGE_PRESETS.some((row) => row.id === id)
                ? id
                : "1h") as FleetRange,
              nowMs,
            )
          }
          onChange={props.onRangeValue}
        />
        {props.repos && props.onRepoFilter ? (
          <RepoSelect
            token={props.token}
            aria-label="Filter by repository"
            className="fleet-toolbar__repo-select"
            value={props.repoFilter ?? "all"}
            onChange={props.onRepoFilter}
            includeAll
            repos={props.repos}
          />
        ) : null}
      </div>
    </div>
  );
}

export { PulseView as TimelineView } from "./pulse-view.js";

export function JobListDrawer(props: {
  readonly title: string;
  readonly jobs?: readonly JobSummary[];
  readonly sections?: readonly {
    readonly title: string;
    readonly jobs: readonly JobSummary[];
  }[];
  readonly onOpenJob: (job: JobSummary) => void;
  readonly onClose: () => void;
  readonly actions?: JobActionHandlers;
}): ReactElement {
  const sections = (
    props.sections ?? (props.jobs ? [{ title: "", jobs: props.jobs }] : [])
  ).map((section) => ({
    ...section,
    jobs: jobsChronological(section.jobs),
  }));
  return (
    <Drawer size="md" title={props.title} label="Jobs" onClose={props.onClose}>
      {sections.every((section) => section.jobs.length === 0) ? (
        <p className="console__lede">No jobs in this list.</p>
      ) : (
        <div className="fleet-job-list">
          {sections.map((section) => (
            <section key={section.title || "all"}>
              {section.title ? (
                <h3 className="fleet-job-list__heading">
                  {section.title}
                  <span>{section.jobs.length}</span>
                </h3>
              ) : null}
              {section.jobs.length === 0 ? (
                <p className="fleet-job-list__empty">None</p>
              ) : (
                <ul>
                  {section.jobs.map((job) => {
                    const usageLine = jobUsageLine(job.tokenUsage);
                    return (
                      <li
                        key={`${job.workspacePath}:${job.id}`}
                        className="fleet-job-list__row"
                      >
                        <button
                          type="button"
                          className="fleet-job-list__open"
                          onClick={() => props.onOpenJob(job)}
                        >
                          <span className="fleet-job-list__copy">
                            <strong>
                              <Truncate title={job.title}>{job.title}</Truncate>
                            </strong>
                            {job.prd ? (
                              <em className="fleet-job-list__prd">
                                <Truncate
                                  heading={job.title}
                                  title={compactJobPrd(job.prd)}
                                >
                                  {compactJobPrd(job.prd)}
                                </Truncate>
                              </em>
                            ) : (
                              <em>
                                {job.workspaceLabel ?? job.workspacePath ?? ""}
                              </em>
                            )}
                            {usageLine ? (
                              <span className="fleet-job-list__usage">
                                {usageLine}
                              </span>
                            ) : null}
                          </span>
                          <Badge
                            className="fleet-job-list__tag"
                            tone={jobBadgeTone(job.status, job.nextStep)}
                          >
                            {jobDisplayLabel(job)}
                          </Badge>
                        </button>
                        <JobActions
                          job={job}
                          onOpenJob={props.onOpenJob}
                          {...(props.actions ?? {})}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </Drawer>
  );
}

export function BoardView(props: {
  readonly repos: readonly RepoFleet[];
  readonly range: FleetTimeRange;
  readonly nowMs: number;
  readonly onOpenJobs: (
    title: string,
    jobs: readonly JobSummary[],
    sections?: readonly {
      readonly title: string;
      readonly jobs: readonly JobSummary[];
    }[],
  ) => void;
  readonly loading: boolean;
  readonly jobs: readonly JobSummary[];
  readonly jobsError?: string;
  readonly showSummary: boolean;
  readonly showFailures: boolean;
  readonly onTiles: (next: { summary: boolean; failures: boolean }) => void;
  readonly onRemoveRepo?: (path: string, label: string) => void;
}): ReactElement {
  const rangedJobs = jobsInRange(props.jobs, props.range, props.nowMs);
  const failures = rangedJobs.filter((job) => job.status === "error");
  const failureStack = stackVisible(failures, FAILURES_VISIBLE);
  const liveJobs = rangedJobs.filter((job) => isLiveJob(job.status));
  const waitingJobs = attentionJobs(rangedJobs);
  const blockedJobs = rangedJobs.filter((job) => job.status === "blocked");

  if (props.loading) return <ScreenSkeleton label="Loading jobs…" rows={4} />;

  return (
    <div className="fleet-board">
      <div className="fleet-board__menu">
        <Popover
          trigger={
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              Tiles
            </Button>
          }
        >
          <Checkbox
            checked={props.showSummary}
            onChange={(summary) =>
              props.onTiles({ summary, failures: props.showFailures })
            }
          >
            Dispatch summary
          </Checkbox>
          <Checkbox
            checked={props.showFailures}
            onChange={(failures) =>
              props.onTiles({ summary: props.showSummary, failures })
            }
          >
            Recent failures
          </Checkbox>
        </Popover>
      </div>
      <Accordion
        summary="Repositories"
        defaultOpen
        className="fleet-board__row"
      >
        <div className="fleet-board__grid">
          {props.repos.map((repo) => {
            const inRange = jobsInRange(repo.jobs, props.range, props.nowMs);
            const status =
              inRange.length > 0
                ? timelineRepoStatus({
                    ...repo,
                    jobs: inRange,
                    live: inRange.filter((job) => isLiveJob(job.status)).length,
                    last: inRange[0],
                  })
                : { label: "NA", tone: "neutral" as const };
            return (
              <div key={repo.path} className="fleet-tile-shell">
                <button
                  type="button"
                  className="fleet-tile fleet-tile--repo"
                  onClick={() => props.onOpenJobs(repo.label, inRange)}
                >
                  <header>
                    <span className="fleet-mark" aria-hidden>
                      {repoInitials(repo.label)}
                    </span>
                    <strong>
                      <Truncate title={repo.label}>{repo.label}</Truncate>
                    </strong>
                    <Badge
                      className="fleet-tile__last-status"
                      tone={status.tone}
                      pulse={status.label === "Running"}
                    >
                      {status.label}
                    </Badge>
                  </header>
                  <p>
                    {inRange.filter((job) => isLiveJob(job.status)).length}{" "}
                    running · {attentionJobs(inRange).length} waiting
                  </p>
                  <p className="fleet-tile__last">
                    {inRange.length > 0
                      ? `last  ${inRange[0]?.title} · ${formatPrismDate(inRange[0]?.updatedAt ?? inRange[0]?.createdAt ?? "", "relative")}`
                      : "No data available"}
                  </p>
                  <Sparkline
                    values={sparklineValues(
                      repo.jobs,
                      props.range,
                      props.nowMs,
                    )}
                    label={`${repo.label} activity`}
                  />
                </button>
                {props.onRemoveRepo ? (
                  <div className="fleet-tile__actions">
                    <JobActions
                      onRemoveRepo={() =>
                        props.onRemoveRepo?.(repo.path, repo.label)
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Accordion>
      {props.showSummary || props.showFailures ? (
        <Accordion summary="Dispatch" defaultOpen className="fleet-board__row">
          <div className="fleet-board__grid">
            {props.showSummary ? (
              <button
                type="button"
                className="fleet-tile fleet-tile--info fleet-tile--dispatch"
                onClick={() =>
                  props.onOpenJobs(
                    "Dispatch",
                    [],
                    [
                      { title: "Live", jobs: liveJobs },
                      { title: "Blocked", jobs: blockedJobs },
                      { title: "Waiting", jobs: waitingJobs },
                    ],
                  )
                }
              >
                <h3>Dispatch</h3>
                {props.jobsError ? (
                  <p>Couldn&apos;t read jobs</p>
                ) : (
                  <p>
                    {liveJobs.length} live · {blockedJobs.length} blocked ·{" "}
                    {waitingJobs.length} waiting
                  </p>
                )}
              </button>
            ) : null}
            {props.showFailures ? (
              <button
                type="button"
                className="fleet-tile fleet-tile--info fleet-tile--failures"
                onClick={() => props.onOpenJobs("Recent failures", failures)}
              >
                <h3>
                  Recent failures
                  {failures.length > 0 ? (
                    <span className="fleet-tile__count">{failures.length}</span>
                  ) : null}
                </h3>
                {props.jobsError ? (
                  <p>Couldn&apos;t read the failure list</p>
                ) : failures.length === 0 ? (
                  <p>No failures in this range</p>
                ) : (
                  <div className="fleet-fail-stack">
                    {failureStack.visible.map((job) => (
                      <span key={job.id} className="fleet-fail-chip">
                        <Truncate title={job.title}>{job.title}</Truncate>
                      </span>
                    ))}
                    {failureStack.hidden > 0 ? (
                      <span className="fleet-fail-more">
                        {overflowMoreLabel(failureStack.hidden)}
                      </span>
                    ) : null}
                  </div>
                )}
              </button>
            ) : null}
          </div>
        </Accordion>
      ) : null}
    </div>
  );
}

export function ListView(
  props: {
    readonly jobs: readonly JobSummary[];
    readonly nowMs: number;
    readonly selectedId?: string;
    readonly onOpenJob: (job: JobSummary) => void;
    readonly loading: boolean;
    readonly outsideCount?: number;
    readonly filter?: string;
    readonly onShowAllTime?: () => void;
  } & JobActionHandlers,
): ReactElement {
  const [cursor, setCursor] = useState(0);
  const [sort, setSort] = useState<TableSort>({ id: "when", dir: "desc" });
  const columns: readonly TableColumn<JobSummary>[] = [
    {
      id: "status",
      header: "Status",
      className: "fleet-list__status",
      sortable: true,
      sortValue: (job) => jobDisplayLabel(job),
      render: (job) => (
        <Badge
          tone={jobBadgeTone(job.status, job.nextStep)}
          pulse={jobBadgePulse(job.status)}
        >
          {jobDisplayLabel(job)}
        </Badge>
      ),
    },
    {
      id: "title",
      header: "Title",
      className: "fleet-list__title",
      sortable: true,
      sortValue: (job) => job.title,
      render: (job) => (
        <span className="fleet-list__title-copy">
          <Truncate title={job.title}>{job.title}</Truncate>
          {job.prd ? (
            <em>
              <Truncate heading={job.title} title={compactJobPrd(job.prd)}>
                {compactJobPrd(job.prd)}
              </Truncate>
            </em>
          ) : null}
        </span>
      ),
    },
    {
      id: "tree",
      header: "Tree",
      className: "fleet-list__repo",
      sortable: true,
      sortValue: (job) => jobTreeLabel(job).label,
      render: (job) => {
        const tree = jobTreeLabel(job);
        return (
          <span className="fleet-list__tree">
            <Truncate title={tree.label}>{tree.label}</Truncate>
            {tree.you ? <em>You</em> : null}
            {tree.worktree ? <em>worktree</em> : null}
          </span>
        );
      },
    },
    {
      id: "waited",
      header: "Waited",
      className: "fleet-list__metric",
      sortable: true,
      sortValue: (job) => waitedWorkedLabel(job, props.nowMs).waited,
      render: (job) => waitedWorkedLabel(job, props.nowMs).waited,
    },
    {
      id: "worked",
      header: "Worked",
      className: "fleet-list__metric",
      sortable: true,
      sortValue: (job) => waitedWorkedLabel(job, props.nowMs).worked,
      render: (job) => waitedWorkedLabel(job, props.nowMs).worked,
    },
    {
      id: "tokens",
      header: "Tokens",
      className: "fleet-list__tokens",
      sortable: true,
      sortValue: (job) =>
        job.tokenUsage?.totalTokens ??
        (job.tokenUsage
          ? job.tokenUsage.inputTokens + job.tokenUsage.outputTokens
          : -1),
      render: (job) => {
        const usage = jobUsageFigures(job.tokenUsage);
        return (
          <span className="fleet-list__usage">
            <span>{usage.context}</span>
            <span>
              in {usage.input} · out {usage.output}
            </span>
          </span>
        );
      },
    },
    {
      id: "verify",
      header: "Verify",
      className: "fleet-list__verify",
      sortable: true,
      sortValue: (job) => verifyTag(job.verification).label,
      render: (job) => {
        const checking =
          jobChecksRunning(job) ||
          (props.pending?.jobId === job.id &&
            props.pending.action === "reverify");
        if (checking) {
          return <Badge tone="amber">Checking</Badge>;
        }
        const tag = verifyTag(job.verification);
        return (
          <span className="fleet-list__verify-cell">
            <Badge
              tone={tag.tone}
              {...(job.verificationDetail
                ? { className: "fleet-list__verify-badge" }
                : {})}
            >
              <span title={job.verificationDetail}>{tag.label}</span>
            </Badge>
          </span>
        );
      },
    },
    {
      id: "when",
      header: "When",
      className: "fleet-list__when",
      sortable: true,
      sortValue: (job) =>
        Date.parse(job.finishedAt ?? job.startedAt ?? job.createdAt ?? "") || 0,
      render: (job) =>
        formatPrismDate(
          job.finishedAt ?? job.startedAt ?? job.createdAt ?? "",
          "datetime",
        ),
    },
    {
      id: "actions",
      header: "",
      className: "fleet-list__actions",
      render: (job) => (
        <JobActions
          job={job}
          onOpenJob={props.onOpenJob}
          {...jobActionHandlers(props)}
        />
      ),
    },
  ];
  const rows = useMemo(
    () => sortRows(props.jobs, columns, sort),
    [columns, props.jobs, sort],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (pageShortcutBlocked(event)) return;
      const delta = listCursorDelta(event.key);
      if (delta !== 0) {
        event.preventDefault();
        setCursor((index) =>
          Math.min(rows.length - 1, Math.max(0, index + delta)),
        );
        return;
      }
      if (event.key === "Enter") {
        if (isActivateTarget(event.target)) return;
        const job = rows[cursor];
        if (job) props.onOpenJob(job);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, props, rows]);

  if (props.loading) return <ScreenSkeleton label="Loading jobs…" rows={5} />;
  const groups = groupJobsByRepo(rows);
  const outside = props.outsideCount ?? 0;
  const filtered = Boolean(props.filter?.trim());
  return (
    <div className="fleet-list-wrap">
      {groups.length === 0 ? (
        <div className="pulse-empty">
          <p className="console__lede">
            {outside > 0 && !filtered
              ? `${outside} job${outside === 1 ? "" : "s"} sit outside this range.`
              : filtered
                ? "No jobs match this filter."
                : "No jobs in this range. Start one, or widen All."}
          </p>
          {outside > 0 && !filtered && props.onShowAllTime ? (
            <Button size="sm" variant="secondary" onClick={props.onShowAllTime}>
              Show all time
            </Button>
          ) : null}
        </div>
      ) : (
        groups.map((group, index) => {
          const live = group.jobs.some((job) => isLiveJob(job.status));
          return (
            <Accordion
              key={group.path || group.label}
              className="fleet-list-group"
              defaultOpen={live || index === 0}
              summary={
                <span className="repo-group-summary">
                  <span className="fleet-mark" aria-hidden>
                    {repoInitials(group.label)}
                  </span>
                  <strong>{group.label}</strong>
                  <span className="repo-group-summary__meta">
                    {`${group.jobs.length} job${group.jobs.length === 1 ? "" : "s"}`}
                  </span>
                </span>
              }
            >
              <Table
                className="fleet-list-table"
                columns={columns}
                rows={group.jobs}
                rowKey={(job) => `${job.workspacePath}:${job.id}`}
                sort={sort}
                onSort={setSort}
                selectedKey={
                  props.selectedId &&
                  group.jobs.some((job) => job.id === props.selectedId)
                    ? `${group.path}:${props.selectedId}`
                    : undefined
                }
                onRowClick={props.onOpenJob}
                empty="No jobs in this repository."
              />
            </Accordion>
          );
        })
      )}
    </div>
  );
}

export function useVisibleRepos(
  jobs: readonly JobSummary[],
  workspaces: readonly JobWorkspaceChip[],
  filter: string,
  repoFilter: string | undefined,
): readonly RepoFleet[] {
  return useMemo(
    () => visibleFleetRepos(jobs, workspaces, filter, repoFilter),
    [jobs, workspaces, filter, repoFilter],
  );
}
