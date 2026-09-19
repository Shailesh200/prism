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
import { PrepareHistoryDrawer, prepareTotalsCards } from "./prepare-history.js";
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

const ENVELOPE_SECTION_TIP =
  "Envelope tracks Prism's list tools — search, references, blast radius, and the rest. Each metric compares what Prism found to what it actually sent the agent: how much got through, how often it was cut short, and how often the agent followed up with a smaller question instead of asking for the rest.";

const PREPARE_SECTION_TIP =
  "Before a teammate edits this repo, prepare_change builds a context pack: the files it thinks matter and why, code it found reusable, and any House Style conventions to follow. Click a run below for its full file list, or View all runs to see every past run.";

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
  const [prepareHistory, setPrepareHistory] = useState<
    readonly LastPrepareSummary[] | undefined
  >();
  const [prepareDrawer, setPrepareDrawer] = useState<
    { readonly initialRun?: string } | undefined
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
      setPrepareHistory(undefined);
      return;
    }
    let alive = true;
    setPrepareHistory(undefined);
    void getJson<{ runs: LastPrepareSummary[] }>(
      `/api/prepare-history?workspace=${encodeURIComponent(workspace)}`,
      props.token,
    )
      .then((next) => {
        if (alive) setPrepareHistory(next.runs);
      })
      .catch(() => {
        if (alive) setPrepareHistory([]);
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
      <div className="intel-head">
        <h1 className="console__title">Iris</h1>
        <RepoSelect
          token={props.token}
          aria-label="Repos"
          className="fleet-toolbar__repo-select"
          value={workspace}
          onChange={(path) => {
            userPicked.current = true;
            setWorkspace(path);
          }}
          repos={irisRepos}
        />
      </div>
      <p className="console__lede">
        Iris is the accumulated knowledge of a workspace — the index, graphs,
        landmarks, and health. Pick a repository, then load analysis. Envelope
        metrics stay local to that repo, on this machine.
      </p>
      {error ? <EmptyState>{error}</EmptyState> : null}

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

      {!analysis ? (
        <EmptyState className="pulse-empty" title="No data found">
          This repository has not been indexed yet. Load analysis to see
          Envelope, Prepare, and Host connectors.
        </EmptyState>
      ) : (
        <>
          <div className="envelope">
            <div className="envelope__head">
              <div className="envelope__head-copy">
                <h3 className="intel-heading intel-heading--tip">
                  Envelope
                  <Tooltip label="Envelope">{ENVELOPE_SECTION_TIP}</Tooltip>
                </h3>
                <p className="console__lede">
                  How much of what Prism found actually reached the agent this
                  week.
                </p>
                <p className="envelope__hint">
                  Lower Sent % means Prism sent a smaller slice of the list.
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
            ) : (
              <EmptyState className="pulse-empty" title="No data found">
                No list calls recorded this week for this repo. Envelope fills
                in once this session or a teammate uses a Prism list tool.
              </EmptyState>
            )}

            <div className="prepare">
              <div className="envelope__head">
                <div className="envelope__head-copy">
                  <h4 className="intel-heading intel-heading--tip">
                    Prepare
                    <Tooltip label="Prepare">{PREPARE_SECTION_TIP}</Tooltip>
                  </h4>
                  <p className="console__lede">
                    The context pack Prism built for each prepare_change on this
                    repo.
                  </p>
                </div>
                {prepareHistory && prepareHistory.length > 3 ? (
                  <button
                    type="button"
                    className="envelope__more"
                    onClick={() => setPrepareDrawer({})}
                  >
                    <span>View all runs</span>
                    <ArrowRight size={16} aria-hidden />
                  </button>
                ) : null}
              </div>
              {!workspace ? (
                <p className="envelope__empty">Select a repository first.</p>
              ) : prepareHistory === undefined ? (
                <p className="envelope__empty">Loading prepare history…</p>
              ) : prepareHistory.length === 0 ? (
                <EmptyState className="pulse-empty" title="No data found">
                  No prepare_change yet for this repo. Call it before you edit,
                  or start a teammate after Iris has indexed.
                </EmptyState>
              ) : (
                <>
                  <EnvelopeCards
                    density="iris"
                    cards={prepareTotalsCards(prepareHistory)}
                  />
                  <ul className="prepare-runs">
                    {prepareHistory.slice(0, 3).map((run) => (
                      <li key={run.generatedAt}>
                        <button
                          type="button"
                          className="prepare-runs__row"
                          onClick={() =>
                            setPrepareDrawer({ initialRun: run.generatedAt })
                          }
                        >
                          <CardIcon icon={Layers} />
                          <span className="prepare-runs__copy">
                            <span className="prepare-runs__task">
                              {run.task}
                            </span>
                            <span className="prepare-runs__meta">
                              {formatPrismDate(run.generatedAt, "datetime")} ·{" "}
                              {run.packFiles.length} pack file
                              {run.packFiles.length === 1 ? "" : "s"} ·{" "}
                              {run.reuse.length} reuse
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          <div>
            <h3 className="intel-heading intel-heading--tip">
              Host connectors
              <Tooltip label="Host connectors">
                Plugins signed in for this agent window (Cursor or Claude Code).
                A connection means a plugin has completed mcp_auth — a download
                sitting in the plugin cache doesn't count yet. The plugin itself
                talks to Slack, Linear, or GitHub; Prism only reads local
                sign-in state here.
              </Tooltip>
            </h3>
            {connectors && connectors.connectors.length > 0 ? (
              <ul className="intel-chips">
                {connectors.connectors.map((row) => (
                  <li key={`${row.id}:${row.source}`}>{row.label}</li>
                ))}
              </ul>
            ) : (
              <EmptyState className="pulse-empty" title="No data found">
                None signed in for this agent window. Install Slack, Linear,
                GitHub or Calendar from the editor&apos;s own plugin settings
                and complete sign-in there.
              </EmptyState>
            )}
            {connectors?.unreadable.length ? (
              <p className="console__lede">
                {connectors.unreadable.length} connector path
                {connectors.unreadable.length === 1 ? " was" : "s were"}{" "}
                unreadable.
              </p>
            ) : null}
          </div>
        </>
      )}
      {prepareDrawer && workspace ? (
        <PrepareHistoryDrawer
          token={props.token}
          workspace={workspace}
          {...(selectedLabel ? { workspaceLabel: selectedLabel } : {})}
          {...(prepareDrawer.initialRun
            ? { initialRun: prepareDrawer.initialRun }
            : {})}
          onClose={() => setPrepareDrawer(undefined)}
        />
      ) : null}
    </section>
  );
}
