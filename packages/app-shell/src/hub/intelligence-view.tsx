// @ts-nocheck — migrated from the daemon bundle; tighten later.
import { useEffect, useRef, useState, type ReactElement } from "react";
import { EmptyState, Tooltip, Text } from "@repo-prism/ui";
import {
  IRIS_BYTES_KEPT_TIP,
  IRIS_CUT_SHORT_TIP,
  IRIS_DUMP_NOT_SERVED_TIP,
  IRIS_FOLLOW_THROUGH_TIP,
  IRIS_HABIT_TIP,
  type JobSummary,
  type JobWorkspaceChip,
} from "../jobs-types.js";
import type { EnvelopeMetrics } from "./envelope-dto.js";
import type { LastPrepareSummary } from "./prepare-dto.js";
import {
  ArrowRight,
  CalendarCheck,
  FileMinus,
  Filter,
  PieChart,
  Scissors,
} from "lucide-react";
import { irisDefaultWorkspace } from "./fleet.js";
import { PrepareRunRow, prepareTotalsCards } from "./prepare-history.js";
import { explainIrisError, getJson } from "./session.js";
import {
  EnvelopeCards,
  formatEnvelopeBytes,
  formatEnvelopeDeltaPp,
  formatEnvelopePercent,
  formatEnvelopeTokens,
} from "./envelope-cards.js";

const IRIS_WORKSPACE_KEY = "prism.console.iris.workspace";

const REPOSITORY_ANALYSIS_TIP =
  "What Prism knows about this repository right now: which agent connectors are signed in, how much of each list reached the agent (Envelope), and the context packs built before a change (Prepare).";

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

type EnvelopeResponse = EnvelopeMetrics;

export function IntelligenceView(props: {
  readonly token: string;
  readonly jobs: readonly JobSummary[];
  readonly workspaces: readonly JobWorkspaceChip[];
  readonly selectedPath?: string;
  readonly onMoreDetails?: () => void;
  readonly onOpenPreparePage?: (initialRun?: string) => void;
}): ReactElement {
  const irisRepos = props.workspaces;
  const userPicked = useRef(false);
  const [connectors, setConnectors] = useState<
    ConnectorsResponse | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  const [workspace, setWorkspace] = useState("");
  const [envelope, setEnvelope] = useState<EnvelopeResponse | undefined>();
  const [envelopeError, setEnvelopeError] = useState<string | undefined>();
  const [prepareHistory, setPrepareHistory] = useState<
    readonly LastPrepareSummary[] | undefined
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
          setError(
            explainIrisError(
              cause instanceof Error ? cause.message : String(cause),
            ),
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [props.token]);

  useEffect(() => {
    if (!workspace) return;
    localStorage.setItem(IRIS_WORKSPACE_KEY, workspace);
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
          explainIrisError(
            cause instanceof Error ? cause.message : String(cause),
          ),
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

  return (
    <section className="jobs-screen console__panel">
      <div className="jobs-screen__head intel-head">
        <div>
          <Text variant="title" as="h1" className="jobs-screen__title">
            Iris
          </Text>
          <Text variant="lede" as="p" className="jobs-screen__lede">
            Iris is the accumulated knowledge of this workspace — the index,
            graphs, landmarks, and health.
          </Text>
        </div>
      </div>
      {error ? <EmptyState>{error}</EmptyState> : null}

      <div className="intel-analysis">
        <div className="intel-analysis__copy">
          <Text
            variant="heading"
            as="h2"
            className="intel-heading intel-heading--tip"
          >
            Repository analysis
            <Tooltip label="Repository analysis">
              {REPOSITORY_ANALYSIS_TIP}
            </Tooltip>
          </Text>
        </div>
      </div>

      <div>
        <Text
          variant="subheading"
          as="h3"
          className="intel-heading intel-heading--tip"
        >
          Host connectors
          <Tooltip label="Host connectors">
            Plugins signed in for this agent window (Cursor or Claude Code). A
            connection means a plugin has completed mcp_auth — a download
            sitting in the plugin cache doesn't count yet. The plugin itself
            talks to Slack, Linear, or GitHub; Prism only reads local sign-in
            state here.
          </Tooltip>
        </Text>
        {connectors && connectors.connectors.length > 0 ? (
          <ul className="intel-chips">
            {connectors.connectors.map((row) => (
              <li key={`${row.id}:${row.source}`}>{row.label}</li>
            ))}
          </ul>
        ) : (
          <EmptyState className="pulse-empty" title="No data found">
            None signed in for this agent window. Install Slack, Linear, GitHub
            or Calendar from the editor&apos;s own plugin settings and complete
            sign-in there.
          </EmptyState>
        )}
        {connectors?.unreadable.length ? (
          <Text variant="lede" as="p" className="jobs-screen__lede">
            {connectors.unreadable.length} connector path
            {connectors.unreadable.length === 1 ? " was" : "s were"} unreadable.
          </Text>
        ) : null}
      </div>

      <div className="envelope">
        <div className="envelope__head">
          <div className="envelope__head-copy">
            <Text
              variant="subheading"
              as="h3"
              className="intel-heading intel-heading--tip"
            >
              Envelope
              <Tooltip label="Envelope">{ENVELOPE_SECTION_TIP}</Tooltip>
            </Text>
            <Text variant="lede" as="p" className="jobs-screen__lede">
              How much of what Prism found actually reached the agent this week.
            </Text>
            <Text variant="caption" as="p" className="envelope__hint">
              Lower Sent % means Prism sent a smaller slice of the list.
            </Text>
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
            ]}
          />
        ) : (
          <EmptyState className="pulse-empty" title="No data found">
            No list calls recorded this week for this repo. Envelope fills in
            once this session or a teammate uses a Prism list tool.
          </EmptyState>
        )}

        <div className="prepare">
          <div className="envelope__head">
            <div className="envelope__head-copy">
              <Text
                variant="subheading"
                as="h3"
                className="intel-heading intel-heading--tip"
              >
                Prepare
                <Tooltip label="Prepare">{PREPARE_SECTION_TIP}</Tooltip>
              </Text>
              <Text variant="lede" as="p" className="jobs-screen__lede">
                The context pack Prism built for each prepare_change on this
                repo.
              </Text>
            </div>
            {prepareHistory &&
            prepareHistory.length > 0 &&
            props.onOpenPreparePage ? (
              <button
                type="button"
                className="envelope__more"
                onClick={() => props.onOpenPreparePage?.()}
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
              No prepare_change yet for this repo. Call it before you edit, or
              start a teammate after Iris has indexed.
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
                    <PrepareRunRow
                      run={run}
                      onOpen={() => props.onOpenPreparePage?.(run.generatedAt)}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
