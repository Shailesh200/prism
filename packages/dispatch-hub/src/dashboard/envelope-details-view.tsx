import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Badge,
  Button,
  DateRangePicker,
  EmptyState,
  HoverTip,
  Table,
  TableNumber,
  TableTimestamp,
  ToggleGroup,
  Tooltip,
  type DateRangeValue,
  type TableColumn,
} from "@repo-prism/ui";
import {
  ENVELOPE_AGENTIC_TIP,
  ENVELOPE_OVER_TIME_TIP,
  ENVELOPE_PEAK_DUMP_TIP,
  ENVELOPE_SESSION_TIP,
  ENVELOPE_SESSIONS_TIP,
  IRIS_FOLLOW_THROUGH_TIP,
  IRIS_HABIT_TIP,
  IRIS_SOURCE_TIP,
  envelopeToolTip,
  envelopeToolTone,
  hostClientLabel,
  type JobSummary,
  type JobWorkspaceChip,
} from "@repo-prism/app-shell";
import type {
  EnvelopeBucket,
  EnvelopeGrain,
  EnvelopeHostShare,
  EnvelopeMetrics,
  EnvelopeRecentCall,
  EnvelopeSessionCall,
  EnvelopeSessionRow,
} from "@repo-prism/dispatch";
import {
  AppWindow,
  CalendarCheck,
  ChevronLeft,
  Clock,
  Code2,
  Filter,
  GitFork,
  HelpCircle,
  SquareTerminal,
  Users,
  Zap,
} from "lucide-react";
import {
  FLEET_RANGE_PRESETS,
  irisDefaultWorkspace,
  selectedRangeWindow,
  type FleetRange,
} from "./fleet.js";
import { Pager, pageSlice } from "./pager.js";
import { RepoSelect } from "./repo-select.js";
import { getJson } from "./session.js";
import {
  ENVELOPE_DASH,
  EnvelopeCards,
  formatEnvelopeBytes,
  formatEnvelopePercent,
  type EnvelopeMetricCard,
} from "./envelope-cards.js";

const IRIS_WORKSPACE_KEY = "prism.console.iris.workspace";
const JOURNAL_PAGE_SIZE = 20;
const SESSION_PAGE_SIZE = 10;

type EnvelopeViewMode = "over-time" | "agentic" | "session";
type SessionKind = "all" | "inline" | "job";

type EnvelopeResponse = EnvelopeMetrics & {
  readonly workspace?: string;
};

type HostSourceId = "mcp" | "env" | "worker";

type HostShareView = EnvelopeHostShare & {
  readonly firstTs?: string;
  readonly lastTs?: string;
  readonly clientNames?: readonly string[];
  readonly clientVersions?: readonly string[];
  readonly hostSources?: readonly HostSourceId[];
  readonly topTools?: readonly {
    readonly tool: string;
    readonly calls: number;
  }[];
};

type RecentView = EnvelopeRecentCall & {
  readonly clientName?: string;
  readonly clientVersion?: string;
  readonly hostSource?: HostSourceId;
};

const GRAINS: readonly { id: EnvelopeGrain; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "overall", label: "Overall" },
];

function defaultEnvelopeRange(nowMs: number): DateRangeValue {
  const window = selectedRangeWindow("7d", nowMs);
  return { preset: "7d", startMs: window.startMs, endMs: window.endMs };
}

function envelopeRangeQuery(range: DateRangeValue): {
  from: string;
  to: string;
} {
  const fromMs =
    Number.isFinite(range.startMs) && range.startMs > 0 ? range.startMs : 0;
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(range.endMs).toISOString(),
  };
}

function agenticHosts(rows: readonly EnvelopeHostShare[]): EnvelopeHostShare[] {
  return rows.filter((row) => row.listCalls > 0);
}

function hostTitle(
  host: string | undefined,
  unlabeled: string = "Unknown",
): string {
  if (!host || host === "unknown") return unlabeled;
  return hostClientLabel(host);
}

function hostWhenText(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function hostSourceLabel(source: HostSourceId): string {
  if (source === "mcp") return "Prism handshake";
  if (source === "env") return "the editor";
  return "the teammate";
}

function callsForHost(
  host: string,
  recent: readonly RecentView[],
): RecentView[] {
  return recent.filter((call) => (call.host ?? "unknown") === host);
}

function uniqueNames(values: readonly (string | undefined)[]): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].sort((a, b) => a.localeCompare(b));
}

function hostMetaLines(
  row: HostShareView,
  recent: readonly RecentView[] = [],
): string[] {
  const lines: string[] = [];
  const mine = callsForHost(row.host, recent);
  const names =
    row.clientNames && row.clientNames.length > 0
      ? [...row.clientNames]
      : uniqueNames(mine.map((call) => call.clientName));
  const versions =
    row.clientVersions && row.clientVersions.length > 0
      ? [...row.clientVersions]
      : uniqueNames(mine.map((call) => call.clientVersion));
  const sources =
    row.hostSources ??
    uniqueNames(mine.map((call) => call.hostSource)).filter(
      (source): source is HostSourceId =>
        source === "mcp" || source === "env" || source === "worker",
    );
  const firstTs = row.firstTs || mine[mine.length - 1]?.ts || "";
  const lastTs = row.lastTs || mine[0]?.ts || "";
  const tools =
    row.topTools && row.topTools.length > 0
      ? row.topTools
      : Object.entries(
          mine.reduce<Record<string, number>>((acc, call) => {
            acc[call.tool] = (acc[call.tool] ?? 0) + 1;
            return acc;
          }, {}),
        )
          .map(([tool, calls]) => ({ tool, calls }))
          .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool))
          .slice(0, 3);
  if (names.length > 0) {
    const version = versions.length > 0 ? ` ${versions.join(", ")}` : "";
    lines.push(`${names.join(", ")}${version}`);
  } else if (row.host === "unknown") {
    lines.push("Editor name was not recorded");
  }
  if (sources.length > 0) {
    lines.push(`Named from ${sources.map(hostSourceLabel).join(" · ")}`);
  }
  if (firstTs && lastTs) {
    const from = hostWhenText(firstTs);
    const to = hostWhenText(lastTs);
    if (from && to) {
      lines.push(from === to ? from : `${from} → ${to}`);
    }
  }
  if (tools.length > 0) {
    lines.push(tools.map((item) => item.tool).join(", "));
  }
  return lines;
}

function hostHoverDetail(
  row: HostShareView,
  recent: readonly RecentView[] = [],
): string {
  return hostMetaLines(row, recent).join("\n");
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function addLocalDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function localMonday(ms: number): number {
  const start = new Date(startOfLocalDay(ms));
  const day = start.getDay();
  const offset = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - offset);
  return start.getTime();
}

function spanFromBucketKey(
  key: string,
): { fromMs: number; toMs: number } | undefined {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (day) {
    const fromMs = new Date(
      Number(day[1]),
      Number(day[2]) - 1,
      Number(day[3]),
    ).getTime();
    return { fromMs, toMs: addLocalDays(fromMs, 1) };
  }
  const week = /^(\d{4})-W(\d{2})$/.exec(key);
  if (week) {
    const year = Number(week[1]);
    const weekNo = Number(week[2]);
    const week1 = localMonday(new Date(year, 0, 4).getTime());
    const fromMs = addLocalDays(week1, (weekNo - 1) * 7);
    return { fromMs, toMs: addLocalDays(fromMs, 7) };
  }
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (month) {
    const year = Number(month[1]);
    const monthIndex = Number(month[2]) - 1;
    return {
      fromMs: new Date(year, monthIndex, 1).getTime(),
      toMs: new Date(year, monthIndex + 1, 1).getTime(),
    };
  }
  return undefined;
}

function formatLocalRange(fromMs: number, toMsExclusive: number): string {
  const from = new Date(fromMs);
  const last = new Date(toMsExclusive - 1);
  const sameDay =
    from.getFullYear() === last.getFullYear() &&
    from.getMonth() === last.getMonth() &&
    from.getDate() === last.getDate();
  if (sameDay) {
    return `${from.getDate()} ${MONTHS[from.getMonth()]} ${from.getFullYear()}`;
  }
  if (from.getFullYear() === last.getFullYear()) {
    if (from.getMonth() === last.getMonth()) {
      return `${from.getDate()}–${last.getDate()} ${MONTHS[last.getMonth()]} ${last.getFullYear()}`;
    }
    return `${from.getDate()} ${MONTHS[from.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]} ${last.getFullYear()}`;
  }
  return `${from.getDate()} ${MONTHS[from.getMonth()]} ${from.getFullYear()} – ${last.getDate()} ${MONTHS[last.getMonth()]} ${last.getFullYear()}`;
}

function bucketRangeText(bucket: EnvelopeBucket): string {
  const span =
    bucket.fromMs != null && bucket.toMs != null && bucket.toMs > bucket.fromMs
      ? { fromMs: bucket.fromMs, toMs: bucket.toMs }
      : spanFromBucketKey(bucket.key);
  if (!span) return "";
  return formatLocalRange(span.fromMs, span.toMs);
}

function EnvelopeNum(props: { readonly children: ReactNode }): ReactElement {
  return <TableNumber>{props.children}</TableNumber>;
}

function HostGlyph(props: {
  readonly host: string;
  readonly size?: number;
}): ReactElement {
  const size = props.size ?? 16;
  if (props.host === "claude") return <Code2 size={size} aria-hidden />;
  if (props.host === "vscode") return <AppWindow size={size} aria-hidden />;
  if (props.host === "unknown") return <HelpCircle size={size} aria-hidden />;
  return <SquareTerminal size={size} aria-hidden />;
}

function jobLabel(id: string, jobs: readonly JobSummary[]): string {
  const hit = jobs.find((job) => job.id === id);
  if (hit?.title.trim()) return hit.title.trim();
  if (/^job-[0-9a-f]{6,}$/i.test(id)) return "Teammate";
  return id;
}

function yTicks(max: number): number[] {
  if (max <= 0) return [3, 2, 1, 0];
  const step = max <= 4 ? 1 : max <= 12 ? 4 : Math.ceil(max / 3);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let value = top; value >= 0; value -= step) ticks.push(value);
  return ticks;
}

function bucketDetail(bucket: EnvelopeBucket): string {
  const range = bucketRangeText(bucket);
  if (
    bucket.listCalls === 0 &&
    bucket.chatCalls === 0 &&
    bucket.jobCalls === 0
  ) {
    return range ? `${range}\nNo list calls` : "No list calls";
  }
  const lines = [
    ...(range ? [range] : []),
    `List calls: ${bucket.listCalls}`,
    `Partial: ${bucket.truncatedCalls}`,
  ];
  if (bucket.bytesKeptRatio !== null) {
    lines.push(
      `Sent: ${formatEnvelopePercent(bucket.bytesKeptRatio)} of the full list`,
    );
  }
  if (bucket.dumpNotServedBytes > 0) {
    lines.push(`Not sent: ${formatEnvelopeBytes(bucket.dumpNotServedBytes)}`);
  }
  return lines.join("\n");
}

function bucketAria(bucket: EnvelopeBucket): string {
  return bucketDetail(bucket).replaceAll("\n", " · ");
}

function EnvelopeHelp(props: { readonly children: ReactNode }): ReactElement {
  return <p className="envelope-help">{props.children}</p>;
}

function kindLabel(kind: "inline" | "job"): string {
  return kind === "job" ? "Job" : "Chat";
}

function ToolName(props: { readonly name: string }): ReactElement {
  return (
    <HoverTip label={props.name} detail={envelopeToolTip(props.name)}>
      <Badge tone={envelopeToolTone(props.name)} className="envelope-tool-tag">
        {props.name}
      </Badge>
    </HoverTip>
  );
}

function EnvelopeBarChart(props: {
  readonly title: string;
  readonly buckets: readonly EnvelopeBucket[];
  readonly grouped?: boolean;
}): ReactElement {
  const ticks = yTicks(
    Math.max(0, ...props.buckets.map((row) => row.listCalls)),
  );
  const top = ticks[0] ?? 1;
  return (
    <div
      className="envelope-chart"
      data-grouped={props.grouped ? "true" : "false"}
    >
      <div className="envelope-chart__head">
        <h2 className="envelope-chart__title">{props.title}</h2>
      </div>
      <div className="envelope-chart__plot">
        <div className="envelope-chart__y" aria-hidden>
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <ol className="envelope-chart__cols">
          {props.buckets.map((bucket) => {
            const empty = bucket.listCalls === 0;
            const listH = empty ? 0 : (bucket.listCalls / top) * 100;
            const cutH = empty ? 0 : (bucket.truncatedCalls / top) * 100;
            return (
              <li key={bucket.key}>
                <HoverTip
                  label={bucket.label}
                  detail={bucketDetail(bucket)}
                  unclamp
                  popClassName="envelope-chart-tip"
                >
                  <button
                    type="button"
                    className="envelope-chart__col"
                    aria-label={`${bucket.label}: ${bucketAria(bucket)}`}
                  >
                    <span className="envelope-chart__track">
                      {empty ? (
                        <span className="envelope-chart__tick" />
                      ) : props.grouped ? (
                        <>
                          <span
                            className="envelope-chart__bar envelope-chart__bar--list"
                            style={{ height: `${listH}%` }}
                          />
                          <span
                            className="envelope-chart__bar envelope-chart__bar--cut"
                            style={{ height: `${cutH}%` }}
                          />
                        </>
                      ) : (
                        <>
                          <span
                            className="envelope-chart__stack envelope-chart__stack--list"
                            style={{ height: `${listH}%` }}
                          />
                          <span
                            className="envelope-chart__stack envelope-chart__stack--cut"
                            style={{ height: `${cutH}%` }}
                          />
                        </>
                      )}
                    </span>
                    <span className="envelope-chart__xlabel">
                      {bucket.label}
                    </span>
                  </button>
                </HoverTip>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="envelope-chart__legend">
        <HoverTip
          label="List calls"
          detail="How many list tools Prism ran in this bar."
        >
          <span>
            <i className="envelope-chart__swatch envelope-chart__swatch--list" />
            List calls
          </span>
        </HoverTip>
        <HoverTip
          label="Partial"
          detail="List calls where Prism sent some matches, not every one."
        >
          <span>
            <i className="envelope-chart__swatch envelope-chart__swatch--cut" />
            Partial
          </span>
        </HoverTip>
        <HoverTip
          label="No calls"
          detail="A bar with no list calls. A tick so empty is not 0%."
        >
          <span>Tick = no calls</span>
        </HoverTip>
      </p>
    </div>
  );
}

function overTimeCards(metrics: EnvelopeMetrics): EnvelopeMetricCard[] {
  return [
    {
      id: "peak",
      label: "Most not sent",
      tip: ENVELOPE_PEAK_DUMP_TIP,
      value: metrics.peakDump
        ? formatEnvelopeBytes(
            Math.max(
              0,
              metrics.peakDump.dumpBytes - metrics.peakDump.jsonBytes,
            ),
          )
        : ENVELOPE_DASH,
      sub: metrics.peakDump
        ? `${metrics.peakDump.tool} · ${metrics.peakDump.itemCount} of ${metrics.peakDump.totalCount}`
        : "all sent",
      icon: Zap,
      tone: "brand",
    },
    {
      id: "sessions",
      label: "Bursts",
      tip: ENVELOPE_SESSIONS_TIP,
      value:
        metrics.sessionCount === null
          ? ENVELOPE_DASH
          : String(metrics.sessionCount),
      unit: "bursts",
      sub:
        metrics.inlineSessions !== null && metrics.jobSessions !== null
          ? `${metrics.inlineSessions} chat · ${metrics.jobSessions} job`
          : undefined,
      icon: Clock,
      tone: "brand",
    },
  ];
}

function sessionCards(metrics: EnvelopeMetrics): EnvelopeMetricCard[] {
  return [
    {
      id: "sessions",
      label: "Bursts",
      tip: ENVELOPE_SESSIONS_TIP,
      value:
        metrics.sessionCount === null
          ? ENVELOPE_DASH
          : String(metrics.sessionCount),
      unit: "bursts",
      icon: Clock,
      tone: "brand",
    },
    {
      id: "inline",
      label: "Chats",
      tip: IRIS_SOURCE_TIP,
      value:
        metrics.inlineSessions === null
          ? ENVELOPE_DASH
          : String(metrics.inlineSessions),
      sub:
        metrics.chatCalls !== null
          ? `${metrics.chatCalls} calls total`
          : undefined,
      icon: GitFork,
      tone: "brand",
    },
    {
      id: "jobs",
      label: "Teammate jobs",
      tip: IRIS_SOURCE_TIP,
      value:
        metrics.jobSessions === null
          ? ENVELOPE_DASH
          : String(metrics.jobSessions),
      sub:
        metrics.jobCalls !== null
          ? `${metrics.jobCalls} calls total`
          : "jobs with Prism calls",
      icon: Users,
      tone: "violet",
    },
    {
      id: "median",
      label: "Median list calls",
      tip: IRIS_HABIT_TIP,
      value:
        metrics.medianListCalls === null
          ? ENVELOPE_DASH
          : String(metrics.medianListCalls),
      sub: "per burst",
      icon: CalendarCheck,
      tone: "amber",
    },
    {
      id: "follow",
      label: "Then focused",
      tip: IRIS_FOLLOW_THROUGH_TIP,
      value: formatEnvelopePercent(metrics.followThrough, 0),
      valueTone: "brand",
      sub: "after a partial",
      icon: Filter,
      tone: "brand",
    },
  ];
}

function recentColumns(jobs: readonly JobSummary[]): TableColumn<RecentView>[] {
  return [
    {
      id: "ts",
      header: "When",
      type: "timestamp",
      render: (row) => <TableTimestamp iso={row.ts} seconds />,
    },
    {
      id: "tool",
      header: "Tool",
      type: "tag",
      width: "10rem",
      render: (row) => <ToolName name={row.tool} />,
    },
    {
      id: "slice",
      header: "Sent / all",
      type: "number",
      width: "6.5rem",
      tip: (row) =>
        `${row.itemCount} of ${row.totalCount} matches reached the agent.`,
      render: (row) => (
        <EnvelopeNum>
          {row.itemCount} of {row.totalCount}
        </EnvelopeNum>
      ),
    },
    {
      id: "cut",
      header: "Partial",
      type: "tag",
      render: (row) =>
        row.truncated ? (
          <Badge tone="rose" className="envelope-cut-tag">
            partial
          </Badge>
        ) : (
          ENVELOPE_DASH
        ),
    },
    {
      id: "kept",
      header: "Sent",
      type: "number",
      render: (row) => (
        <EnvelopeNum>{formatEnvelopeBytes(row.jsonBytes)}</EnvelopeNum>
      ),
    },
    {
      id: "host",
      header: "Host",
      type: "text",
      nowrap: true,
      width: "5.5rem",
      render: (row) => {
        const title = hostTitle(row.host);
        const detail = [
          row.clientName
            ? `${row.clientName}${row.clientVersion ? ` ${row.clientVersion}` : ""}`
            : row.host && row.host !== "unknown"
              ? hostClientLabel(row.host)
              : "Editor name was not recorded",
          row.hostSource === "env"
            ? "Named from the editor"
            : row.hostSource === "worker"
              ? "Named from the teammate"
              : row.hostSource === "mcp"
                ? "Named from the Prism handshake"
                : undefined,
        ]
          .filter(Boolean)
          .join("\n");
        return (
          <HoverTip label={title} detail={detail}>
            {title}
          </HoverTip>
        );
      },
    },
    {
      id: "source",
      header: "Source",
      type: "text",
      tip: (row) => (row.jobId ? jobLabel(row.jobId, jobs) : "This session"),
      render: (row) => (
        <span className="envelope-title">
          {row.jobId ? jobLabel(row.jobId, jobs) : "This session"}
        </span>
      ),
    },
  ];
}

function sessionWho(
  row: EnvelopeSessionRow,
  jobs: readonly JobSummary[],
): string {
  return row.kind === "job" && row.jobId
    ? jobLabel(row.jobId, jobs)
    : "This session";
}

function sessionColumns(
  jobs: readonly JobSummary[],
): TableColumn<EnvelopeSessionRow>[] {
  return [
    {
      id: "started",
      header: "Started",
      type: "timestamp",
      render: (row) => <TableTimestamp iso={row.startedAt} seconds />,
    },
    {
      id: "kind",
      header: "Kind",
      type: "tag",
      width: "5.25rem",
      render: (row) => (
        <Badge
          tone={row.kind === "job" ? "violet" : "brand"}
          className="envelope-kind-tag"
        >
          {kindLabel(row.kind)}
        </Badge>
      ),
    },
    {
      id: "who",
      header: "Title",
      type: "text",
      tip: (row) => sessionWho(row, jobs),
      render: (row) => (
        <span className="envelope-title">{sessionWho(row, jobs)}</span>
      ),
    },
    {
      id: "host",
      header: "Host",
      type: "text",
      nowrap: true,
      width: "5.75rem",
      tip: (row) => hostTitle(row.host),
      render: (row) => (
        <span className="envelope-cell-text">{hostTitle(row.host)}</span>
      ),
    },
    {
      id: "kept",
      header: "Sent %",
      type: "number",
      width: "4.85rem",
      tip: (row) =>
        row.bytesKeptRatio == null
          ? "No list in this burst."
          : `${formatEnvelopePercent(row.bytesKeptRatio)} of the full list reached the agent.`,
      render: (row) => (
        <EnvelopeNum>{formatEnvelopePercent(row.bytesKeptRatio)}</EnvelopeNum>
      ),
    },
    {
      id: "follow",
      header: "Then focused",
      type: "number",
      width: "8rem",
      tip: (row) =>
        row.followThrough == null
          ? "No partial list in this burst."
          : "After a partial list, the next call asked a tighter question.",
      render: (row) => (
        <EnvelopeNum>{formatEnvelopePercent(row.followThrough, 0)}</EnvelopeNum>
      ),
    },
  ];
}

function inspectorColumns(): TableColumn<EnvelopeSessionCall>[] {
  return [
    {
      id: "when",
      header: "When",
      type: "timestamp",
      render: (row) => <TableTimestamp iso={row.ts} seconds />,
    },
    {
      id: "tool",
      header: "Tool",
      type: "tag",
      render: (row) => <ToolName name={row.tool} />,
    },
    {
      id: "slice",
      header: "Sent / all",
      type: "number",
      width: "6.5rem",
      tip: (row) =>
        `${row.itemCount} of ${row.totalCount} matches reached the agent.`,
      render: (row) => (
        <EnvelopeNum>
          {row.itemCount} of {row.totalCount}
        </EnvelopeNum>
      ),
    },
    {
      id: "cut",
      header: "Partial",
      type: "tag",
      width: "4.75rem",
      render: (row) =>
        row.truncated ? (
          <Badge tone="rose" className="envelope-cut-tag">
            partial
          </Badge>
        ) : (
          ENVELOPE_DASH
        ),
    },
  ];
}

function SessionInspector(props: {
  readonly session: EnvelopeSessionRow;
  readonly jobs: readonly JobSummary[];
  readonly onOpenJob?: (job: JobSummary) => void;
}): ReactElement {
  const { session } = props;
  const job =
    session.kind === "job" && session.jobId
      ? props.jobs.find((row) => row.id === session.jobId)
      : undefined;
  const who =
    session.kind === "job" && session.jobId
      ? jobLabel(session.jobId, props.jobs)
      : "This session";
  return (
    <aside className="envelope-inspector">
      <div className="envelope-inspector__head">
        <h2 className="envelope-chart__title">This burst</h2>
        {job && props.onOpenJob ? (
          <Button
            size="sm"
            variant="ghost"
            className="envelope-inspector__view"
            onClick={() => props.onOpenJob?.(job)}
          >
            View details
          </Button>
        ) : null}
      </div>
      <p className="envelope-inspector__who">
        {who} · {hostTitle(session.host)}
        {session.host === "unknown" ? " · Editor name was not recorded" : ""}
      </p>
      <p className="envelope-inspector__facts">
        {session.listCalls} list calls · {session.truncatedCalls} partial ·{" "}
        {formatEnvelopeBytes(session.dumpNotServedBytes)} not sent
      </p>
      <Table
        className="envelope-table envelope-table--inspector envelope-inspector__table"
        rowKey={(row) => `${row.ts}:${row.tool}`}
        empty="No calls in this burst."
        rows={session.calls}
        columns={inspectorColumns()}
      />
      <EnvelopeHelp>
        Calls in this burst. Partial means Prism sent some matches, not every
        one.
      </EnvelopeHelp>
    </aside>
  );
}

export function EnvelopeDetailsView(props: {
  readonly token: string;
  readonly jobs: readonly JobSummary[];
  readonly workspaces: readonly JobWorkspaceChip[];
  readonly selectedPath?: string;
  readonly onBack: () => void;
  readonly onOpenJob?: (job: JobSummary) => void;
}): ReactElement {
  const userPicked = useRef(false);
  const [workspace, setWorkspace] = useState("");
  const [mode, setMode] = useState<EnvelopeViewMode>("over-time");
  const [grain, setGrain] = useState<EnvelopeGrain>("daily");
  const [range, setRange] = useState<DateRangeValue>(() =>
    defaultEnvelopeRange(Date.now()),
  );
  const [hostFilter, setHostFilter] = useState("all");
  const [sessionKind, setSessionKind] = useState<SessionKind>("all");
  const [selectedSession, setSelectedSession] = useState<string | undefined>();
  const [journalPage, setJournalPage] = useState(0);
  const [sessionPage, setSessionPage] = useState(0);
  const [envelope, setEnvelope] = useState<EnvelopeResponse | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    if (userPicked.current) return;
    const stored =
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(IRIS_WORKSPACE_KEY);
    const next = irisDefaultWorkspace(
      props.workspaces,
      props.selectedPath,
      stored,
      props.jobs,
    );
    if (next) setWorkspace(next);
  }, [props.workspaces, props.selectedPath, props.jobs]);

  useEffect(() => {
    if (!workspace) {
      setEnvelope(undefined);
      return;
    }
    let alive = true;
    const bounds = envelopeRangeQuery(range);
    const params = new URLSearchParams({
      workspace,
      grain,
      from: bounds.from,
      to: bounds.to,
    });
    void getJson<EnvelopeResponse>(
      `/api/envelope?${params.toString()}`,
      props.token,
    )
      .then((next) => {
        if (!alive) return;
        setEnvelope(next);
        setError(undefined);
        setJournalPage(0);
        setSessionPage(0);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setEnvelope(undefined);
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      alive = false;
    };
  }, [workspace, props.token, grain, range.startMs, range.endMs, range.preset]);

  const hosts = useMemo(() => agenticHosts(envelope?.hosts ?? []), [envelope]);

  useEffect(() => {
    if (hostFilter === "all") return;
    if (!hosts.some((row) => row.host === hostFilter)) setHostFilter("all");
  }, [hosts, hostFilter]);

  const filteredHosts =
    hostFilter === "all"
      ? hosts
      : hosts.filter((row) => row.host === hostFilter);
  const sessions = (envelope?.sessions ?? []).filter((row) =>
    sessionKind === "all" ? true : row.kind === sessionKind,
  );
  const pagedSessions = pageSlice(sessions, sessionPage, SESSION_PAGE_SIZE);
  const activeSession =
    pagedSessions.find((row) => row.id === selectedSession) ?? pagedSessions[0];
  const journalRecent = (envelope?.recent ?? []) as RecentView[];
  const journalRows = pageSlice(journalRecent, journalPage, JOURNAL_PAGE_SIZE);

  const chartBuckets: EnvelopeBucket[] =
    mode === "agentic"
      ? filteredHosts.map((row) => ({
          key: row.host,
          label: hostTitle(row.host),
          listCalls: row.listCalls,
          truncatedCalls: row.truncatedCalls,
          chatCalls: row.chatCalls,
          jobCalls: row.jobCalls,
          bytesKeptRatio: row.bytesKeptRatio,
          dumpNotServedBytes: row.dumpNotServedBytes,
        }))
      : (envelope?.buckets ?? []);

  const repoJobs = props.jobs.filter(
    (job) => !workspace || job.workspacePath === workspace,
  );
  const hostTotal = filteredHosts.reduce((sum, row) => sum + row.listCalls, 0);

  return (
    <section className="console__panel envelope-details">
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
            <h1 className="console__title">Envelope</h1>
            <p className="console__lede">On this machine. Not job tokens.</p>
          </div>
        </div>
        <RepoSelect
          token={props.token}
          label="Repos"
          className="fleet-toolbar__repo-select"
          value={workspace}
          onChange={(path) => {
            userPicked.current = true;
            setWorkspace(path);
            localStorage.setItem(IRIS_WORKSPACE_KEY, path);
          }}
          repos={props.workspaces}
        />
      </div>

      <div className="envelope-toolbar envelope-toolbar--views">
        <ToggleGroup
          aria-label="Envelope view"
          className="envelope-seg envelope-seg--view"
          value={mode}
          onChange={(id) => setMode(id as EnvelopeViewMode)}
          options={[
            { id: "over-time", label: "Over time" },
            { id: "agentic", label: "Agentic" },
            { id: "session", label: "Burst" },
          ]}
        />
        <Tooltip
          label={
            mode === "over-time"
              ? "Over time"
              : mode === "agentic"
                ? "Agentic"
                : "Burst"
          }
          wide
        >
          {mode === "over-time"
            ? ENVELOPE_OVER_TIME_TIP
            : mode === "agentic"
              ? ENVELOPE_AGENTIC_TIP
              : ENVELOPE_SESSION_TIP}
        </Tooltip>
        <div className="envelope-toolbar__end">
          {mode === "over-time" ? (
            <ToggleGroup
              aria-label="Envelope grain"
              className="envelope-seg envelope-seg--grain"
              value={grain}
              onChange={(id) => setGrain(id as EnvelopeGrain)}
              options={GRAINS}
            />
          ) : null}
          <DateRangePicker
            aria-label="Time range"
            className="fleet-toolbar__range-select envelope-toolbar__range-float"
            presets={FLEET_RANGE_PRESETS}
            value={range}
            nowMs={nowMs}
            presetWindow={(id, at) =>
              selectedRangeWindow(
                (FLEET_RANGE_PRESETS.some((row) => row.id === id)
                  ? id
                  : "7d") as FleetRange,
                at,
              )
            }
            onChange={setRange}
          />
        </div>
      </div>

      {mode === "agentic" && hosts.length > 0 ? (
        <div className="envelope-toolbar envelope-toolbar--filters">
          <div className="envelope-chips" role="radiogroup" aria-label="Host">
            <span className="envelope-chips__label">Host</span>
            {[
              {
                host: "all",
                label: "All hosts",
                count: hosts.reduce((sum, row) => sum + row.listCalls, 0),
              },
              ...hosts.map((row) => ({
                host: row.host,
                label: hostTitle(row.host),
                count: row.listCalls,
              })),
            ].map((chip) => (
              <button
                key={chip.host}
                type="button"
                role="radio"
                className="envelope-chip"
                aria-checked={hostFilter === chip.host}
                data-active={hostFilter === chip.host ? "true" : "false"}
                onClick={() => setHostFilter(chip.host)}
              >
                {chip.host === "all" ? (
                  <i className="envelope-chip__dot" aria-hidden />
                ) : null}
                {chip.label}
                {chip.host === "all" ? null : (
                  <span className="envelope-chip__n">{chip.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {mode === "session" ? (
        <div className="envelope-toolbar envelope-toolbar--filters">
          <div
            className="envelope-chips"
            role="radiogroup"
            aria-label="Burst kind"
          >
            <span className="envelope-chips__label">Filter</span>
            {(
              [
                ["all", "All"],
                ["inline", "Chats"],
                ["job", "Teammate jobs"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                className="envelope-chip"
                aria-checked={sessionKind === id}
                data-active={sessionKind === id ? "true" : "false"}
                onClick={() => {
                  setSessionKind(id);
                  setSessionPage(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <EmptyState>{error}</EmptyState> : null}
      {envelope === undefined && !error ? (
        <p className="envelope__empty">Loading Envelope…</p>
      ) : null}
      {envelope && !envelope.available ? (
        <EmptyState>
          No list calls in this window. Envelope fills when this session or a
          teammate uses list tools — not from the job&apos;s billed tokens.
        </EmptyState>
      ) : null}

      {envelope?.available && mode === "over-time" ? (
        <>
          <EnvelopeCards density="detail" cards={overTimeCards(envelope)} />
          <EnvelopeBarChart
            title={
              grain === "weekly"
                ? "Weekly list calls"
                : grain === "monthly"
                  ? "Monthly list calls"
                  : grain === "overall"
                    ? "List calls"
                    : "Daily list calls"
            }
            buckets={chartBuckets}
          />
          <div className="envelope-split">
            <div className="envelope-journal">
              <h2 className="envelope-chart__title">Envelope journal</h2>
              <Table
                className="envelope-table"
                rowKey={(row) => `${row.ts}:${row.tool}:${row.jobId ?? ""}`}
                empty="No calls in this window."
                rows={journalRows}
                columns={recentColumns(repoJobs)}
              />
              <Pager
                page={journalPage}
                pageSize={JOURNAL_PAGE_SIZE}
                total={envelope.recent.length}
                onPage={setJournalPage}
              />
              <EnvelopeHelp>
                Every list call in this window. No prompts or file bodies.
              </EnvelopeHelp>
            </div>
            <div className="envelope-mix">
              <h2 className="envelope-chart__title">Tool mix</h2>
              <Table
                className="envelope-table"
                rowKey={(row) => row.tool}
                empty="No list tools in this window."
                rows={envelope.tools}
                columns={[
                  {
                    id: "tool",
                    header: "Tool",
                    type: "tag",
                    render: (row) => <ToolName name={row.tool} />,
                  },
                  {
                    id: "lists",
                    header: "List calls",
                    type: "number",
                    width: "4.5rem",
                    render: (row) => <EnvelopeNum>{row.listCalls}</EnvelopeNum>,
                  },
                  {
                    id: "cut",
                    header: "Partial",
                    type: "number",
                    width: "5.25rem",
                    render: (row) => (
                      <EnvelopeNum>{row.truncatedCalls}</EnvelopeNum>
                    ),
                  },
                  {
                    id: "kept",
                    header: "Sent %",
                    type: "number",
                    width: "4.75rem",
                    render: (row) => (
                      <EnvelopeNum>
                        {formatEnvelopePercent(row.bytesKeptRatio)}
                      </EnvelopeNum>
                    ),
                  },
                ]}
              />
              <EnvelopeHelp>
                Each list tool in this window. Sent % is how much of the full
                list reached the agent.
              </EnvelopeHelp>
            </div>
          </div>
        </>
      ) : null}

      {envelope?.available && mode === "agentic" ? (
        hosts.length === 0 ? (
          <EmptyState>
            No list calls in this window. Envelope fills when this session or a
            teammate uses list tools.
          </EmptyState>
        ) : (
          <>
            <ul className="envelope-hosts">
              {filteredHosts.map((row) => {
                const title = hostTitle(row.host);
                const meta = hostMetaLines(row, journalRecent);
                return (
                  <li
                    key={row.host}
                    className="envelope-host"
                    data-host={row.host}
                  >
                    <span className="envelope-host__icon" data-host={row.host}>
                      <HostGlyph host={row.host} />
                    </span>
                    <div className="envelope-host__copy">
                      <h3>
                        <HoverTip
                          label={title}
                          detail={hostHoverDetail(row, journalRecent)}
                          unclamp
                        >
                          {title}
                        </HoverTip>
                      </h3>
                      <p>
                        {row.listCalls} list calls · {row.truncatedCalls}{" "}
                        partial · {row.chatCalls} chat / {row.jobCalls} jobs
                      </p>
                      {meta.length > 0 ? (
                        <p className="envelope-host__meta">
                          {meta.map((line) => (
                            <span key={line}>{line}</span>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    <p className="envelope-host__share">
                      {hostTotal > 0
                        ? formatEnvelopePercent(row.listCalls / hostTotal, 0)
                        : ENVELOPE_DASH}
                      <span>of list calls</span>
                    </p>
                  </li>
                );
              })}
            </ul>
            <EnvelopeBarChart
              title="List calls by editor"
              buckets={chartBuckets}
              grouped
            />
            {filteredHosts.some((row) => row.host === "unknown") ? (
              <EnvelopeHelp>
                Unknown means those calls have no editor name. Cursor and Claude
                show only when Prism can name them. Reload Prism to tag new
                calls — old lines stay Unknown.
              </EnvelopeHelp>
            ) : null}
          </>
        )
      ) : null}

      {envelope?.available && mode === "session" ? (
        <>
          <EnvelopeCards density="iris" cards={sessionCards(envelope)} />
          <div className="envelope-split envelope-split--session">
            <div className="envelope-journal">
              <h2 className="envelope-chart__title">Burst ledger</h2>
              <Table
                className="envelope-table envelope-table--ledger"
                rowKey={(row) => row.id}
                selectedKey={activeSession?.id}
                onRowClick={(row) => setSelectedSession(row.id)}
                empty="No bursts in this window."
                rows={pagedSessions}
                columns={sessionColumns(repoJobs)}
              />
              <Pager
                page={sessionPage}
                pageSize={SESSION_PAGE_SIZE}
                total={sessions.length}
                onPage={(page) => {
                  setSessionPage(page);
                  setSelectedSession(undefined);
                }}
              />
              <EnvelopeHelp>
                Bursts of list calls with no more than 30 minutes of quiet,
                split by this session versus a teammate.
              </EnvelopeHelp>
            </div>
            {activeSession ? (
              <SessionInspector
                session={activeSession}
                jobs={repoJobs}
                {...(props.onOpenJob ? { onOpenJob: props.onOpenJob } : {})}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
