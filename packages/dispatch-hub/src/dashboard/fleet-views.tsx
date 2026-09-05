import {
  formatPrismDate,
  isLiveJob,
  jobBadgeTone,
  jobDisplayLabel,
  jobNotePaths,
  type JobSummary,
  type JobWorkspaceChip,
} from "@repo-prism/app-shell";
import {
  Accordion,
  Badge,
  Button,
  Checkbox,
  Drawer,
  DropdownMenu,
  GanttRow,
  HoverTip,
  IconButton,
  Popover,
  SearchableInput,
  Select,
  Sparkline,
  Table,
  ToggleGroup,
  Truncate,
  sortRows,
  type DropdownMenuItem,
  type TableColumn,
  type TableSort,
} from "@repo-prism/ui";
import {
  Eye,
  FileText,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pause,
  Plus,
  StretchHorizontal,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type RefObject,
} from "react";
import {
  FLEET_RANGES,
  RANGE_LABELS,
  attentionJobs,
  clusterGanttBars,
  ganttBarsForRepo,
  groupRepos,
  jobPlaybookNotch,
  jobsChronological,
  matchesFilter,
  reposWithJobsInRange,
  sparklineValues,
  timelineBarLabel,
  verifyTag,
  waitedWorkedLabel,
  type FleetRange,
  type FleetViewMode,
  type GanttCluster,
  type RepoFleet,
} from "./fleet.js";
import { RepoSelect } from "./repo-select.js";

/**
 * Inline + tip preview for a job brief. Full PRD stays in Focus/inspector —
 * hover only needs a scannable snippet (HoverTip clamps further).
 */
function compactJobPrd(prd: string, maxChars = 160): string {
  const flat = prd.replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;
  return `${flat.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export function DashboardToolbar(props: {
  readonly token: string;
  readonly filter: string;
  readonly onFilter: (value: string) => void;
  readonly range: FleetRange;
  readonly onRange: (range: FleetRange) => void;
  readonly mode: FleetViewMode;
  readonly onMode: (mode: FleetViewMode) => void;
  readonly onNewJob: () => void;
  readonly filterRef: RefObject<HTMLInputElement | null>;
  readonly repos?: readonly JobWorkspaceChip[];
  readonly repoFilter?: string;
  readonly onRepoFilter?: (path: string) => void;
}): ReactElement {
  return (
    <div className="fleet-toolbar">
      <Button
        variant="primary"
        icon={<Plus size={16} aria-hidden />}
        onClick={props.onNewJob}
      >
        New job
      </Button>
      <SearchableInput
        ref={props.filterRef}
        className="fleet-toolbar__filter"
        placeholder="Filter repos and jobs"
        value={props.filter}
        onChange={props.onFilter}
        aria-label="Filter repos and jobs"
      />
      <div className="fleet-toolbar__end">
        <ToggleGroup
          aria-label="View"
          value={props.mode}
          onChange={(id) => props.onMode(id as FleetViewMode)}
          options={[
            {
              id: "timeline",
              label: "Timeline",
              icon: <StretchHorizontal size={14} aria-hidden />,
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
        <Select
          aria-label="Time range"
          className="fleet-toolbar__range-select"
          value={props.range}
          onChange={(value) => props.onRange(value as FleetRange)}
          options={FLEET_RANGES.map((range) => ({
            value: range,
            label: RANGE_LABELS[range],
          }))}
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

function JobActions(props: {
  readonly job: JobSummary;
  readonly onOpenJob: (job: JobSummary) => void;
  readonly onOpenFinding?: (job: JobSummary) => void;
  readonly onPause?: (job: JobSummary) => void;
  readonly onDelete?: (job: JobSummary) => void;
}): ReactElement {
  const notes = jobNotePaths(props.job);
  const items: DropdownMenuItem[] = [
    {
      id: "details",
      label: "View details",
      icon: <Eye size={14} aria-hidden />,
      onSelect: () => props.onOpenJob(props.job),
    },
    ...(notes.length > 0 && props.onOpenFinding
      ? [
          {
            id: "finding",
            label: "View finding",
            icon: <FileText size={14} aria-hidden />,
            onSelect: () => props.onOpenFinding?.(props.job),
          },
        ]
      : []),
    ...(isLiveJob(props.job.status) && props.onPause
      ? [
          {
            id: "pause",
            label: "Pause",
            icon: <Pause size={14} aria-hidden />,
            onSelect: () => props.onPause?.(props.job),
          },
        ]
      : []),
    ...(props.onDelete &&
    !isLiveJob(props.job.status) &&
    props.job.status !== "needs_confirm"
      ? [
          {
            id: "delete",
            label: "Delete",
            icon: <Trash2 size={14} aria-hidden />,
            danger: true,
            onSelect: () => props.onDelete?.(props.job),
          },
        ]
      : []),
  ];
  return (
    <DropdownMenu
      trigger={
        <IconButton
          label="Job actions"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={16} aria-hidden />
        </IconButton>
      }
      items={items}
    />
  );
}

function barGeometry(cluster: GanttCluster): {
  readonly left: number;
  readonly width: number;
  readonly waited?: { readonly left: number; readonly width: number };
  readonly worked?: { readonly left: number; readonly width: number };
} {
  const outerLeft = Math.min(
    cluster.waited?.left ?? 100,
    cluster.worked?.left ?? 100,
  );
  const outerRight = Math.max(
    cluster.waited ? cluster.waited.left + cluster.waited.width : 0,
    cluster.worked ? cluster.worked.left + cluster.worked.width : 0,
  );
  const width = Math.max(1, outerRight - outerLeft);
  const rel = (
    seg: { readonly left: number; readonly width: number } | undefined,
  ): { readonly left: number; readonly width: number } | undefined =>
    seg
      ? {
          left: ((seg.left - outerLeft) / width) * 100,
          width: (seg.width / width) * 100,
        }
      : undefined;
  return {
    left: outerLeft,
    width,
    ...(rel(cluster.waited) ? { waited: rel(cluster.waited) } : {}),
    ...(rel(cluster.worked) ? { worked: rel(cluster.worked) } : {}),
  };
}

export function JobListDrawer(props: {
  readonly title: string;
  readonly jobs?: readonly JobSummary[];
  readonly sections?: readonly {
    readonly title: string;
    readonly jobs: readonly JobSummary[];
  }[];
  readonly onOpenJob: (job: JobSummary) => void;
  readonly onClose: () => void;
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
                  {section.jobs.map((job) => (
                    <li key={`${job.workspacePath}:${job.id}`}>
                      <button
                        type="button"
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
                        </span>
                        <Badge
                          className="fleet-job-list__tag"
                          tone={jobBadgeTone(job.status, job.nextStep)}
                        >
                          {jobDisplayLabel(job)}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </Drawer>
  );
}

export function TimelineView(props: {
  readonly repos: readonly RepoFleet[];
  readonly range: FleetRange;
  readonly nowMs: number;
  readonly onOpenJob: (job: JobSummary) => void;
  readonly onOpenRepo: (path: string) => void;
  readonly onOpenCluster: (jobs: readonly JobSummary[], atMs: number) => void;
  readonly onOpenFinding?: (job: JobSummary) => void;
  readonly onPause?: (job: JobSummary) => void;
  readonly onDelete?: (job: JobSummary) => void;
  readonly loading: boolean;
}): ReactElement {
  if (props.loading) {
    return <div className="fleet-scan" aria-hidden />;
  }
  if (props.repos.length === 0) {
    return (
      <p className="console__lede">
        No jobs in this range. Start one, or widen All.
      </p>
    );
  }
  return (
    <div className="fleet-timeline">
      {props.repos.map((repo) => {
        const clusters = clusterGanttBars(
          ganttBarsForRepo(repo.jobs, props.range, props.nowMs),
        );
        const stats = `${repo.live} live · ${repo.waiting} wait`;
        const verify = verifyTag(repo.verify);
        return (
          <div key={repo.path} className="fleet-timeline__repo">
            <div className="fleet-timeline__row">
              <button
                type="button"
                className="fleet-timeline__id"
                onClick={() => props.onOpenRepo(repo.path)}
              >
                <span className="fleet-mark" aria-hidden>
                  {repo.label.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <strong>
                    <Truncate title={repo.label}>{repo.label}</Truncate>
                  </strong>
                  {repo.error ? (
                    <em className="fleet-error">{repo.error}</em>
                  ) : null}
                </span>
              </button>
              <GanttRow className="fleet-timeline__track">
                {clusters.map((cluster, index) => {
                  const geo = barGeometry(cluster);
                  const many = cluster.jobs.length > 1;
                  const stamp = cluster.atMs
                    ? formatPrismDate(
                        new Date(cluster.atMs).toISOString(),
                        "time",
                      )
                    : "";
                  const title = many
                    ? `${cluster.jobs.length} jobs at ${stamp}`
                    : (cluster.jobs[0]?.title ?? "");
                  const first = cluster.jobs[0];
                  const label = timelineBarLabel(cluster.jobs);
                  const running = cluster.jobs.some((job) =>
                    isLiveJob(job.status),
                  );
                  return (
                    <button
                      key={
                        many
                          ? `${repo.path}:cluster:${cluster.atMs}:${index}`
                          : `${repo.path}:${first?.id ?? index}`
                      }
                      type="button"
                      className={`fleet-bar fleet-bar--${jobBadgeTone(first?.status ?? "done", first?.nextStep)} fleet-bar--${jobPlaybookNotch(first?.playbook)}${running ? " fleet-bar--running" : ""}`}
                      title={title}
                      style={{ left: `${geo.left}%`, width: `${geo.width}%` }}
                      onClick={() => {
                        if (many) {
                          props.onOpenCluster(cluster.jobs, cluster.atMs);
                        } else if (first) {
                          props.onOpenJob(first);
                        }
                      }}
                    >
                      {geo.waited ? (
                        <span
                          className="fleet-bar__wait"
                          style={{
                            left: `${geo.waited.left}%`,
                            width: `${geo.waited.width}%`,
                          }}
                        />
                      ) : null}
                      {geo.worked ? (
                        <span
                          className="fleet-bar__work"
                          style={{
                            left: `${geo.worked.left}%`,
                            width: `${geo.worked.width}%`,
                          }}
                        />
                      ) : null}
                      {label ? (
                        <span className="fleet-bar__label">{label}</span>
                      ) : null}
                    </button>
                  );
                })}
              </GanttRow>
              <HoverTip
                label={
                  repo.live > 0
                    ? `${stats} · Running · verify ${verify.label}`
                    : `${stats} · verify ${verify.label}`
                }
              >
                <div className="fleet-timeline__stats">
                  {stats}
                  {repo.live > 0 ? (
                    <Badge tone="accent">Running</Badge>
                  ) : null}
                  <Badge tone={verify.tone}>{verify.label}</Badge>
                </div>
              </HoverTip>
              {repo.last ? (
                <JobActions
                  job={repo.last}
                  onOpenJob={props.onOpenJob}
                  {...(props.onOpenFinding
                    ? { onOpenFinding: props.onOpenFinding }
                    : {})}
                  {...(props.onPause ? { onPause: props.onPause } : {})}
                  {...(props.onDelete ? { onDelete: props.onDelete } : {})}
                />
              ) : (
                <span />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BoardView(props: {
  readonly repos: readonly RepoFleet[];
  readonly range: FleetRange;
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
}): ReactElement {
  const failures = props.jobs.filter((job) => job.status === "error");
  const liveJobs = props.jobs.filter((job) => isLiveJob(job.status));
  const waitingJobs = attentionJobs(props.jobs);
  const blockedJobs = props.jobs.filter((job) => job.status === "blocked");

  if (props.loading) return <div className="fleet-scan" aria-hidden />;

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
      <Accordion summary="Repositories" defaultOpen className="fleet-board__row">
        <div className="fleet-board__grid">
          {props.repos.map((repo) => {
            const verify = verifyTag(repo.verify);
            return (
              <button
                key={repo.path}
                type="button"
                className="fleet-tile fleet-tile--repo"
                onClick={() => props.onOpenJobs(repo.label, repo.jobs)}
              >
                <header>
                  <span className="fleet-mark" aria-hidden>
                    {repo.label.slice(0, 1).toUpperCase()}
                  </span>
                  <strong>
                    <Truncate title={repo.label}>{repo.label}</Truncate>
                  </strong>
                  <Badge
                    tone={
                      repo.live > 0
                        ? "accent"
                        : repo.error
                          ? "rose"
                          : repo.waiting > 0
                            ? "amber"
                            : "neutral"
                    }
                  >
                    {repo.live > 0
                      ? "live"
                      : repo.error
                        ? "error"
                        : repo.waiting > 0
                          ? "blocked"
                          : "idle"}
                  </Badge>
                  <Badge
                    className="fleet-tile__last-status"
                    tone={verify.tone}
                  >
                    {verify.label}
                  </Badge>
                </header>
                <p>
                  {repo.live} running · {repo.waiting} waiting
                </p>
                <p className="fleet-tile__last">
                  {repo.last
                    ? `last  ${repo.last.title} · ${formatPrismDate(repo.last.updatedAt ?? repo.last.createdAt ?? "", "relative")}`
                    : "No jobs yet"}
                </p>
                <Sparkline
                  values={sparklineValues(repo.jobs, props.range, props.nowMs)}
                  label={`${repo.label} activity`}
                />
              </button>
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
                  props.onOpenJobs("Dispatch", [], [
                    { title: "Live", jobs: liveJobs },
                    { title: "Blocked", jobs: blockedJobs },
                    { title: "Waiting", jobs: waitingJobs },
                  ])
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
                <h3>Recent failures</h3>
                {props.jobsError ? (
                  <p>Couldn&apos;t read the failure list</p>
                ) : failures.length === 0 ? (
                  <p>No failures in this range</p>
                ) : (
                  <ul>
                    {failures.slice(0, 4).map((job) => (
                      <li key={job.id}>
                        <Truncate title={job.title}>{job.title}</Truncate>
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            ) : null}
          </div>
        </Accordion>
      ) : null}
    </div>
  );
}

export function ListView(props: {
  readonly jobs: readonly JobSummary[];
  readonly nowMs: number;
  readonly selectedId?: string;
  readonly onOpenJob: (job: JobSummary) => void;
  readonly onOpenFinding?: (job: JobSummary) => void;
  readonly onPause?: (job: JobSummary) => void;
  readonly onDelete?: (job: JobSummary) => void;
  readonly loading: boolean;
}): ReactElement {
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
        <Badge tone={jobBadgeTone(job.status, job.nextStep)}>
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
              <Truncate
                heading={job.title}
                title={compactJobPrd(job.prd)}
              >
                {compactJobPrd(job.prd)}
              </Truncate>
            </em>
          ) : null}
        </span>
      ),
    },
    {
      id: "repo",
      header: "Repo",
      className: "fleet-list__repo",
      sortable: true,
      sortValue: (job) => job.workspaceLabel ?? "",
      render: (job) => (
        <Truncate title={job.workspaceLabel ?? "—"}>
          {job.workspaceLabel ?? "—"}
        </Truncate>
      ),
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
      id: "verify",
      header: "Verify",
      className: "fleet-list__verify",
      sortable: true,
      sortValue: (job) => verifyTag(job.verification).label,
      render: (job) => {
        const tag = verifyTag(job.verification);
        return <Badge tone={tag.tone}>{tag.label}</Badge>;
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
          {...(props.onOpenFinding
            ? { onOpenFinding: props.onOpenFinding }
            : {})}
          {...(props.onPause ? { onPause: props.onPause } : {})}
          {...(props.onDelete ? { onDelete: props.onDelete } : {})}
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
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.key === "j") {
        event.preventDefault();
        setCursor((i) => Math.min(rows.length - 1, i + 1));
      }
      if (event.key === "k") {
        event.preventDefault();
        setCursor((i) => Math.max(0, i - 1));
      }
      if (event.key === "Enter") {
        const job = rows[cursor];
        if (job) props.onOpenJob(job);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, props, rows]);

  if (props.loading) return <div className="fleet-scan" aria-hidden />;
  return (
    <div className="fleet-list-wrap">
      <Table
        className="fleet-list-table"
        columns={columns}
        rows={rows}
        rowKey={(job) => `${job.workspacePath}:${job.id}`}
      sort={sort}
      onSort={setSort}
      selectedKey={
        props.selectedId
          ? rows.find((job) => job.id === props.selectedId)
            ? `${rows.find((job) => job.id === props.selectedId)?.workspacePath}:${props.selectedId}`
            : rows[cursor]
              ? `${rows[cursor]?.workspacePath}:${rows[cursor]?.id}`
              : undefined
          : rows[cursor]
            ? `${rows[cursor]?.workspacePath}:${rows[cursor]?.id}`
            : undefined
      }
      onRowClick={props.onOpenJob}
      empty="No jobs match this filter."
    />
    </div>
  );
}

export function useVisibleRepos(
  jobs: readonly JobSummary[],
  workspaces: readonly JobWorkspaceChip[],
  filter: string,
  repoFilter: string | undefined,
  range: FleetRange,
  nowMs: number,
): readonly RepoFleet[] {
  return useMemo(() => {
    const visible = jobs.filter(
      (job) =>
        matchesFilter(job, filter) &&
        (!repoFilter ||
          repoFilter === "all" ||
          job.workspacePath === repoFilter),
    );
    const groups = groupRepos(visible, workspaces);
    const active = reposWithJobsInRange(groups, range, nowMs);
    if (!filter.trim()) return active;
    return active.filter(
      (repo) =>
        repo.label.toLowerCase().includes(filter.trim().toLowerCase()) ||
        repo.jobs.length > 0,
    );
  }, [jobs, workspaces, filter, repoFilter, range, nowMs]);
}
