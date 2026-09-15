import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  Button,
  CardIcon,
  EmptyState,
  HoverTip,
  Tooltip,
  Truncate,
  formatPrismDate,
} from "@repo-prism/ui";
import type { GitRecentFile } from "@repo-prism/shared";
import {
  IRIS_BYTES_KEPT_TIP,
  IRIS_CUT_SHORT_TIP,
  IRIS_DUMP_NOT_SERVED_TIP,
  IRIS_FOLLOW_THROUGH_TIP,
  IRIS_HABIT_TIP,
  IRIS_SOURCE_TIP,
  type JobSummary,
  type JobWorkspaceChip,
} from "@repo-prism/app-shell";
import type { EnvelopeMetrics, LastPrepareSummary } from "@repo-prism/dispatch";
import {
  Activity,
  ArrowRight,
  Boxes,
  Calendar,
  CalendarCheck,
  Compass,
  FileMinus,
  Filter,
  FlaskConical,
  FolderGit2,
  GitBranch,
  GitFork,
  Landmark,
  Layers,
  PieChart,
  RefreshCw,
  Scissors,
  Shield,
  Sparkles,
} from "lucide-react";
import { irisDefaultWorkspace } from "./fleet.js";
import { RepoSelect } from "./repo-select.js";
import { getJson, postJson } from "./session.js";
import {
  EnvelopeCards,
  formatEnvelopeBytes,
  formatEnvelopeDeltaPp,
  formatEnvelopePercent,
  formatEnvelopeTokens,
} from "./envelope-cards.js";

const IRIS_WORKSPACE_KEY = "prism.console.iris.workspace";

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

type EnvelopeResponse = EnvelopeMetrics;

type IrisCache = {
  readonly analysis: DashboardOk["data"];
  readonly at: string;
};

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

export function IntelligenceView(props: {
  readonly token: string;
  readonly jobs: readonly JobSummary[];
  readonly workspaces: readonly JobWorkspaceChip[];
  readonly selectedPath?: string;
  readonly onMoreDetails?: () => void;
}): ReactElement {
  const irisRepos = props.workspaces;
  const userPicked = useRef(false);
  const [connectors, setConnectors] = useState<
    ConnectorsResponse | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  const [workspace, setWorkspace] = useState("");
  const cached = workspace ? readCache(workspace) : undefined;
  const [analysis, setAnalysis] = useState<DashboardOk["data"] | undefined>(
    cached?.analysis,
  );
  const [analysisError, setAnalysisError] = useState<string | undefined>();
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analyzedAt, setAnalyzedAt] = useState<string | undefined>(cached?.at);
  const [envelope, setEnvelope] = useState<EnvelopeResponse | undefined>();
  const [envelopeError, setEnvelopeError] = useState<string | undefined>();
  const [prepareLast, setPrepareLast] = useState<
    LastPrepareSummary | null | undefined
  >();

  useEffect(() => {
    if (userPicked.current) return;
    const stored =
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(IRIS_WORKSPACE_KEY);
    const next = irisDefaultWorkspace(
      irisRepos,
      props.selectedPath,
      stored,
      props.jobs,
    );
    if (next) setWorkspace(next);
  }, [irisRepos, props.selectedPath, props.jobs]);

  useEffect(() => {
    let alive = true;
    void getJson<ConnectorsResponse>("/api/connectors", props.token)
      .then((nextConnectors) => {
        if (!alive) return;
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
    setAnalyzedAt(next?.at);
    setAnalysisError(undefined);
  }, [workspace]);

  useEffect(() => {
    if (!workspace) {
      setEnvelope(undefined);
      return;
    }
    let alive = true;
    setEnvelope(undefined);
    setEnvelopeError(undefined);
    void getJson<EnvelopeResponse>(
      `/api/envelope?workspace=${encodeURIComponent(workspace)}`,
      props.token,
    )
      .then((next) => {
        if (alive) setEnvelope(next);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setEnvelope(undefined);
        setEnvelopeError(
          cause instanceof Error ? cause.message : String(cause),
        );
      });
    return () => {
      alive = false;
    };
  }, [workspace, props.token]);

  useEffect(() => {
    if (!workspace) {
      setPrepareLast(undefined);
      return;
    }
    let alive = true;
    setPrepareLast(undefined);
    void getJson<{ last: LastPrepareSummary | null }>(
      `/api/prepare-last?workspace=${encodeURIComponent(workspace)}`,
      props.token,
    )
      .then((next) => {
        if (alive) setPrepareLast(next.last ?? null);
      })
      .catch(() => {
        if (alive) setPrepareLast(null);
      });
    return () => {
      alive = false;
    };
  }, [workspace, props.token]);

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
      writeCache(workspace, { analysis: answer.data, at });
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
        landmarks, and health. Pick a repository, then load analysis. Envelope
        metrics are for that repo only, on this machine, never uploaded.
      </p>
      {error ? <EmptyState>{error}</EmptyState> : null}

      <RepoSelect
        token={props.token}
        label="Repos"
        className="fleet-toolbar__repo-select"
        value={workspace}
        onChange={(path) => {
          userPicked.current = true;
          setWorkspace(path);
        }}
        repos={irisRepos}
      />

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
            loading={loadingAnalysis}
            icon={
              analysis ? (
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

      <div className="prepare-last">
        <h2 className="intel-heading">Last prepare</h2>
        <p className="console__lede">
          Pack, reuse, and House Style from the last prepare_change on this
          repo. Paths and why only — not a map.
        </p>
        {!workspace ? (
          <p className="envelope__empty">Select a repository first.</p>
        ) : prepareLast === undefined ? (
          <p className="envelope__empty">Loading last prepare…</p>
        ) : prepareLast === null ? (
          <EmptyState>
            No prepare_change yet for this repo. Call it before you edit, or
            start a teammate after Iris has indexed.
          </EmptyState>
        ) : (
          <>
            <dl className="console__facts">
              <div>
                <dt>
                  <CardIcon icon={Layers} /> Task
                </dt>
                <dd>{prepareLast.task}</dd>
              </div>
              <div>
                <dt>Pack files</dt>
                <dd>
                  {prepareLast.packFiles.length}
                  {prepareLast.truncated
                    ? ` of ${prepareLast.totalCount} (truncated)`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Reuse</dt>
                <dd>
                  {prepareLast.reuse.length === 0
                    ? "none (unavailable)"
                    : String(prepareLast.reuse.length)}
                </dd>
              </div>
              {prepareLast.ambiguous ? (
                <div>
                  <dt>Ambiguous</dt>
                  <dd>
                    {prepareLast.ambiguous.query}:{" "}
                    {prepareLast.ambiguous.candidates
                      .map((c) => c.path)
                      .join("; ")}
                  </dd>
                </div>
              ) : null}
            </dl>
            {prepareLast.packFiles.length > 0 ? (
              <ul className="prepare-last__files">
                {prepareLast.packFiles.map((file) => (
                  <li key={file.path}>
                    <code>{file.path}</code>
                    {file.why.length > 0 ? (
                      <span className="prepare-last__why">
                        {file.why.join("; ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {prepareLast.reuse.length > 0 ? (
              <ul className="prepare-last__files">
                {prepareLast.reuse.map((hit) => (
                  <li key={`${hit.path}:${hit.symbol}`}>
                    <code>{hit.symbol}</code>
                    <span className="prepare-last__why">{hit.path}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>

      <div className="envelope">
        <div className="envelope__head">
          <div className="envelope__head-copy">
            <h2 className="intel-heading">Envelope</h2>
            <p className="console__lede">
              Pipe · True Refs · Honest Edges · Context Pack · Reuse First.
            </p>
          </div>
          {props.onMoreDetails ? (
            <button
              type="button"
              className="envelope__more"
              onClick={props.onMoreDetails}
            >
              <span>More details</span>
              <ArrowRight size={16} aria-hidden />
            </button>
          ) : null}
        </div>
        {envelopeError ? (
          <p className="envelope__empty">{envelopeError}</p>
        ) : envelope === undefined ? (
          <p className="envelope__empty">Loading Envelope…</p>
        ) : envelope.available ? (
          <>
            <EnvelopeCards
              density="iris"
              cards={[
                {
                  id: "bytes",
                  label: "Sent %",
                  tip: IRIS_BYTES_KEPT_TIP,
                  value: formatEnvelopePercent(envelope.bytesKeptRatio),
                  unit: "of the full list",
                  sub:
                    envelope.bytesKeptDeltaPp !== null
                      ? `${formatEnvelopeDeltaPp(envelope.bytesKeptDeltaPp)} vs last`
                      : undefined,
                  subTone:
                    envelope.bytesKeptDeltaPp !== null &&
                    envelope.bytesKeptDeltaPp < 0
                      ? "safe"
                      : "muted",
                  icon: PieChart,
                  tone: "brand",
                },
                {
                  id: "cut",
                  label: "Partial",
                  tip: IRIS_CUT_SHORT_TIP,
                  value: formatEnvelopePercent(envelope.cutShortRate, 0),
                  unit: "of list calls",
                  sub:
                    envelope.truncatedCalls !== null &&
                    envelope.listCalls !== null
                      ? `${envelope.truncatedCalls} of ${envelope.listCalls} partial`
                      : undefined,
                  icon: Scissors,
                  tone: "violet",
                },
                {
                  id: "follow",
                  label: "Then focused",
                  tip: IRIS_FOLLOW_THROUGH_TIP,
                  value: formatEnvelopePercent(envelope.followThrough, 0),
                  unit: "after a partial",
                  sub: "heuristic",
                  icon: Filter,
                  tone: "brand",
                },
                {
                  id: "dump",
                  label: "Not sent",
                  tip: IRIS_DUMP_NOT_SERVED_TIP,
                  value: formatEnvelopeBytes(envelope.dumpNotServedBytes),
                  unit: formatEnvelopeTokens(envelope.dumpNotServedTokens)
                    ? `· ${formatEnvelopeTokens(envelope.dumpNotServedTokens)}`
                    : undefined,
                  sub: "held back",
                  icon: FileMinus,
                  tone: "emerald",
                },
                {
                  id: "habit",
                  label: "≤5-call days",
                  tip: IRIS_HABIT_TIP,
                  value:
                    envelope.habitDays === null
                      ? "—"
                      : `${envelope.habitDays} / ${envelope.habitDenom ?? 7}`,
                  unit: "days",
                  sub:
                    envelope.habitDelta !== null
                      ? `${envelope.habitDelta > 0 ? "+" : ""}${envelope.habitDelta} day${Math.abs(envelope.habitDelta) === 1 ? "" : "s"} vs prev`
                      : undefined,
                  subTone:
                    envelope.habitDelta !== null && envelope.habitDelta > 0
                      ? "safe"
                      : "muted",
                  icon: CalendarCheck,
                  tone: "amber",
                },
                {
                  id: "source",
                  label: "Source",
                  tip: IRIS_SOURCE_TIP,
                  value:
                    envelope.chatCalls === null
                      ? "—"
                      : String(envelope.chatCalls),
                  unit:
                    envelope.jobCalls !== null
                      ? `chat · ${envelope.jobCalls} jobs`
                      : "chat",
                  sub: "Chat vs jobs",
                  icon: GitFork,
                  tone: "violet",
                },
              ]}
            />
            <p className="envelope-note">
              Lower Sent % means Prism sent a smaller slice of the list. Not
              Pulse job tokens.
            </p>
          </>
        ) : (
          <EmptyState>
            No list calls recorded this week for this repo. Envelope fills when
            this chat or a teammate uses list tools — not from the job&apos;s
            billed tokens. A job that never used those tools leaves this board
            unchanged.
          </EmptyState>
        )}
      </div>

      <div>
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
            None signed in for this agent window. Install Slack, Linear, GitHub
            or Calendar from the editor&apos;s own plugin settings and complete
            sign-in there.
          </p>
        )}
        {connectors?.unreadable.length ? (
          <p className="console__lede">
            {connectors.unreadable.length} connector path
            {connectors.unreadable.length === 1 ? " was" : "s were"} unreadable.
          </p>
        ) : null}
      </div>
    </section>
  );
}
