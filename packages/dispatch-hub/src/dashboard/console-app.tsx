import {
  JobsScreen,
  jobBadgeTone,
  jobDisplayLabel,
  jobNotePaths,
  type JobSummary,
  type JobWorkspaceChip,
} from "@repo-prism/app-shell";
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  Input,
  formatPrismDate,
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
import { ComposeDrawer } from "./compose-drawer.js";
import { ConsoleFooter } from "./console-footer.js";
import { ConsoleToastHost, showConsoleToast } from "./console-toast.js";
import { FindingsView } from "./findings-view.js";
import {
  DEFAULT_FLEET_RANGE,
  TILES_STORAGE_KEY,
  VIEW_STORAGE_KEY,
  attentionJobs,
  hydrateJobs,
  parseFleetView,
  type FleetRange,
  type FleetViewMode,
} from "./fleet.js";
import {
  BoardView,
  DashboardToolbar,
  JobListDrawer,
  ListView,
  TimelineView,
  useVisibleRepos,
} from "./fleet-views.js";
import { IntelligenceView } from "./intelligence-view.js";
import {
  CONSOLE_VIEWS,
  useHashRoute,
  VIEW_LABELS,
  type ConsoleView,
} from "./router.js";
import { getJson, notifyWorkspacesChanged, postJson, readToken, WORKSPACES_CHANGED } from "./session.js";
import { SettingsView } from "./settings-view.js";
import { useJobsFeed } from "./use-jobs.js";

const RAIL_STORAGE_KEY = "prism.console.rail";

const RAIL_ICONS: Record<ConsoleView, ReactElement> = {
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
      }
    | { readonly open: false }
  >({ open: false });
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
  const filterRef = useRef<HTMLInputElement | null>(null);
  const focusJob = feed.summaries.find((job) => job.id === focusId);

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
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (event.key === "/" && !typing) {
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

  const repos = useVisibleRepos(
    feed.summaries,
    workspaces,
    filter,
    repoFilter,
    range,
    nowMs,
  );
  const listJobs = useMemo(
    () =>
      feed.summaries.filter(
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
    [feed.summaries, filter, repoFilter],
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
  const fleetActions = {
    onOpenJob: (job: JobSummary) => setFocusId(job.id),
    onOpenFinding: openFinding,
    onPause: (job: JobSummary) => void feed.port.control?.("pause", job.id),
    onDelete: (job: JobSummary) => void feed.port.control?.("delete", job.id),
  };
  const firstRun = workspaces.length === 0 && !feed.loading;

  return (
    <div className="console">
      <header className="console__bar">
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
          <button
            type="button"
            className="console-rail__item console-rail__toggle"
            aria-label={railCollapsed ? "Expand navigation" : "Collapse navigation"}
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
          </button>
          {CONSOLE_VIEWS.map((id) => (
            <button
              key={id}
              type="button"
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
            </button>
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
                    filter={filter}
                    onFilter={setFilter}
                    range={range}
                    onRange={setRange}
                    mode={mode}
                    onMode={setModePersist}
                    onNewJob={() => setCompose({ open: true })}
                    filterRef={filterRef}
                    repos={workspaces}
                    repoFilter={repoFilter ?? "all"}
                    onRepoFilter={(path) =>
                      go("dashboard", path === "all" ? {} : { repo: path })
                    }
                  />
                  {mode === "timeline" ? (
                    <TimelineView
                      repos={repos}
                      range={range}
                      nowMs={nowMs}
                      loading={feed.loading}
                      onOpenRepo={(path) => go("dashboard", { repo: path })}
                      onOpenCluster={(jobs, atMs) => {
                        const stamp = atMs
                          ? formatPrismDate(
                              new Date(atMs).toISOString(),
                              "time",
                            )
                          : "";
                        setListDrawer({
                          title: `${jobs.length} Jobs at ${stamp}`,
                          jobs,
                        });
                      }}
                      {...fleetActions}
                    />
                  ) : null}
                  {mode === "board" ? (
                    <BoardView
                      repos={repos}
                      range={range}
                      nowMs={nowMs}
                      jobs={feed.summaries}
                      loading={feed.loading}
                      {...(feed.fatal ? { jobsError: feed.fatal } : {})}
                      showSummary={tiles.summary}
                      showFailures={tiles.failures}
                      onTiles={setTilesPersist}
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
                port={feed.port}
                loading={feed.loading}
                onOpen={(job) => {
                  setFocusId(job.id);
                  go("dashboard");
                }}
              />
            ) : null}

            {view === "findings" ? (
              <FindingsView
                token={token}
                jobs={feed.summaries}
                {...(jobId ? { jobId } : {})}
                {...(notePath ? { notePath } : {})}
                onHandOff={(job, text) =>
                  setCompose({
                    open: true,
                    title: job.title,
                    prd: text,
                    playbook: "finding",
                  })
                }
              />
            ) : null}

            {view === "iris" ? (
              <IntelligenceView
                token={token}
                jobs={feed.summaries}
                workspaces={workspaces}
              />
            ) : null}
            {view === "settings" ? <SettingsView token={token} /> : null}
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
          />
        ) : null}

        {focusJob ? (
          <Drawer
            size="lg"
            title={focusJob.title}
            label="Job"
            onClose={() => setFocusId(undefined)}
          >
            <JobsScreen
              repoLabel={focusJob.workspaceLabel ?? "Job"}
              port={feed.port}
              jobs={[focusJob]}
              loading={false}
              chrome="inspector"
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
            {...(repoFilter ? { defaultWorkspace: repoFilter } : {})}
            {...(compose.title || compose.prd
              ? {
                  preset: {
                    title: compose.title ?? "",
                    prd: compose.prd ?? "",
                    ...(compose.playbook ? { playbook: compose.playbook } : {}),
                  },
                }
              : {})}
            onClose={() => setCompose({ open: false })}
            onQueued={(message) => showConsoleToast(message)}
          />
        ) : null}
      </div>
      <ConsoleToastHost />

      {focusJob ? (
        <div className="focus-layer" role="dialog" aria-label="Focus">
          <button
            type="button"
            className="focus-layer__scrim"
            aria-label="Close"
            onClick={() => setFocusId(undefined)}
          />
          <div className="focus-layer__panel">
            <header className="focus-layer__head">
              <h2 className="focus-layer__title">{focusJob.title}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFocusId(undefined)}
              >
                Close
              </Button>
            </header>
            <JobsScreen
              repoLabel={focusJob.workspaceLabel ?? "Job"}
              port={{
                ...feed.port,
                control: runJobControl,
              }}
              jobs={[focusJob]}
              loading={false}
              onRefresh={feed.refresh}
              heading={focusJob.title}
              eyebrow="Focus"
              onOpenFindings={(job, note) => {
                setFocusId(undefined);
                go("findings", {
                  job: job.id,
                  ...(note ? { note } : {}),
                  ...(job.workspacePath ? { repo: job.workspacePath } : {}),
                });
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function hostStrip(host: HostTelemetry | undefined): ReactElement {
  const cpu = typeof host?.cpu === "number" ? `${Math.round(host.cpu)}%` : "—";
  const mem =
    host?.memUsed !== undefined && host.memTotal !== undefined
      ? `${fmtGb(host.memUsed)}/${fmtGb(host.memTotal)}`
      : "—";
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
        <HardDrive size={13} aria-hidden /> DISK {disk}
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

function AttentionView(props: {
  readonly jobs: readonly JobSummary[];
  readonly port: {
    control?: (
      action: "confirm" | "cancel" | "delete",
      jobId: string,
    ) => Promise<void>;
  };
  readonly loading: boolean;
  readonly onOpen: (job: JobSummary) => void;
}): ReactElement {
  const rows = attentionJobs(props.jobs);
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
        {rows.map((job) => (
          <li key={`${job.workspacePath}:${job.id}`} className="attention-card">
            <div className="attention-card__head">
              <strong>{job.title}</strong>
              <Badge tone={jobBadgeTone(job.status, job.nextStep)}>
                {jobDisplayLabel(job)}
              </Badge>
            </div>
            <span>{job.workspaceLabel}</span>
            <p>{job.confirm?.question ?? "The teammate asked a question."}</p>
            {job.status === "needs_confirm" ? (
              <div className="attention-card__actions">
                <Button
                  variant="primary"
                  onClick={() => void props.port.control?.("confirm", job.id)}
                >
                  Start anyway
                </Button>
                <Button
                  onClick={() => void props.port.control?.("cancel", job.id)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button onClick={() => props.onOpen(job)}>Open job</Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AttentionView(props: {
  readonly jobs: readonly JobSummary[];
  readonly control: JobControlFn;
  readonly canControl: boolean;
  readonly loading: boolean;
  readonly onOpen: (job: JobSummary) => void;
}): ReactElement {
  const rows = attentionJobs(props.jobs);
  const [busyId, setBusyId] = useState<string | undefined>();

  const run = async (
    action: JobControlAction,
    job: JobSummary,
  ): Promise<void> => {
    setBusyId(job.id);
    try {
      await props.control(action, job.id);
    } catch {
      /* Toast already shown by runJobControl. */
    } finally {
      setBusyId(undefined);
    }
  };

  return (
    <section className="console__panel">
      <h1 className="console__title">Attention</h1>
      {rows.length === 0 ? (
        <p className="console__lede">
          Nothing is waiting on you. Dirty-tree gates, stalled teammates, and
          paused jobs show up here.
        </p>
      ) : (
        <p className="console__lede">{rows.length} need you</p>
      )}
      {props.loading ? <div className="attention-scan" aria-hidden /> : null}
      <ul className="attention-list">
        {rows.map((job) => {
          const stalled = job.status === "waiting_on_you";
          const paused = job.status === "paused";
          const gated = job.status === "needs_confirm";
          const live = isLiveJob(job.status) && !stalled;
          const busy = busyId === job.id;
          return (
            <li
              key={`${job.workspacePath}:${job.id}`}
              className="attention-card"
            >
              <div className="attention-card__head">
                <strong>{job.title}</strong>
                <Badge tone={jobBadgeTone(job.status, job.nextStep)}>
                  {jobDisplayLabel(job)}
                </Badge>
              </div>
              {job.workspaceLabel ? <span>{job.workspaceLabel}</span> : null}
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
                    disabled={busy || !props.canControl}
                    onClick={() => void run("confirm", job)}
                  >
                    Start anyway
                  </Button>
                ) : null}
                {paused || stalled ? (
                  <Button
                    variant="primary"
                    disabled={busy || !props.canControl}
                    onClick={() => void run("resume", job)}
                  >
                    Resume
                  </Button>
                ) : null}
                {live ? (
                  <Button
                    variant="secondary"
                    disabled={busy || !props.canControl}
                    onClick={() => void run("pause", job)}
                  >
                    Pause
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  disabled={busy || !props.canControl}
                  onClick={() => void run("cancel", job)}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => props.onOpen(job)}
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
