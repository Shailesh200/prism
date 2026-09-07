import {
  JobsScreen,
  jobBadgeTone,
  jobBadgePulse,
  jobDisplayLabel,
  jobNotePaths,
  type JobSummary,
  type JobWorkspaceChip,
} from "@repo-prism/app-shell";
import {
  Badge,
  Button,
  CUSTOM_RANGE_PRESET,
  Drawer,
  EmptyState,
  Input,
  SearchableInput,
  isActivateTarget,
  isPrimaryActionKey,
  listCursorDelta,
  pageShortcutBlocked,
  type DateRangeValue,
} from "@repo-prism/ui";
import {
  Aperture,
  PanelLeft,
  PanelLeftClose,
  Cpu,
  HardDrive,
  Inbox,
  LayoutDashboard,
  MemoryStick,
  Plus,
  ScrollText,
  Settings,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { ComposeDrawer, InstructionDrawer } from "./compose-drawer.js";
import { ConsoleFooter } from "./console-footer.js";
import { ConsoleToastHost, showConsoleToast } from "./console-toast.js";
import { FindingsView } from "./findings-view.js";
import {
  DEFAULT_FLEET_RANGE,
  FLEET_RANGES,
  TILES_STORAGE_KEY,
  VIEW_STORAGE_KEY,
  attentionJobs,
  hydrateJobs,
  jobsInRange,
  parseFleetView,
  selectedRangeWindow,
  type FleetRange,
  type FleetViewMode,
  type TimeWindow,
} from "./fleet.js";
import {
  BoardView,
  DashboardToolbar,
  JobListDrawer,
  ListView,
  useVisibleRepos,
} from "./fleet-views.js";
import { PulseView } from "./pulse-view.js";
import {
  FocusJobBar,
  JobActions,
  jobActionHandlers,
  type JobActionHandlers,
} from "./job-actions.js";
import { JobLineage } from "./job-lineage-view.js";
import { IntelligenceView } from "./intelligence-view.js";
import {
  CONSOLE_VIEWS,
  useHashRoute,
  VIEW_LABELS,
  type RailView,
} from "./router.js";
import {
  getJson,
  notifyWorkspacesChanged,
  postJson,
  readToken,
  WORKSPACES_CHANGED,
} from "./session.js";
import { SettingsView } from "./settings-view.js";
import { WhatsNewView } from "./whats-new-view.js";
import { useJobsFeed } from "./use-jobs.js";

const RAIL_STORAGE_KEY = "prism.console.rail";

const RAIL_ICONS: Record<RailView, ReactElement> = {
  dashboard: <LayoutDashboard size={16} aria-hidden />,
  attention: <Inbox size={16} aria-hidden />,
  findings: <ScrollText size={16} aria-hidden />,
  iris: <Aperture size={16} aria-hidden />,
  settings: <Settings size={16} aria-hidden />,
};

type RepoRow = {
  readonly path: string;
  readonly label: string;
  readonly lastSeenAt: string;
  readonly jobCount: number;
  readonly error?: string;
};

type ReposResponse = { readonly repos: RepoRow[]; readonly asOf: string };

type HostTelemetry = {
  readonly cpu?: number;
  readonly memUsed?: number;
  readonly memTotal?: number;
  readonly diskUsed?: number;
  readonly diskTotal?: number;
};

export function ConsoleApp(): ReactElement {
  const token = useMemo(() => readToken(), []);
  const {
    view,
    go,
    repo: repoFilter,
    job: jobId,
    note: notePath,
  } = useHashRoute();
  const feed = useJobsFeed(token);
  const waitingCount = attentionJobs(feed.summaries).length;
  const workspaces = useWorkspaces(token, feed);
  const [version, setVersion] = useState<string | undefined>();
  const [host, setHost] = useState<HostTelemetry | undefined>();
  const [mode, setMode] = useState<FleetViewMode>(() =>
    parseFleetView(
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(VIEW_STORAGE_KEY),
    ),
  );
  const [range, setRange] = useState<FleetRange>(DEFAULT_FLEET_RANGE);
  const [customWindow, setCustomWindow] = useState<TimeWindow | undefined>();
  const [railCollapsed, setRailCollapsed] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(RAIL_STORAGE_KEY) === "collapsed";
  });
  const [filter, setFilter] = useState("");
  const [compose, setCompose] = useState<
    | {
        readonly open: true;
        readonly title?: string;
        readonly prd?: string;
        readonly playbook?: string;
        readonly finding?: JobSummary;
        readonly workspace?: string;
      }
    | { readonly open: false }
  >({ open: false });
  const [instructJob, setInstructJob] = useState<JobSummary | undefined>();
  const [focusId, setFocusId] = useState<string | undefined>();
  const [listDrawer, setListDrawer] = useState<{
    readonly title: string;
    readonly jobs: readonly JobSummary[];
    readonly sections?: readonly {
      readonly title: string;
      readonly jobs: readonly JobSummary[];
    }[];
  }>();
  const [tiles, setTiles] = useState(() => {
    try {
      const raw = localStorage.getItem(TILES_STORAGE_KEY);
      if (!raw) return { summary: true, failures: true };
      return JSON.parse(raw) as { summary: boolean; failures: boolean };
    } catch {
      return { summary: true, failures: true };
    }
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [addPath, setAddPath] = useState("");
  const [pending, setPending] = useState<{
    readonly jobId: string;
    readonly action: "retry" | "reverify";
  }>();
  const pendingRef = useRef(false);
  const filterRef = useRef<HTMLInputElement | null>(null);
  const focusJob = feed.summaries.find((job) => job.id === focusId);
  const timeWindow = customWindow ?? selectedRangeWindow(range, nowMs);
  const rangeValue: DateRangeValue = {
    preset: customWindow ? CUSTOM_RANGE_PRESET : range,
    startMs: timeWindow.startMs,
    endMs: Number.isFinite(timeWindow.endMs) ? timeWindow.endMs : nowMs,
  };
  const onRangeValue = (next: DateRangeValue): void => {
    if (
      next.preset === CUSTOM_RANGE_PRESET ||
      !FLEET_RANGES.includes(next.preset as FleetRange)
    ) {
      setCustomWindow({ startMs: next.startMs, endMs: next.endMs });
      return;
    }
    setRange(next.preset as FleetRange);
    setCustomWindow(undefined);
  };

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    void getJson<{ version: string }>("/api/healthz", token)
      .then((body) => {
        if (alive) setVersion(body.version);
      })
      .catch(() => undefined);
    void getJson<HostTelemetry>("/api/telemetry/host", token)
      .then((body) => {
        if (alive) setHost(body);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (pageShortcutBlocked(event)) return;
      if (event.key === "/") {
        event.preventDefault();
        filterRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setModePersist = useCallback((next: FleetViewMode) => {
    setMode(next);
    localStorage.setItem(VIEW_STORAGE_KEY, next);
  }, []);

  const setTilesPersist = useCallback(
    (next: { summary: boolean; failures: boolean }) => {
      setTiles(next);
      localStorage.setItem(TILES_STORAGE_KEY, JSON.stringify(next));
    },
    [],
  );

  const rangedJobs = useMemo(
    () => jobsInRange(feed.summaries, timeWindow, nowMs),
    [feed.summaries, timeWindow, nowMs],
  );
  const repos = useVisibleRepos(rangedJobs, workspaces, filter, repoFilter);
  const listJobs = useMemo(
    () =>
      rangedJobs.filter(
        (job) =>
          (!repoFilter ||
            repoFilter === "all" ||
            job.workspacePath === repoFilter) &&
          (filter.trim() === "" ||
            job.title.toLowerCase().includes(filter.toLowerCase()) ||
            (job.workspaceLabel ?? "")
              .toLowerCase()
              .includes(filter.toLowerCase())),
      ),
    [rangedJobs, filter, repoFilter],
  );

  const openFinding = useCallback(
    (job: JobSummary) => {
      const note = jobNotePaths(job)[0];
      go("findings", {
        job: job.id,
        ...(note ? { note } : {}),
        ...(job.workspacePath ? { repo: job.workspacePath } : {}),
      });
    },
    [go],
  );
  const runJobControl = useCallback(
    async (action: "retry" | "reverify", job: JobSummary) => {
      if (pendingRef.current) {
        showConsoleToast(
          action === "reverify"
            ? "Checks already running…"
            : "Retry already running…",
        );
        return;
      }
      pendingRef.current = true;
      setPending({ jobId: job.id, action });
      if (action === "reverify") {
        showConsoleToast(
          "Running checks. If they fail, a teammate will fix them.",
        );
      }
      try {
        await feed.port.control?.(action, job.id);
      } finally {
        pendingRef.current = false;
        setPending(undefined);
      }
    },
    [feed.port],
  );
  const fleetActions = {
    onOpenJob: (job: JobSummary) => setFocusId(job.id),
    onOpenFinding: openFinding,
    onPause: (job: JobSummary) => void feed.port.control?.("pause", job.id),
    onCancel: (job: JobSummary) => void feed.port.control?.("cancel", job.id),
    onConfirm: (job: JobSummary) => void feed.port.control?.("confirm", job.id),
    onResume: (job: JobSummary) => void feed.port.control?.("resume", job.id),
    onRetry: (job: JobSummary) => void runJobControl("retry", job),
    onReverify: (job: JobSummary) => void runJobControl("reverify", job),
    onDelete: (job: JobSummary) => void feed.port.control?.("delete", job.id),
    onStartFromJob: (job: JobSummary) => {
      setFocusId(undefined);
      setInstructJob(undefined);
      setCompose({
        open: true,
        title: job.title,
        playbook: "finding",
        finding: job,
        ...(job.workspacePath ? { workspace: job.workspacePath } : {}),
      });
    },
    onAddInstruction: (job: JobSummary) => {
      setFocusId(undefined);
      setCompose({ open: false });
      setInstructJob(job);
    },
    ...(pending ? { pending } : {}),
  };
  const removeRepo = useCallback(
    (path: string, label: string) => {
      void postJson("/api/workspaces/remove", token, { path })
        .then(() => {
          notifyWorkspacesChanged();
          if (repoFilter === path) go("dashboard", {});
          showConsoleToast(
            `Removed ${label} from this Console. The checkout is unchanged.`,
          );
          void feed.refresh();
        })
        .catch((cause) =>
          showConsoleToast(
            cause instanceof Error ? cause.message : String(cause),
            "error",
          ),
        );
    },
    [feed, go, repoFilter, token],
  );
  const firstRun = workspaces.length === 0 && !feed.loading;

  return (
    <div className="console">
      <header className="console__bar">
        <div className="console__brand-host">
          <div className="console__brand" aria-label="Prism Dispatch">
            <img
              className="console__mark-img"
              src="/assets/prism-mark.png"
              width={22}
              height={22}
              alt=""
            />
            <span className="console__wordmark">
              <span className="console__wordmark-prism">Prism</span>
              <span className="console__wordmark-dispatch">Dispatch</span>
            </span>
          </div>
          <div className="console__host" aria-label="This machine">
            {hostStrip(host)}
          </div>
        </div>
        <div className="console__bar-actions">
          <SearchableInput
            ref={filterRef}
            placeholder="Filter repos and jobs"
            value={filter}
            onChange={setFilter}
            aria-label="Filter repos and jobs"
          />
          <Button
            variant="primary"
            icon={<Plus size={16} aria-hidden />}
            onClick={() => {
              setInstructJob(undefined);
              setCompose({ open: true });
            }}
          >
            New job
          </Button>
        </div>
      </header>

      <div className="console__body">
        <nav
          className={
            railCollapsed
              ? "console-rail console-rail--collapsed"
              : "console-rail"
          }
          aria-label="Console"
        >
          <Button
            type="button"
            variant="tertiary"
            className="console-rail__item console-rail__toggle"
            aria-label={
              railCollapsed ? "Expand navigation" : "Collapse navigation"
            }
            title={railCollapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => {
              const next = !railCollapsed;
              setRailCollapsed(next);
              localStorage.setItem(
                RAIL_STORAGE_KEY,
                next ? "collapsed" : "full",
              );
            }}
          >
            {railCollapsed ? (
              <PanelLeft size={16} aria-hidden />
            ) : (
              <PanelLeftClose size={16} aria-hidden />
            )}
          </Button>
          {CONSOLE_VIEWS.map((id) => (
            <Button
              key={id}
              type="button"
              variant="tertiary"
              className={
                view === id
                  ? "console-rail__item console-rail__item--on"
                  : "console-rail__item"
              }
              aria-current={view === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              {RAIL_ICONS[id]}
              <span>{VIEW_LABELS[id]}</span>
              {id === "attention" && waitingCount > 0 ? (
                <span
                  className="console-rail__badge"
                  aria-label={`${waitingCount} awaiting approval`}
                >
                  {waitingCount}
                </span>
              ) : null}
            </Button>
          ))}
        </nav>

        <div className="console__column">
          <main
            className={
              view === "findings" && jobId
                ? "console__main console__main--findings"
                : "console__main"
            }
          >
            {view === "dashboard" ? (
              firstRun ? (
                <FirstRun
                  token={token}
                  addPath={addPath}
                  onAddPath={setAddPath}
                  onAdded={() => feed.refresh()}
                  onIris={() => go("iris")}
                />
              ) : (
                <>
                  <DashboardToolbar
                    token={token}
                    rangeValue={rangeValue}
                    onRangeValue={onRangeValue}
                    nowMs={nowMs}
                    mode={mode}
                    onMode={setModePersist}
                    repos={workspaces}
                    repoFilter={repoFilter ?? "all"}
                    onRepoFilter={(path) =>
                      go("dashboard", path === "all" ? {} : { repo: path })
                    }
                  />
                  {mode === "timeline" ? (
                    <PulseView
                      repos={repos}
                      range={timeWindow}
                      nowMs={nowMs}
                      loading={feed.loading}
                      onOpenRepo={(path) => go("dashboard", { repo: path })}
                      {...fleetActions}
                    />
                  ) : null}
                  {mode === "board" ? (
                    <BoardView
                      repos={repos}
                      range={timeWindow}
                      nowMs={nowMs}
                      jobs={rangedJobs}
                      loading={feed.loading}
                      {...(feed.fatal ? { jobsError: feed.fatal } : {})}
                      showSummary={tiles.summary}
                      showFailures={tiles.failures}
                      onTiles={setTilesPersist}
                      onRemoveRepo={removeRepo}
                      onOpenJobs={(title, jobs, sections) =>
                        setListDrawer({
                          title,
                          jobs,
                          ...(sections ? { sections } : {}),
                        })
                      }
                    />
                  ) : null}
                  {mode === "list" ? (
                    <ListView
                      jobs={listJobs}
                      nowMs={nowMs}
                      loading={feed.loading}
                      {...(focusId ? { selectedId: focusId } : {})}
                      {...fleetActions}
                    />
                  ) : null}
                </>
              )
            ) : null}

            {view === "attention" ? (
              <AttentionView
                jobs={feed.summaries}
                loading={feed.loading}
                {...fleetActions}
                onOpenJob={(job) => {
                  setFocusId(job.id);
                  go("dashboard");
                }}
              />
            ) : null}

            {view === "findings" ? (
              <FindingsView
                token={token}
                jobs={feed.summaries}
                repos={workspaces}
                {...(jobId ? { jobId } : {})}
                {...(notePath ? { notePath } : {})}
                onHandOff={(job, text) => {
                  setInstructJob(undefined);
                  setCompose({
                    open: true,
                    title: job.title,
                    prd: text,
                    playbook: "finding",
                  });
                }}
              />
            ) : null}

            {view === "iris" ? (
              <IntelligenceView
                token={token}
                jobs={feed.summaries}
                workspaces={workspaces}
              />
            ) : null}
            {view === "settings" ? (
              <SettingsView token={token} onRemoveRepo={removeRepo} />
            ) : null}
            {view === "whats-new" ? (
              <WhatsNewView
                onOpenPulse={() => {
                  setModePersist("timeline");
                  go("dashboard");
                }}
                onNewJob={() => {
                  setInstructJob(undefined);
                  setCompose({ open: true });
                }}
              />
            ) : null}
          </main>
          <ConsoleFooter {...(version ? { version } : {})} />
        </div>

        {listDrawer ? (
          <JobListDrawer
            title={listDrawer.title}
            jobs={hydrateJobs(listDrawer.jobs, feed.summaries)}
            {...(listDrawer.sections
              ? {
                  sections: listDrawer.sections.map((section) => ({
                    ...section,
                    jobs: hydrateJobs(section.jobs, feed.summaries),
                  })),
                }
              : {})}
            onOpenJob={(job) => setFocusId(job.id)}
            onClose={() => setListDrawer(undefined)}
            actions={jobActionHandlers(fleetActions)}
          />
        ) : null}

        {focusJob ? (
          <Drawer
            size="xl"
            title={focusJob.title}
            label="Job"
            onClose={() => setFocusId(undefined)}
            footer={
              <FocusJobBar
                job={focusJob}
                {...fleetActions}
                onOpenJob={(job) => setFocusId(job.id)}
              />
            }
          >
            <JobLineage
              job={focusJob}
              jobs={feed.summaries}
              onOpen={(job) => setFocusId(job.id)}
            />
            <JobsScreen
              repoLabel={focusJob.workspaceLabel ?? "Job"}
              port={feed.port}
              jobs={[focusJob]}
              loading={false}
              chrome="focus"
              defaultOpenId={focusJob.id}
              heading={focusJob.title}
              eyebrow="Focus"
              onOpenFindings={(job, note) =>
                go("findings", {
                  job: job.id,
                  ...(note ? { note } : {}),
                  ...(job.workspacePath ? { repo: job.workspacePath } : {}),
                })
              }
            />
          </Drawer>
        ) : null}

        {compose.open ? (
          <ComposeDrawer
            token={token}
            workspaces={workspaces}
            jobs={feed.summaries}
            {...(compose.workspace
              ? { defaultWorkspace: compose.workspace }
              : repoFilter
                ? { defaultWorkspace: repoFilter }
                : {})}
            {...(compose.title || compose.prd || compose.finding
              ? {
                  preset: {
                    title: compose.title ?? "",
                    prd: compose.prd ?? "",
                    ...(compose.playbook ? { playbook: compose.playbook } : {}),
                    ...(compose.finding ? { finding: compose.finding } : {}),
                  },
                }
              : {})}
            onClose={() => setCompose({ open: false })}
            onQueued={(message) => showConsoleToast(message)}
          />
        ) : null}

        {instructJob ? (
          <InstructionDrawer
            token={token}
            job={instructJob}
            workspaces={workspaces}
            onClose={() => setInstructJob(undefined)}
            onSent={(message) => {
              showConsoleToast(message);
              void feed.refresh();
            }}
          />
        ) : null}
      </div>
      <ConsoleToastHost />
    </div>
  );
}

function hostStrip(host: HostTelemetry | undefined): ReactElement {
  const cpu = typeof host?.cpu === "number" ? `${Math.round(host.cpu)}%` : "—";
  const mem = host?.memUsed !== undefined ? fmtGb(host.memUsed) : "—";
  const disk =
    host?.diskUsed !== undefined && host.diskTotal !== undefined
      ? `${Math.round((host.diskUsed / host.diskTotal) * 100)}%`
      : "—";
  return (
    <>
      <span>
        <Cpu size={13} aria-hidden /> CPU {cpu}
      </span>
      <span>
        <MemoryStick size={13} aria-hidden /> MEM {mem}
      </span>
      <span>
        <HardDrive size={13} aria-hidden /> DSK {disk}
      </span>
    </>
  );
}

function fmtGb(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
}

function FirstRun(props: {
  readonly token: string;
  readonly addPath: string;
  readonly onAddPath: (value: string) => void;
  readonly onAdded: () => void;
  readonly onIris: () => void;
}): ReactElement {
  const [error, setError] = useState<string | undefined>();
  return (
    <section className="console__panel">
      <h1 className="console__title">Prism Dispatch</h1>
      <p className="console__lede">
        Point this Console at a repository, then start a job or let Iris look
        first.
      </p>
      <form
        className="first-run"
        onKeyDown={(event) => {
          if (isPrimaryActionKey(event)) {
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          const path = props.addPath.trim();
          if (!path) {
            setError("Paste an absolute repository path");
            return;
          }
          void postJson("/api/workspaces", props.token, { path })
            .then(() => {
              props.onAdded();
              setError(undefined);
            })
            .catch((cause) =>
              setError(cause instanceof Error ? cause.message : String(cause)),
            );
        }}
      >
        <Input
          label="Repository path"
          value={props.addPath}
          onChange={(event) => props.onAddPath(event.target.value)}
          placeholder="/Users/you/project"
        />
        {error ? <p className="compose__error">{error}</p> : null}
        <div className="first-run__actions">
          <Button
            type="button"
            onClick={() => {
              void postJson<{ path?: string; cancelled?: boolean }>(
                "/api/workspaces/pick",
                props.token,
                {},
              )
                .then((result) => {
                  if (!result.path) return;
                  notifyWorkspacesChanged();
                  props.onAddPath(result.path);
                  props.onAdded();
                })
                .catch((cause) =>
                  setError(
                    cause instanceof Error ? cause.message : String(cause),
                  ),
                );
            }}
          >
            Choose folder
          </Button>
          <Button type="submit" variant="primary">
            Add repository
          </Button>
          <Button type="button" onClick={props.onIris}>
            Load Iris
          </Button>
        </div>
      </form>
    </section>
  );
}

function AttentionView(
  props: {
    readonly jobs: readonly JobSummary[];
    readonly loading: boolean;
    readonly onOpenJob?: (job: JobSummary) => void;
  } & JobActionHandlers,
): ReactElement {
  const rows = attentionJobs(props.jobs);
  const [busyId, setBusyId] = useState<string | undefined>();
  const [cursor, setCursor] = useState(0);
  const actions = jobActionHandlers(props);

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
        if (job) {
          event.preventDefault();
          props.onOpenJob?.(job);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, props, rows]);

  const run = async (
    action: "confirm" | "pause" | "resume" | "cancel",
    job: JobSummary,
  ): Promise<void> => {
    const handler =
      action === "confirm"
        ? props.onConfirm
        : action === "pause"
          ? props.onPause
          : action === "resume"
            ? props.onResume
            : props.onCancel;
    if (!handler) return;
    setBusyId(job.id);
    try {
      await handler(job);
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <section className="console__panel">
      <h1 className="console__title">Attention</h1>
      {rows.length === 0 ? (
        <EmptyState
          variant="page"
          icon={Inbox}
          title="Nothing is waiting on you"
        >
          Dirty-tree gates and questions from a teammate show up here.
        </EmptyState>
      ) : (
        <p className="console__lede">{rows.length} need you</p>
      )}
      {props.loading ? <div className="fleet-scan" aria-hidden /> : null}
      <ul className="attention-list">
        {rows.map((job, index) => {
          const stalled = job.status === "waiting_on_you";
          const paused = job.status === "paused";
          const gated = job.status === "needs_confirm";
          const busy = busyId === job.id;
          return (
            <li
              key={`${job.workspacePath}:${job.id}`}
              className={
                index === cursor
                  ? "attention-card attention-card--on"
                  : "attention-card"
              }
              tabIndex={0}
              aria-current={index === cursor ? "true" : undefined}
            >
              <div className="attention-card__head">
                <strong>{job.title}</strong>
                <div className="attention-card__head-end">
                  <Badge
                    tone={jobBadgeTone(job.status, job.nextStep)}
                    pulse={jobBadgePulse(job.status)}
                  >
                    {jobDisplayLabel(job)}
                  </Badge>
                  <JobActions
                    job={job}
                    onOpenJob={props.onOpenJob}
                    {...actions}
                  />
                </div>
              </div>
              <span>{job.workspaceLabel}</span>
              <p>
                {job.confirm?.question ??
                  (stalled
                    ? "No recent output. Resume to nudge it, or cancel."
                    : paused
                      ? "Paused — resume when you want it to continue."
                      : "The teammate asked a question.")}
              </p>
              <div className="attention-card__actions">
                {gated ? (
                  <Button
                    variant="primary"
                    disabled={busy || !props.onConfirm}
                    onClick={() => void run("confirm", job)}
                  >
                    Start anyway
                  </Button>
                ) : null}
                {paused || stalled ? (
                  <Button
                    variant="primary"
                    disabled={busy || !props.onResume}
                    onClick={() => void run("resume", job)}
                  >
                    Resume
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  disabled={busy || !props.onCancel}
                  onClick={() => void run("cancel", job)}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => props.onOpenJob?.(job)}
                >
                  Open job
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function useWorkspaces(
  token: string,
  feed: {
    readonly jobs: readonly { workspacePath: string; workspaceLabel: string }[];
  },
): JobWorkspaceChip[] {
  const [repos, setRepos] = useState<RepoRow[]>([]);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void getJson<ReposResponse>("/api/repos", token)
        .then((body) => {
          if (alive) setRepos(body.repos ?? []);
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(WORKSPACES_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(WORKSPACES_CHANGED, load);
    };
  }, [token, feed.jobs.length]);
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of feed.jobs) {
      counts.set(job.workspacePath, (counts.get(job.workspacePath) ?? 0) + 1);
    }
    if (repos.length > 0) {
      return repos.map((repo) => ({
        path: repo.path,
        label: repo.label,
        jobCount: counts.get(repo.path) ?? repo.jobCount ?? 0,
        ...(repo.error ? { error: repo.error } : {}),
      }));
    }
    return [...counts.entries()].map(([path, jobCount]) => ({
      path,
      label:
        feed.jobs.find((job) => job.workspacePath === path)?.workspaceLabel ??
        path,
      jobCount,
    }));
  }, [feed.jobs, repos]);
}
