// @ts-nocheck — migrated from the daemon bundle; tighten later.
import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Button,
  EmptyState,
  Tooltip,
  formatPrismDate,
  Text,
} from "@repo-prism/ui";
import type { LastPrepareSummary } from "./prepare-dto.js";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  ListFilter,
  Palette,
  Recycle,
} from "lucide-react";
import type { EnvelopeMetricCard } from "./envelope-cards.js";
import { Pager, pageSlice } from "./pager.js";
import { getJson } from "./session.js";

const PACK_FILES_TIP =
  "The files prepare_change picked for this task, with why each one was included (ownership, feature match, or a name overlap). wt is map-token weight — how much of the pack budget the file's path, symbol names, and why take — not the file's size.";

const PACK_WEIGHT_TIP =
  "Map-token weight: characters in the path + exported symbols + why, divided by 4. Lower costs less of the pack budget. Not source-file size.";

const REUSE_SCORE_TIP =
  "How closely this symbol's name or signature matches the task. Higher is a stronger reuse candidate.";

const REUSE_HITS_TIP =
  "Existing code that looks like it already does part of this task — a name or signature overlap prepare_change found before suggesting anything new be written.";

const HOUSE_STYLE_TIP =
  "The exemplar file for each convention this repo already follows (how a route handler, screen, or worker is normally structured) — so new code matches the pattern instead of inventing another one.";

const WORK_ORDER_TIP =
  "In-scope files, off-limits (generated or vendor), and paths that need sign-off. Blocked is not armed until an Accepted ADR turns on the write veto.";

type NumberTone = "good" | "warn" | "bad" | "neutral";

/** Lower is better — a heavier file eats more of the pack's token budget. */
function weightTone(weight: number): NumberTone {
  if (weight <= 30) return "good";
  if (weight <= 100) return "warn";
  return "bad";
}

/** Higher is better — a stronger name/signature match on the task. */
function matchTone(score: number): NumberTone {
  if (score >= 0.8) return "good";
  if (score >= 0.5) return "warn";
  return "bad";
}

/** `route-handler` -> "Route handler" — the raw slug isn't meant for display. */
function patternLabel(patternId: string): string {
  return patternId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const PACK_FILES_PAGE_SIZE = 15;
const REUSE_HITS_PAGE_SIZE = 15;
const HOUSE_STYLE_PAGE_SIZE = 5;

function prepareListWhen(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const start = (value: Date): number =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return formatPrismDate(iso, "datetime");
}

function PrepareSection(props: {
  readonly title: string;
  readonly tip: string;
  readonly meta?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className="prepare-section">
      <header className="prepare-section__head">
        <Text variant="section" as="h3">
          {props.title}
          {props.meta ? (
            <Text variant="caption" as="span" className="prepare-section__meta">
              {props.meta}
            </Text>
          ) : null}
        </Text>
        <Tooltip label={props.title}>{props.tip}</Tooltip>
      </header>
      {props.children}
    </section>
  );
}

function PrepareRunDetail(props: {
  readonly run: LastPrepareSummary;
}): ReactElement {
  const run = props.run;
  const [packPage, setPackPage] = useState(0);
  const [reusePage, setReusePage] = useState(0);
  const [conventionPage, setConventionPage] = useState(0);

  return (
    <div className="prepare-run">
      <header className="prepare-hero">
        <Text variant="headline" as="p" className="prepare-hero__task">
          {run.task}
        </Text>
      </header>
      <div className="prepare-run__body">
        <dl className="prepare-kpis">
          <div className="prepare-kpi">
            <Text variant="label" as="dt">
              Ran
            </Text>
            <Text variant="metric" as="dd">
              {prepareListWhen(run.generatedAt)}
            </Text>
          </div>
          <div className="prepare-kpi">
            <Text variant="label" as="dt">
              Pack files
            </Text>
            <Text variant="metric" as="dd">
              {run.packFiles.length}
              <Text variant="caption" as="span" className="prepare-kpi__sub">
                {run.truncated ? ` of ${run.totalCount}` : " files"}
              </Text>
            </Text>
          </div>
          <div className="prepare-kpi">
            <Text variant="label" as="dt">
              Reuse
            </Text>
            <Text variant="metric" as="dd">
              {run.reuse.length}
              <Text variant="caption" as="span" className="prepare-kpi__sub">
                {" "}
                hits
              </Text>
            </Text>
          </div>
          <div className="prepare-kpi">
            <Text variant="label" as="dt">
              House style
            </Text>
            <Text variant="metric" as="dd">
              {run.conventions.length}
              <Text variant="caption" as="span" className="prepare-kpi__sub">
                {" "}
                rules
              </Text>
            </Text>
          </div>
        </dl>

        {run.ambiguous ? (
          <EmptyState>
            Prism matched &quot;{run.ambiguous.query}&quot; to more than one
            symbol: {run.ambiguous.candidates.map((c) => c.path).join(", ")}.
            House Style picked the canonical one; the rest are listed here for
            reference.
          </EmptyState>
        ) : null}

        <div className="prepare-split">
          <PrepareSection
            title="Pack files"
            tip={PACK_FILES_TIP}
            meta={
              run.truncated
                ? `${run.packFiles.length} of ${run.totalCount}`
                : `${run.packFiles.length} artifacts`
            }
          >
            {run.packFiles.length > 0 ? (
              <>
                <ul className="prepare-lines">
                  {pageSlice(run.packFiles, packPage, PACK_FILES_PAGE_SIZE).map(
                    (row) => (
                      <li
                        key={row.path}
                        className="prepare-line"
                        title={
                          row.why.length > 0 ? row.why.join(" · ") : row.path
                        }
                      >
                        <Text
                          variant="code"
                          as="code"
                          className="prepare-line__title"
                        >
                          {row.path}
                        </Text>
                        <span
                          className="prepare-line__badge"
                          data-tone={weightTone(row.tokenWeight)}
                          title={PACK_WEIGHT_TIP}
                        >
                          {row.tokenWeight} wt
                        </span>
                      </li>
                    ),
                  )}
                </ul>
                <Pager
                  className="prepare-pager"
                  page={packPage}
                  pageSize={PACK_FILES_PAGE_SIZE}
                  total={run.packFiles.length}
                  onPage={setPackPage}
                />
              </>
            ) : (
              <p className="envelope__empty">No files packed for this run.</p>
            )}
          </PrepareSection>

          <PrepareSection
            title="Reuse hits"
            tip={REUSE_HITS_TIP}
            meta={`${run.reuse.length} symbols`}
          >
            {run.reuse.length > 0 ? (
              <>
                <ul className="prepare-lines">
                  {pageSlice(run.reuse, reusePage, REUSE_HITS_PAGE_SIZE).map(
                    (row) => (
                      <li
                        key={`${row.path}:${row.symbol}`}
                        className="prepare-line"
                        title={row.path}
                      >
                        <span className="prepare-line__mark" aria-hidden>
                          ƒ
                        </span>
                        <Text
                          variant="code"
                          as="code"
                          className="prepare-line__title"
                        >
                          {row.symbol}
                        </Text>
                        <span
                          className="prepare-line__badge prepare-line__badge--match"
                          data-tone={matchTone(row.score)}
                          title={REUSE_SCORE_TIP}
                        >
                          {Math.round(row.score * 100)}%
                        </span>
                      </li>
                    ),
                  )}
                </ul>
                <Pager
                  className="prepare-pager"
                  page={reusePage}
                  pageSize={REUSE_HITS_PAGE_SIZE}
                  total={run.reuse.length}
                  onPage={setReusePage}
                />
              </>
            ) : (
              <p className="envelope__empty">
                Reuse detection found nothing for this task.
              </p>
            )}
          </PrepareSection>
        </div>

        <PrepareSection
          title="House Style"
          tip={HOUSE_STYLE_TIP}
          meta={`${run.conventions.length} rules`}
        >
          {run.conventions.length > 0 ? (
            <>
              <ul className="prepare-lines">
                {pageSlice(
                  run.conventions,
                  conventionPage,
                  HOUSE_STYLE_PAGE_SIZE,
                ).map((row) => (
                  <li
                    key={`${row.path}:${row.patternId}`}
                    className="prepare-line"
                    title={row.whyCanonical}
                  >
                    <Text
                      variant="code"
                      as="span"
                      className="prepare-line__title"
                    >
                      {patternLabel(row.patternId)}
                    </Text>
                    <code className="prepare-line__meta">{row.path}</code>
                  </li>
                ))}
              </ul>
              <Pager
                className="prepare-pager"
                page={conventionPage}
                pageSize={HOUSE_STYLE_PAGE_SIZE}
                total={run.conventions.length}
                onPage={setConventionPage}
              />
            </>
          ) : (
            <p className="envelope__empty">
              No House Style conventions matched this task.
            </p>
          )}
        </PrepareSection>

        <PrepareSection title="Work order" tip={WORK_ORDER_TIP}>
          {run.order ? (
            <WorkOrderFlow order={run.order} />
          ) : (
            <p className="envelope__empty">No work order on this run.</p>
          )}
        </PrepareSection>
      </div>
    </div>
  );
}

const WORK_ORDER_FILE_PREVIEW = 10;

type WorkOrderStepId = "scope" | "signoff" | "offlimits" | "hook";

function WorkOrderFlow(props: {
  readonly order: {
    readonly hookArmed: boolean;
    readonly offLimits: readonly {
      readonly path: string;
      readonly reason: string;
    }[];
    readonly needsSignOff: readonly string[];
    readonly inScope: readonly string[];
  };
}): ReactElement {
  const { order } = props;
  const steps: readonly {
    readonly id: WorkOrderStepId;
    readonly label: string;
    readonly value: string;
    readonly hint: string;
    readonly paths: readonly {
      readonly path: string;
      readonly note?: string;
    }[];
  }[] = [
    {
      id: "scope",
      label: "In scope",
      value: String(order.inScope.length),
      hint: "Files this run may change.",
      paths: order.inScope.map((path) => ({ path })),
    },
    {
      id: "signoff",
      label: "Sign-off",
      value: String(order.needsSignOff.length),
      hint: "Ask before writing these paths.",
      paths: order.needsSignOff.map((path) => ({ path })),
    },
    {
      id: "offlimits",
      label: "Off-limits",
      value: String(order.offLimits.length),
      hint: "Generated or vendor — do not touch.",
      paths: order.offLimits.map((row) => ({
        path: row.path,
        note: row.reason,
      })),
    },
    {
      id: "hook",
      label: "Hook",
      value: order.hookArmed ? "Armed" : "Advisory",
      hint: order.hookArmed ? "Blocked and needs-sign-off veto writes." : "",
      paths: [],
    },
  ];
  const [active, setActive] = useState<WorkOrderStepId>("scope");
  const current = steps.find((step) => step.id === active) ?? steps[0];

  return (
    <div className="prepare-wo-canvas">
      <ol className="prepare-wo-flow">
        {steps.map((step, index) => (
          <li key={step.id} className="prepare-wo-flow__item">
            {index > 0 ? (
              <span className="prepare-wo-arrow" aria-hidden>
                <span className="prepare-wo-arrow__line" />
                <ChevronRight size={14} />
              </span>
            ) : null}
            <button
              type="button"
              className="prepare-wo-node"
              data-active={step.id === active ? "true" : "false"}
              data-step={step.id}
              onClick={() => setActive(step.id)}
            >
              <span className="prepare-wo-node__n">{index + 1}</span>
              <span className="prepare-wo-node__k">{step.label}</span>
              <span className="prepare-wo-node__v">{step.value}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="prepare-wo-canvas__pane">
        {current.hint ? (
          <p className="prepare-wo-canvas__hint">{current.hint}</p>
        ) : null}
        {current.paths.length > 0 ? (
          <ul className="prepare-wo-canvas__paths">
            {current.paths.slice(0, WORK_ORDER_FILE_PREVIEW).map((row) => (
              <li key={row.path}>
                <code>{row.path}</code>
                {row.note ? <span>{row.note}</span> : null}
              </li>
            ))}
            {current.paths.length > WORK_ORDER_FILE_PREVIEW ? (
              <li className="prepare-wo-canvas__more">
                +{current.paths.length - WORK_ORDER_FILE_PREVIEW} more
              </li>
            ) : null}
          </ul>
        ) : current.id !== "hook" ? (
          <p className="prepare-wo-canvas__empty">None</p>
        ) : null}
      </div>
    </div>
  );
}

export function PrepareRunRow(props: {
  readonly run: LastPrepareSummary;
  readonly onOpen: () => void;
}): ReactElement {
  const { run } = props;
  return (
    <button type="button" className="prepare-runs__row" onClick={props.onOpen}>
      <span className="prepare-runs__icon" aria-hidden>
        <Layers size={16} />
      </span>
      <span className="prepare-runs__copy">
        <span className="prepare-runs__task">{run.task}</span>
        <span className="prepare-runs__meta">
          {formatPrismDate(run.generatedAt, "datetime")}
        </span>
      </span>
      <span className="prepare-runs__pills">
        <span className="prepare-pill prepare-pill--files">
          <span className="prepare-pill__n">{run.packFiles.length}</span>
          {` file${run.packFiles.length === 1 ? "" : "s"}`}
        </span>
        <span className="prepare-pill prepare-pill--reuse">
          <span className="prepare-pill__n">{run.reuse.length}</span>
          {" reuse"}
        </span>
        <span className="prepare-pill prepare-pill--style">
          <span className="prepare-pill__n">{run.conventions.length}</span>
          {" style"}
        </span>
      </span>
    </button>
  );
}

function PrepareMdRunRow(props: {
  readonly run: LastPrepareSummary;
  readonly selected?: boolean;
  readonly onOpen: () => void;
}): ReactElement {
  const { run } = props;
  return (
    <button
      type="button"
      className="prepare-md-row"
      data-selected={props.selected ? "true" : undefined}
      onClick={props.onOpen}
    >
      <span className="prepare-md-row__task">{run.task}</span>
      <span className="prepare-md-row__when">
        {prepareListWhen(run.generatedAt)}
      </span>
      <span className="prepare-md-row__counts">
        <span>
          <span className="prepare-md-row__k">pk</span>
          <span className="prepare-md-row__v">{run.packFiles.length}</span>
        </span>
        <span>
          <span className="prepare-md-row__k">re</span>
          <span className="prepare-md-row__v prepare-md-row__v--teal">
            {run.reuse.length}
          </span>
        </span>
        <span>
          <span className="prepare-md-row__k">st</span>
          <span className="prepare-md-row__v">{run.conventions.length}</span>
        </span>
      </span>
    </button>
  );
}

export function prepareTotalsCards(
  history: readonly LastPrepareSummary[],
): readonly EnvelopeMetricCard[] {
  const packFiles = history.reduce((sum, r) => sum + r.packFiles.length, 0);
  const reuse = history.reduce((sum, r) => sum + r.reuse.length, 0);
  const conventions = history.reduce((sum, r) => sum + r.conventions.length, 0);
  return [
    {
      id: "runs",
      label: "Total Runs",
      tip: "Every prepare_change call recorded for this repo.",
      value: String(history.length),
      icon: Layers,
      tone: "brand",
    },
    {
      id: "pack",
      label: "Total Packed files",
      tip: "Total files packed across every run.",
      value: String(packFiles),
      icon: FileText,
      tone: "amber",
    },
    {
      id: "reuse",
      label: "Total Reuse hits",
      tip: "Total existing code found reusable across every run.",
      value: String(reuse),
      icon: Recycle,
      tone: "emerald",
    },
    {
      id: "conventions",
      label: "House Style",
      tip: "Total House Style conventions matched across every run.",
      value: String(conventions),
      icon: Palette,
      tone: "violet",
    },
  ];
}

function usePrepareHistory(
  token: string,
  workspace: string,
): {
  readonly history: readonly LastPrepareSummary[] | undefined;
  readonly error: string | undefined;
} {
  const [history, setHistory] = useState<
    readonly LastPrepareSummary[] | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    let alive = true;
    setHistory(undefined);
    setError(undefined);
    void getJson<{ runs: LastPrepareSummary[] }>(
      `/api/prepare-history?workspace=${encodeURIComponent(workspace)}`,
      token,
    )
      .then((next) => {
        if (alive) setHistory(next.runs);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setHistory([]);
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      alive = false;
    };
  }, [workspace, token]);
  return { history, error };
}

/** Variant C master-detail — a full page, not the Iris overlay drawer. */
export function PrepareHistoryPage(props: {
  readonly token: string;
  readonly workspace: string;
  readonly initialRun?: string;
  readonly onBack: () => void;
}): ReactElement {
  const { history, error } = usePrepareHistory(props.token, props.workspace);
  const [viewId, setViewId] = useState<string | undefined>(props.initialRun);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!history) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return history;
    return history.filter((row) => row.task.toLowerCase().includes(needle));
  }, [history, query]);

  useEffect(() => {
    if (!history || history.length === 0) return;
    const preferred =
      props.initialRun &&
      history.some((row) => row.generatedAt === props.initialRun)
        ? props.initialRun
        : undefined;
    if (viewId && filtered.some((row) => row.generatedAt === viewId)) return;
    const next =
      preferred ?? filtered[0]?.generatedAt ?? history[0]?.generatedAt;
    if (next) setViewId(next);
  }, [filtered, history, props.initialRun, viewId]);

  const viewing = viewId
    ? history?.find((row) => row.generatedAt === viewId)
    : undefined;

  return (
    <section className="prepare-page">
      <div className="envelope-details__head">
        <div className="envelope-details__title">
          <Button
            type="button"
            variant="ghost"
            className="envelope-details__back"
            aria-label="Back to Iris"
            icon={<ChevronLeft size={16} aria-hidden />}
            onClick={props.onBack}
          />
          <div>
            <Text variant="title" as="h1" className="console__title">
              Prepare
            </Text>
            <Text variant="lede" as="p" className="console__lede">
              {history
                ? `${history.length} run${history.length === 1 ? "" : "s"} on this machine.`
                : "Context packs on this machine."}
            </Text>
          </div>
        </div>
      </div>
      {error ? (
        <EmptyState>{error}</EmptyState>
      ) : history === undefined ? (
        <p className="envelope__empty">Loading prepare history…</p>
      ) : history.length === 0 ? (
        <EmptyState>
          No prepare_change runs recorded yet for this repo. Call it before a
          teammate edits, or start one after Iris has indexed.
        </EmptyState>
      ) : (
        <div className="prepare-md">
          <aside className="prepare-md__list">
            <label className="prepare-md__filter">
              <ListFilter size={15} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter tasks…"
              />
            </label>
            <ul className="prepare-md-rows">
              {filtered.map((row) => (
                <li key={row.generatedAt}>
                  <PrepareMdRunRow
                    run={row}
                    selected={row.generatedAt === viewId}
                    onOpen={() => setViewId(row.generatedAt)}
                  />
                </li>
              ))}
            </ul>
            <p className="prepare-md__list-foot">
              {filtered.length} of {history.length} indexed
            </p>
          </aside>
          <div className="prepare-md__detail">
            {viewing ? (
              <PrepareRunDetail key={viewing.generatedAt} run={viewing} />
            ) : (
              <EmptyState>Select a run.</EmptyState>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
