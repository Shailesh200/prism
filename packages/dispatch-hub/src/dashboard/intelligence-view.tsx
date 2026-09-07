import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  Button,
  CardIcon,
  EmptyState,
  HoverTip,
  RepositoryMapView,
  Tooltip,
  Truncate,
  formatPrismDate,
} from "@repo-prism/ui";
import type {
  GitRecentFile,
  MapZoomLevel,
  RepositoryMap,
} from "@repo-prism/shared";
import {
  isLiveJob,
  isWaitingOnYou,
  type JobSummary,
  type JobWorkspaceChip,
} from "@repo-prism/app-shell";
import {
  Activity,
  ArrowRight,
  Boxes,
  Calendar,
  CircleAlert,
  CircleCheck,
  Compass,
  FileCheck,
  FlaskConical,
  FolderGit2,
  GitBranch,
  Inbox,
  Landmark,
  LoaderCircle,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
} from "lucide-react";
import { preferredWorkspace } from "./fleet.js";
import { RepoSelect } from "./repo-select.js";
import { jobsHash } from "./router.js";
import { getJson, postJson } from "./session.js";
import { showConsoleToast } from "./console-toast.js";

const IRIS_WORKSPACE_KEY = "prism.console.iris.workspace";

type HealthResponse = {
  readonly version: string;
  readonly workspaces: number;
  readonly intelligence: {
    readonly loaded: boolean;
    readonly workspace: string | null;
  };
};

type ConnectorRow = {
  readonly id: string;
  readonly label: string;
  readonly hosts: readonly string[];
  readonly source: string;
};

type ConnectorsResponse = {
  readonly connectors: ConnectorRow[];
  readonly unreadable: readonly { path: string; detail: string }[];
};

type DashboardOk = {
  readonly ok: true;
  readonly method: "dashboard";
  readonly data: {
    readonly repoLabel?: string;
    readonly branch?: string;
    readonly health?: {
      readonly score?: number;
      readonly grade?: string;
    } | null;
    readonly testingScore?: number | null;
    readonly securityScore?: number | null;
    readonly dna?: {
      readonly primaryDomain?: string;
      readonly architectureHints?: readonly string[];
    } | null;
    readonly map?: {
      readonly clusters?: readonly unknown[];
      readonly landmarks?: readonly unknown[];
    };
    readonly recentChanges?: readonly GitRecentFile[];
  };
};

type IrisCache = {
  readonly analysis: DashboardOk["data"];
  readonly spectrum?: RepositoryMap;
  readonly recentChanges?: readonly GitRecentFile[];
  readonly at: string;
};

type MapOk = {
  readonly ok: true;
  readonly method: "map";
  readonly data: {
    readonly map: RepositoryMap;
    readonly recentChanges?: GitRecentFile[];
  };
};

type SpectrumMaps = Partial<Record<MapZoomLevel, RepositoryMap>>;

function mapsFromCachedSpectrum(map: RepositoryMap | undefined): SpectrumMaps {
  return map ? { [map.zoom]: map } : {};
}

function irisCacheKey(path: string): string {
  return `prism.console.iris.cache:${path}`;
}

function readCache(path: string): IrisCache | undefined {
  try {
    const raw = localStorage.getItem(irisCacheKey(path));
    if (!raw) return undefined;
    return JSON.parse(raw) as IrisCache;
  } catch {
    return undefined;
  }
}

function writeCache(path: string, cache: IrisCache): void {
  localStorage.setItem(irisCacheKey(path), JSON.stringify(cache));
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function openInEditor(workspace: string, relative: string): void {
  const abs = `${workspace.replace(/\/$/, "")}/${relative.replace(/^\//, "")}`;
  window.location.href = `cursor://file${abs}`;
}

export function IntelligenceView(props: {
  readonly token: string;
  readonly jobs: readonly JobSummary[];
  readonly workspaces: readonly JobWorkspaceChip[];
}): ReactElement {
  const irisRepos = props.workspaces;
  const [health, setHealth] = useState<HealthResponse | undefined>();
  const [connectors, setConnectors] = useState<
    ConnectorsResponse | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  const [workspace, setWorkspace] = useState(() => {
    const stored =
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(IRIS_WORKSPACE_KEY);
    if (stored) return stored;
    return preferredWorkspace(irisRepos, props.jobs);
  });
  const cached = workspace ? readCache(workspace) : undefined;
  const [analysis, setAnalysis] = useState<DashboardOk["data"] | undefined>(
    cached?.analysis,
  );
  const [analysisError, setAnalysisError] = useState<string | undefined>();
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [mapsByZoom, setMapsByZoom] = useState<SpectrumMaps>(() =>
    mapsFromCachedSpectrum(cached?.spectrum),
  );
  const [spectrumZoom, setSpectrumZoom] = useState<MapZoomLevel>(
    cached?.spectrum?.zoom ?? "package",
  );
  const [recentChanges, setRecentChanges] = useState<
    readonly GitRecentFile[] | undefined
  >(cached?.recentChanges);
  const [spectrumError, setSpectrumError] = useState<string | undefined>();
  const [analyzedAt, setAnalyzedAt] = useState<string | undefined>(cached?.at);

  const spectrum =
    mapsByZoom[spectrumZoom] ?? mapsByZoom.package ?? mapsByZoom.file;

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getJson<HealthResponse>("/api/healthz", props.token),
      getJson<ConnectorsResponse>("/api/connectors", props.token),
    ])
      .then(([nextHealth, nextConnectors]) => {
        if (!alive) return;
        setHealth(nextHealth);
        setConnectors(nextConnectors);
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      alive = false;
    };
  }, [props.token]);

  useEffect(() => {
    if (!workspace) return;
    localStorage.setItem(IRIS_WORKSPACE_KEY, workspace);
    const next = readCache(workspace);
    setAnalysis(next?.analysis);
    setMapsByZoom(mapsFromCachedSpectrum(next?.spectrum));
    setSpectrumZoom(next?.spectrum?.zoom ?? "package");
    setRecentChanges(next?.recentChanges);
    setAnalyzedAt(next?.at);
    setAnalysisError(undefined);
    setSpectrumError(undefined);
  }, [workspace]);

  useEffect(() => {
    if (workspace || irisRepos.length === 0) return;
    setWorkspace(preferredWorkspace(irisRepos, props.jobs));
  }, [irisRepos, props.jobs, workspace]);

  const stats = useMemo(() => {
    const scoped = props.jobs.filter(
      (job) => !workspace || job.workspacePath === workspace,
    );
    const live = scoped.filter((job) => isLiveJob(job.status)).length;
    const waiting = scoped.filter((job) => isWaitingOnYou(job.status)).length;
    const review = scoped.filter((job) => job.status === "needs_review").length;
    const done = scoped.filter((job) => job.status === "done").length;
    const failed = scoped.filter((job) => job.status === "error").length;
    return { live, waiting, review, done, failed, total: scoped.length };
  }, [props.jobs, workspace]);

  const rememberMap = (map: RepositoryMap): void => {
    setMapsByZoom((prev) => ({ ...prev, [map.zoom]: map }));
  };

  const fetchSpectrum = async (
    zoom: MapZoomLevel,
    opts?: {
      readonly persistPackage?: boolean;
      readonly analysisData?: DashboardOk["data"];
      readonly at?: string;
    },
  ): Promise<RepositoryMap | undefined> => {
    if (!workspace) return undefined;
    const mapAnswer = await postJson<MapOk | { ok: false; error?: string }>(
      "/api/host",
      props.token,
      {
        id: `spectrum-${zoom}`,
        method: "map",
        zoom,
        workspace,
      },
    );
    if (!mapAnswer.ok) {
      setSpectrumError(mapAnswer.error ?? "Could not load Spectrum.");
      return undefined;
    }
    rememberMap(mapAnswer.data.map);
    if (mapAnswer.data.recentChanges) {
      setRecentChanges(mapAnswer.data.recentChanges);
    }
    setSpectrumError(undefined);
    if (opts?.persistPackage && zoom === "package" && opts.analysisData) {
      writeCache(workspace, {
        analysis: opts.analysisData,
        spectrum: mapAnswer.data.map,
        recentChanges: mapAnswer.data.recentChanges,
        at: opts.at ?? new Date().toISOString(),
      });
    }
    return mapAnswer.data.map;
  };

  const onSpectrumZoomChange = (zoom: MapZoomLevel): void => {
    if (mapsByZoom[zoom]) {
      setSpectrumZoom(zoom);
      setSpectrumError(undefined);
      return;
    }
    setSpectrumZoom(zoom);
    void fetchSpectrum(zoom).then((map) => {
      if (!map) {
        setSpectrumZoom("package");
      }
    });
  };

  const loadAnalysis = async (): Promise<void> => {
    if (!workspace) {
      setAnalysisError("Select a repository first.");
      return;
    }
    setLoadingAnalysis(true);
    setAnalysisError(undefined);
    try {
      const answer = await postJson<
        DashboardOk | { ok: false; error?: string }
      >("/api/host", props.token, {
        id: "intelligence",
        method: "dashboard",
        workspace,
      });
      if (!answer.ok) {
        setAnalysisError(answer.error ?? "Could not load analysis.");
        return;
      }
      const at = new Date().toISOString();
      setAnalysis(answer.data);
      setAnalyzedAt(at);
      const packageMap = await fetchSpectrum("package", {
        persistPackage: true,
        analysisData: answer.data,
        at,
      });
      if (packageMap) {
        setMapsByZoom({ [packageMap.zoom]: packageMap });
        setSpectrumZoom("package");
        // Prefetch file altitude so package drill-in has children ready.
        void fetchSpectrum("file");
      } else {
        setMapsByZoom({});
        writeCache(workspace, { analysis: answer.data, at });
      }
    } catch (cause) {
      setAnalysisError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const healthScore = asNumber(analysis?.health?.score);
  const testingScore = asNumber(analysis?.testingScore);
  const securityScore = asNumber(analysis?.securityScore);
  const landmarkCount = analysis?.map?.landmarks?.length;
  const clusterCount = analysis?.map?.clusters?.length;
  const selectedLabel =
    irisRepos.find((repo) => repo.path === workspace)?.label ??
    analysis?.repoLabel;

  return (
    <section className="console__panel">
      <h1 className="console__title">Iris</h1>
      <p className="console__lede">
        Iris is the accumulated knowledge of a workspace — the index, graphs,
        landmarks, and health. Pick a repository, then load analysis. Spectrum
        stays on that repo across reloads.
      </p>
      {error ? <EmptyState>{error}</EmptyState> : null}

      <div className="intel-context">
        <div>
          <h2 className="intel-heading">Repositories</h2>
          {irisRepos.filter((repo) => repo.jobCount > 0).length === 0 ? (
            <p className="console__lede">
              None with jobs yet. Run a job, then Iris can keep that repo.
            </p>
          ) : (
            <ul className="intel-list">
              {irisRepos
                .filter((repo) => repo.jobCount > 0)
                .map((repo) => (
                  <li key={repo.path} className="intel-list__repo">
                    <Button
                      type="button"
                      variant="tertiary"
                      className="intel-list__copy"
                      onClick={() => setWorkspace(repo.path)}
                    >
                      <strong>{repo.label}</strong>
                      <span>
                        {repo.jobCount} job{repo.jobCount === 1 ? "" : "s"}
                      </span>
                      {repo.error ? (
                        <span className="intel-list__error">{repo.error}</span>
                      ) : null}
                    </Button>
                    <a
                      className="intel-list__go"
                      href={jobsHash(repo.path)}
                      aria-label={`Open jobs for ${repo.label}`}
                    >
                      <ArrowRight size={16} aria-hidden />
                    </a>
                  </li>
                ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="intel-heading intel-heading--tip">
            Host connectors
            <Tooltip label="Host connectors">
              Plugins already signed in for this agent window (Cursor or Claude
              Code). A download in the plugin cache, or a plugin still waiting
              on mcp_auth, is not a connection. Prism holds no vendor
              credentials and never talks to Slack, Linear or GitHub itself.
            </Tooltip>
          </h2>
          {connectors && connectors.connectors.length > 0 ? (
            <ul className="intel-chips">
              {connectors.connectors.map((row) => (
                <li key={`${row.id}:${row.source}`}>{row.label}</li>
              ))}
            </ul>
          ) : (
            <p className="console__lede">
              None signed in for this agent window. Install Slack, Linear,
              GitHub or Calendar from the editor&apos;s own plugin settings and
              complete sign-in there.
            </p>
          )}
          {connectors?.unreadable.length ? (
            <p className="console__lede">
              {connectors.unreadable.length} connector path
              {connectors.unreadable.length === 1 ? " was" : "s were"}{" "}
              unreadable.
            </p>
          ) : null}
        </div>
      </div>

      <RepoSelect
        token={props.token}
        label="Repository"
        value={workspace}
        onChange={setWorkspace}
        repos={irisRepos}
      />

      <dl className="intel-stats">
        <div data-tone="brand">
          <dt>
            <CardIcon icon={Activity} /> Jobs
          </dt>
          <dd>{stats.total}</dd>
        </div>
        <div data-tone="brand">
          <dt>
            <CardIcon icon={Radio} /> Live
          </dt>
          <dd>{stats.live}</dd>
        </div>
        <div data-tone="amber">
          <dt>
            <CardIcon icon={Inbox} tone="amber" /> Awaiting approval
          </dt>
          <dd>{stats.waiting}</dd>
        </div>
        <div data-tone="amber">
          <dt>
            <CardIcon icon={FileCheck} tone="amber" /> Ready for review
          </dt>
          <dd>{stats.review}</dd>
        </div>
        <div data-tone="emerald">
          <dt>
            <CardIcon icon={CircleCheck} tone="emerald" /> Done
          </dt>
          <dd>{stats.done}</dd>
        </div>
        <div data-tone="rose">
          <dt>
            <CardIcon icon={CircleAlert} tone="rose" /> Failed
          </dt>
          <dd>{stats.failed}</dd>
        </div>
      </dl>

      {health ? (
        <dl className="console__facts">
          <div>
            <dt>Dispatch version</dt>
            <dd>{health.version}</dd>
          </div>
          <div>
            <dt>Repositories watched</dt>
            <dd>{health.workspaces}</dd>
          </div>
          <div>
            <dt>Analysis engine</dt>
            <dd>
              {health.intelligence.loaded ? "Loaded" : "Idle until asked"}
            </dd>
          </div>
        </dl>
      ) : !error ? (
        <p className="console__loading">Loading…</p>
      ) : null}

      <div className="intel-analysis">
        <div className="intel-analysis__copy">
          <h2 className="intel-heading">Repository analysis</h2>
          <p className="console__lede">
            Loads the same dashboard the editor uses for{" "}
            {selectedLabel ?? "the selected repository"}. First load indexes.
          </p>
        </div>
        <div className="intel-analysis__actions">
          {analyzedAt ? (
            <span className="intel-analysis__run">
              Last run {formatPrismDate(analyzedAt, "datetime")}
              <HoverTip label="When Prism last indexed this repository">
                <span aria-label="Last indexed">
                  <Calendar size={14} aria-hidden />
                </span>
              </HoverTip>
            </span>
          ) : null}
          <Button
            variant="secondary"
            disabled={loadingAnalysis || !workspace}
            icon={
              loadingAnalysis ? (
                <LoaderCircle size={16} aria-hidden />
              ) : analysis ? (
                <RefreshCw size={16} aria-hidden />
              ) : (
                <Sparkles size={16} aria-hidden />
              )
            }
            onClick={() => void loadAnalysis()}
          >
            {loadingAnalysis
              ? "Indexing…"
              : analysis
                ? "Refresh analysis"
                : "Load analysis"}
          </Button>
        </div>
      </div>
      {analysisError ? <EmptyState>{analysisError}</EmptyState> : null}
      {analysis ? (
        <dl className="console__facts">
          {analysis.repoLabel ? (
            <div>
              <dt>
                <CardIcon icon={FolderGit2} /> Repository
              </dt>
              <dd>{analysis.repoLabel}</dd>
            </div>
          ) : null}
          {analysis.branch ? (
            <div>
              <dt>
                <CardIcon icon={GitBranch} /> Branch
              </dt>
              <dd>
                <Truncate title={analysis.branch}>
                  <code>{analysis.branch}</code>
                </Truncate>
              </dd>
            </div>
          ) : null}
          {healthScore !== undefined ? (
            <div>
              <dt>
                <CardIcon icon={Activity} tone="emerald" /> Health
              </dt>
              <dd>
                {Math.round(healthScore)}
                {analysis.health?.grade ? ` (${analysis.health.grade})` : ""}
              </dd>
            </div>
          ) : null}
          {testingScore !== undefined ? (
            <div>
              <dt>
                <CardIcon icon={FlaskConical} tone="violet" /> Testing
              </dt>
              <dd>{Math.round(testingScore)}</dd>
            </div>
          ) : null}
          {securityScore !== undefined ? (
            <div>
              <dt>
                <CardIcon icon={Shield} tone="violet" /> Security
              </dt>
              <dd>{Math.round(securityScore)}</dd>
            </div>
          ) : null}
          {landmarkCount !== undefined ? (
            <div>
              <dt>
                <CardIcon icon={Landmark} tone="amber" /> Landmarks
              </dt>
              <dd>{landmarkCount}</dd>
            </div>
          ) : null}
          {clusterCount !== undefined ? (
            <div>
              <dt>
                <CardIcon icon={Boxes} tone="amber" /> Clusters
              </dt>
              <dd>{clusterCount}</dd>
            </div>
          ) : null}
          {analysis.dna?.primaryDomain ? (
            <div>
              <dt>
                <CardIcon icon={Compass} /> Primary domain
              </dt>
              <dd>{analysis.dna.primaryDomain}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <div className="intel-analysis">
        <div className="intel-analysis__copy">
          <h2 className="intel-heading">Spectrum</h2>
          <p className="console__lede">
            The repository map Iris already computed. Double-click a package to
            open files; use the Package breadcrumb to go back. Open sends the
            file to Cursor.
          </p>
        </div>
      </div>
      {spectrumError ? <EmptyState>{spectrumError}</EmptyState> : null}
      {spectrum ? (
        <div className="spectrum" aria-label="Spectrum">
          <RepositoryMapView
            map={spectrum}
            showBrand={false}
            {...(recentChanges ? { recentChanges } : {})}
            {...(analysis?.branch ? { branch: analysis.branch } : {})}
            onZoomChange={onSpectrumZoomChange}
            onOpenPath={(path) => {
              if (workspace) openInEditor(workspace, path);
            }}
            onShare={() => {
              void navigator.clipboard.writeText(window.location.href);
              showConsoleToast("Link copied");
            }}
            onBlastRadius={() => {
              window.open(
                "http://127.0.0.1:5173/#/blast",
                "_blank",
                "noreferrer",
              );
            }}
          />
        </div>
      ) : analysis && !spectrumError ? (
        <p className="console__lede">Spectrum loads with analysis.</p>
      ) : null}
    </section>
  );
}
