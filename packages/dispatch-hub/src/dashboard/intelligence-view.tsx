import { useEffect, useMemo, useState, type ReactElement } from "react";
import { EmptyState, Tooltip } from "@repo-prism/ui";
import {
  isLiveJob,
  isWaitingOnYou,
  type JobSummary,
  type JobWorkspaceChip,
} from "@repo-prism/app-shell";
import { ArrowRight } from "lucide-react";
import { jobsHash } from "./router.js";
import { getJson, postJson } from "./session.js";

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
  };
};

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function IntelligenceView(props: {
  readonly token: string;
  readonly jobs: readonly JobSummary[];
  readonly workspaces: readonly JobWorkspaceChip[];
}): ReactElement {
  const [health, setHealth] = useState<HealthResponse | undefined>();
  const [connectors, setConnectors] = useState<
    ConnectorsResponse | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  const [analysis, setAnalysis] = useState<DashboardOk["data"] | undefined>();
  const [analysisError, setAnalysisError] = useState<string | undefined>();
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

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

  const stats = useMemo(() => {
    const live = props.jobs.filter((job) => isLiveJob(job.status)).length;
    const waiting = props.jobs.filter((job) =>
      isWaitingOnYou(job.status),
    ).length;
    const review = props.jobs.filter(
      (job) => job.status === "needs_review",
    ).length;
    const done = props.jobs.filter((job) => job.status === "done").length;
    const failed = props.jobs.filter((job) => job.status === "error").length;
    return { live, waiting, review, done, failed, total: props.jobs.length };
  }, [props.jobs]);

  const loadAnalysis = async (): Promise<void> => {
    setLoadingAnalysis(true);
    setAnalysisError(undefined);
    try {
      const answer = await postJson<
        DashboardOk | { ok: false; error?: string }
      >("/api/host", props.token, { id: "intelligence", method: "dashboard" });
      if (!answer.ok) {
        setAnalysisError(answer.error ?? "Could not load analysis.");
        return;
      }
      setAnalysis(answer.data);
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

  return (
    <section className="console__panel">
      <h1 className="console__title">Intelligence</h1>
      <p className="console__lede">
        Dispatch already knows the jobs and repositories it is watching. Maps
        and blast radius still live in the editor — loading them here starts
        Core, so watching jobs stays free until you ask.
      </p>
      {error ? <EmptyState>{error}</EmptyState> : null}

      <dl className="intel-stats">
        <div>
          <dt>Jobs</dt>
          <dd>{stats.total}</dd>
        </div>
        <div>
          <dt>Live</dt>
          <dd>{stats.live}</dd>
        </div>
        <div>
          <dt>Need your OK</dt>
          <dd>{stats.waiting}</dd>
        </div>
        <div>
          <dt>Ready for review</dt>
          <dd>{stats.review}</dd>
        </div>
        <div>
          <dt>Done</dt>
          <dd>{stats.done}</dd>
        </div>
        <div>
          <dt>Failed</dt>
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
          {health.intelligence.workspace ? (
            <div>
              <dt>Indexed repository</dt>
              <dd>
                <code>{health.intelligence.workspace}</code>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : !error ? (
        <p className="console__loading">Loading…</p>
      ) : null}

      <h2 className="intel-heading">Repositories</h2>
      {props.workspaces.length === 0 ? (
        <p className="console__lede">
          None registered yet. Open a repo in your editor and run a Prism
          command.
        </p>
      ) : (
        <ul className="intel-list">
          {props.workspaces.map((repo) => (
            <li key={repo.path} className="intel-list__repo">
              <div className="intel-list__copy">
                <strong>{repo.label}</strong>
                <span>
                  {repo.jobCount} job{repo.jobCount === 1 ? "" : "s"}
                </span>
                {repo.error ? (
                  <span className="intel-list__error">{repo.error}</span>
                ) : null}
                <code>{repo.path}</code>
              </div>
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

      <h2 className="intel-heading intel-heading--tip">
        Host connectors
        <Tooltip label="Host connectors">
          Plugins already signed in for this agent window (Cursor or Claude
          Code). A download in the plugin cache, or a plugin still waiting on
          mcp_auth, is not a connection. Prism holds no vendor credentials and
          never talks to Slack, Linear or GitHub itself.
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
          None signed in for this agent window. Install Slack, Linear, GitHub or
          Calendar from the editor&apos;s own plugin settings and complete
          sign-in there.
        </p>
      )}
      {connectors?.unreadable.length ? (
        <p className="console__lede">
          {connectors.unreadable.length} connector path
          {connectors.unreadable.length === 1 ? " was" : "s were"} unreadable.
        </p>
      ) : null}

      <div className="intel-analysis">
        <div className="intel-analysis__copy">
          <h2 className="intel-heading">Repository analysis</h2>
          <p className="console__lede">
            Loads the same dashboard the editor uses. First load indexes the
            repo.
          </p>
        </div>
        <button
          type="button"
          className="intel-load"
          disabled={loadingAnalysis}
          onClick={() => void loadAnalysis()}
        >
          {loadingAnalysis
            ? "Indexing…"
            : analysis
              ? "Refresh analysis"
              : "Load analysis"}
        </button>
      </div>
      {analysisError ? <EmptyState>{analysisError}</EmptyState> : null}
      {analysis ? (
        <dl className="console__facts">
          {analysis.repoLabel ? (
            <div>
              <dt>Repository</dt>
              <dd>{analysis.repoLabel}</dd>
            </div>
          ) : null}
          {analysis.branch ? (
            <div>
              <dt>Branch</dt>
              <dd>
                <code>{analysis.branch}</code>
              </dd>
            </div>
          ) : null}
          {healthScore !== undefined ? (
            <div>
              <dt>Health</dt>
              <dd>
                {Math.round(healthScore)}
                {analysis.health?.grade ? ` (${analysis.health.grade})` : ""}
              </dd>
            </div>
          ) : null}
          {testingScore !== undefined ? (
            <div>
              <dt>Testing</dt>
              <dd>{Math.round(testingScore)}</dd>
            </div>
          ) : null}
          {securityScore !== undefined ? (
            <div>
              <dt>Security</dt>
              <dd>{Math.round(securityScore)}</dd>
            </div>
          ) : null}
          {landmarkCount !== undefined ? (
            <div>
              <dt>Landmarks</dt>
              <dd>{landmarkCount}</dd>
            </div>
          ) : null}
          {clusterCount !== undefined ? (
            <div>
              <dt>Clusters</dt>
              <dd>{clusterCount}</dd>
            </div>
          ) : null}
          {analysis.dna?.primaryDomain ? (
            <div>
              <dt>Primary domain</dt>
              <dd>{analysis.dna.primaryDomain}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
