import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import {
  Button,
  Drawer,
  EmptyState,
  Table,
  TableNumber,
  TableTimestamp,
  Tooltip,
  formatPrismDate,
  type TableColumn,
} from "@repo-prism/ui";
import type { LastPrepareSummary } from "@repo-prism/dispatch";
import { ChevronLeft, FileText, Layers, Palette, Recycle } from "lucide-react";
import type { EnvelopeMetricCard } from "./envelope-cards.js";
import { Pager, pageSlice } from "./pager.js";
import { getJson } from "./session.js";

type PackFileRow = LastPrepareSummary["packFiles"][number];
type ReuseRow = LastPrepareSummary["reuse"][number];
type ConventionRow = LastPrepareSummary["conventions"][number];

const PACK_FILES_TIP =
  "The files prepare_change picked for this task, with why each one was included (ownership, feature match, or a name overlap) and what it cost against the pack's token budget.";

const REUSE_HITS_TIP =
  "Existing code that looks like it already does part of this task — a name or signature overlap prepare_change found before suggesting anything new be written.";

const HOUSE_STYLE_TIP =
  "The exemplar file for each convention this repo already follows (how a route handler, screen, or worker is normally structured) — so new code matches the pattern instead of inventing another one.";

const WORK_ORDER_TIP =
  "In-scope files, off-limits (generated or vendor), and paths that need sign-off. Blocked is not armed until an Accepted ADR turns on the write veto.";

type NumberTone = "good" | "warn" | "bad" | "neutral";

function toneColor(tone: NumberTone): string | undefined {
  switch (tone) {
    case "good":
      return "var(--prism-emerald)";
    case "warn":
      return "var(--prism-amber)";
    case "bad":
      return "var(--prism-rose)";
    default:
      return undefined;
  }
}

function ToneNumber(props: {
  readonly tone: NumberTone;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <TableNumber>
      <span style={{ color: toneColor(props.tone) }}>{props.children}</span>
    </TableNumber>
  );
}

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

/** More is better — reuse found, or a convention actually matched. */
function presenceTone(count: number): NumberTone {
  return count > 0 ? "good" : "neutral";
}

/** How a file or reuse hit was found — "measured/heuristic/…" straight from the pack. */
function provenanceLabel(provenance: string): string {
  switch (provenance) {
    case "measured":
      return "Measured from repo data";
    case "heuristic":
      return "Found by a heuristic rule";
    case "inferred":
      return "Inferred structurally";
    case "estimated":
      return "Estimated";
    default:
      return "Unavailable";
  }
}

/** `route-handler` -> "Route handler" — the raw slug isn't meant for display. */
function patternLabel(patternId: string): string {
  return patternId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const PACK_FILES_PAGE_SIZE = 25;
const REUSE_HITS_PAGE_SIZE = 15;
const HOUSE_STYLE_PAGE_SIZE = 5;

function PrepareRunDetail(props: {
  readonly run: LastPrepareSummary;
}): ReactElement {
  const run = props.run;
  const [packPage, setPackPage] = useState(0);
  const [reusePage, setReusePage] = useState(0);
  const [conventionPage, setConventionPage] = useState(0);
  const packColumns: readonly TableColumn<PackFileRow>[] = [
    {
      id: "path",
      header: "File",
      width: "220px",
      nowrap: true,
      render: (row) => <code>{row.path}</code>,
      tip: (row) => row.path,
    },
    {
      id: "symbols",
      header: "Symbols",
      width: "160px",
      nowrap: true,
      render: (row) => (row.symbols.length > 0 ? row.symbols.join(", ") : "—"),
      tip: (row) => row.symbols.join(", "),
    },
    {
      id: "why",
      header: "Why it's here",
      width: "200px",
      nowrap: true,
      render: (row) => (row.why.length > 0 ? row.why.join("; ") : "—"),
      tip: (row) => row.why.join("; "),
    },
    {
      id: "provenance",
      header: "Source",
      width: "150px",
      nowrap: true,
      render: (row) => provenanceLabel(row.provenance),
    },
    {
      id: "weight",
      header: "Weight",
      type: "number",
      width: "80px",
      render: (row) => (
        <ToneNumber tone={weightTone(row.tokenWeight)}>
          {row.tokenWeight}
        </ToneNumber>
      ),
      sortValue: (row) => row.tokenWeight,
    },
  ];

  const reuseColumns: readonly TableColumn<ReuseRow>[] = [
    {
      id: "symbol",
      header: "Symbol",
      width: "150px",
      nowrap: true,
      render: (row) => <code>{row.symbol}</code>,
    },
    {
      id: "path",
      header: "File",
      width: "200px",
      nowrap: true,
      render: (row) => row.path,
      tip: (row) => row.path,
    },
    {
      id: "kind",
      header: "Kind",
      width: "90px",
      nowrap: true,
      render: (row) => row.kind,
    },
    {
      id: "score",
      header: "Match",
      type: "number",
      width: "70px",
      render: (row) => (
        <ToneNumber tone={matchTone(row.score)}>
          {Math.round(row.score * 100)}%
        </ToneNumber>
      ),
      sortValue: (row) => row.score,
    },
    {
      id: "provenance",
      header: "Source",
      width: "150px",
      nowrap: true,
      render: (row) => provenanceLabel(row.provenance),
    },
    {
      id: "evidence",
      header: "Evidence",
      width: "220px",
      nowrap: true,
      render: (row) => row.evidence || "—",
      tip: (row) => row.evidence,
    },
  ];

  const conventionColumns: readonly TableColumn<ConventionRow>[] = [
    {
      id: "path",
      header: "Exemplar file",
      width: "260px",
      nowrap: true,
      render: (row) => <code>{row.path}</code>,
      tip: (row) => row.path,
    },
    {
      id: "pattern",
      header: "Pattern",
      width: "150px",
      nowrap: true,
      render: (row) => patternLabel(row.patternId),
    },
    {
      id: "why",
      header: "Why this one is canonical",
      width: "260px",
      nowrap: true,
      render: (row) => row.whyCanonical,
      tip: (row) => row.whyCanonical,
    },
  ];

  return (
    <div className="prepare-run">
      <dl className="console__facts">
        <div>
          <dt>Ran</dt>
          <dd>{formatPrismDate(run.generatedAt, "datetime")}</dd>
        </div>
        <div>
          <dt>Pack files</dt>
          <dd>
            {run.packFiles.length}
            {run.truncated ? ` of ${run.totalCount} (truncated)` : ""}
          </dd>
        </div>
        <div>
          <dt>Reuse hits</dt>
          <dd>{run.reuse.length}</dd>
        </div>
        <div>
          <dt>Conventions</dt>
          <dd>{run.conventions.length}</dd>
        </div>
      </dl>

      {run.ambiguous ? (
        <EmptyState>
          &quot;{run.ambiguous.query}&quot; matched more than one symbol:{" "}
          {run.ambiguous.candidates.map((c) => c.path).join(", ")}. House Style
          picked the canonical one; the rest are listed here for reference.
        </EmptyState>
      ) : null}

      <h3 className="intel-heading intel-heading--tip">
        Pack files
        <Tooltip label="Pack files">{PACK_FILES_TIP}</Tooltip>
      </h3>
      {run.packFiles.length > 0 ? (
        <>
          <Table
            className="prepare-run-table"
            rowKey={(row) => row.path}
            rows={pageSlice(run.packFiles, packPage, PACK_FILES_PAGE_SIZE)}
            columns={packColumns}
          />
          <Pager
            page={packPage}
            pageSize={PACK_FILES_PAGE_SIZE}
            total={run.packFiles.length}
            onPage={setPackPage}
          />
        </>
      ) : (
        <p className="envelope__empty">No files packed for this run.</p>
      )}

      <h3 className="intel-heading intel-heading--tip">
        Reuse hits
        <Tooltip label="Reuse hits">{REUSE_HITS_TIP}</Tooltip>
      </h3>
      {run.reuse.length > 0 ? (
        <>
          <Table
            className="prepare-run-table"
            rowKey={(row) => `${row.path}:${row.symbol}`}
            rows={pageSlice(run.reuse, reusePage, REUSE_HITS_PAGE_SIZE)}
            columns={reuseColumns}
          />
          <Pager
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

      <h3 className="intel-heading intel-heading--tip">
        House Style
        <Tooltip label="House Style">{HOUSE_STYLE_TIP}</Tooltip>
      </h3>
      {run.conventions.length > 0 ? (
        <>
          <Table
            className="prepare-run-table"
            rowKey={(row) => `${row.path}:${row.patternId}`}
            rows={pageSlice(
              run.conventions,
              conventionPage,
              HOUSE_STYLE_PAGE_SIZE,
            )}
            columns={conventionColumns}
          />
          <Pager
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

      <h3 className="intel-heading intel-heading--tip">
        Work order
        <Tooltip label="Work order">{WORK_ORDER_TIP}</Tooltip>
      </h3>
      {run.order ? (
        <dl className="console__facts">
          <div>
            <dt>Hook</dt>
            <dd>
              {run.order.hookArmed
                ? "Armed — blocked and needs-sign-off veto writes"
                : "Advisory (not armed) — blocked does not veto writes"}
            </dd>
          </div>
          <div>
            <dt>Off-limits</dt>
            <dd>
              {run.order.offLimits.length > 0
                ? run.order.offLimits
                    .map((row) => `${row.path} (${row.reason})`)
                    .join("; ")
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Needs sign-off</dt>
            <dd>
              {run.order.needsSignOff.length > 0
                ? run.order.needsSignOff.join("; ")
                : "—"}
            </dd>
          </div>
          <div>
            <dt>In scope</dt>
            <dd>
              {run.order.inScope.length > 0
                ? run.order.inScope.join("; ")
                : "—"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="envelope__empty">No work order on this run.</p>
      )}
    </div>
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
      label: "Runs",
      tip: "Every prepare_change call recorded for this repo.",
      value: String(history.length),
      icon: Layers,
      tone: "brand",
    },
    {
      id: "pack",
      label: "Pack files",
      tip: "Total files packed across every run.",
      value: String(packFiles),
      icon: FileText,
      tone: "amber",
    },
    {
      id: "reuse",
      label: "Reuse hits",
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

/**
 * Prepare history, in a drawer (M-074 Console polish). Opened straight into
 * a run's detail (`initialRun`) from the Iris overview's 3-run preview, or
 * into the full list from "View all runs" — either way the detail view is
 * inline in the same drawer, matching {@link SkillHistoryDrawer}'s list ⇄
 * detail pattern rather than stacking a second drawer.
 */
export function PrepareHistoryDrawer(props: {
  readonly token: string;
  readonly workspace: string;
  readonly workspaceLabel?: string;
  readonly initialRun?: string;
  readonly onClose: () => void;
}): ReactElement {
  const [history, setHistory] = useState<
    readonly LastPrepareSummary[] | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  const [viewId, setViewId] = useState<string | undefined>(props.initialRun);

  useEffect(() => {
    let alive = true;
    setHistory(undefined);
    setError(undefined);
    void getJson<{ runs: LastPrepareSummary[] }>(
      `/api/prepare-history?workspace=${encodeURIComponent(props.workspace)}`,
      props.token,
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
  }, [props.workspace, props.token]);

  const viewing = viewId
    ? history?.find((row) => row.generatedAt === viewId)
    : undefined;

  const runColumns: readonly TableColumn<LastPrepareSummary>[] = [
    {
      id: "when",
      header: "When",
      type: "timestamp",
      width: "110px",
      render: (row) => <TableTimestamp iso={row.generatedAt} />,
      sortValue: (row) => Date.parse(row.generatedAt),
    },
    {
      id: "task",
      header: "Task",
      width: "260px",
      nowrap: true,
      render: (row) => row.task,
      tip: (row) => row.task,
    },
    {
      id: "pack",
      header: "Pack files",
      type: "number",
      width: "90px",
      render: (row) => (
        <ToneNumber tone={row.truncated ? "warn" : "neutral"}>
          {row.packFiles.length}
          {row.truncated ? ` of ${row.totalCount}` : ""}
        </ToneNumber>
      ),
      sortValue: (row) => row.packFiles.length,
    },
    {
      id: "reuse",
      header: "Reuse",
      type: "number",
      width: "80px",
      render: (row) => (
        <ToneNumber tone={presenceTone(row.reuse.length)}>
          {row.reuse.length}
        </ToneNumber>
      ),
      sortValue: (row) => row.reuse.length,
    },
    {
      id: "conventions",
      header: "Conventions",
      type: "number",
      width: "100px",
      render: (row) => (
        <ToneNumber tone={presenceTone(row.conventions.length)}>
          {row.conventions.length}
        </ToneNumber>
      ),
      sortValue: (row) => row.conventions.length,
    },
  ];

  return (
    <Drawer
      title={
        viewing
          ? "Prepare run"
          : `Prepare history${props.workspaceLabel ? ` · ${props.workspaceLabel}` : ""}`
      }
      size="lg"
      className={viewing ? "prepare-run-drawer" : "prepare-history-drawer"}
      onClose={props.onClose}
    >
      {viewing ? (
        <>
          <Button
            type="button"
            variant="ghost"
            icon={<ChevronLeft size={16} aria-hidden />}
            onClick={() => setViewId(undefined)}
          >
            All runs
          </Button>
          <p className="console__lede">{viewing.task}</p>
          <PrepareRunDetail key={viewing.generatedAt} run={viewing} />
        </>
      ) : error ? (
        <EmptyState>{error}</EmptyState>
      ) : history === undefined ? (
        <p className="envelope__empty">Loading prepare history…</p>
      ) : history.length === 0 ? (
        <EmptyState>
          No prepare_change runs recorded yet for this repo. Call it before a
          teammate edits, or start one after Iris has indexed.
        </EmptyState>
      ) : (
        <Table
          className="prepare-runs-table"
          rowKey={(row) => row.generatedAt}
          rows={history}
          onRowClick={(row) => setViewId(row.generatedAt)}
          columns={runColumns}
        />
      )}
    </Drawer>
  );
}
