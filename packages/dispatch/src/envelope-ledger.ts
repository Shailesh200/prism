/**
 * Local-always Envelope ledger (M-069 S5).
 *
 * Intelligence MCP successes append one JSON line under
 * `~/.prism/envelope-ledger.jsonl` (override with `PRISM_HOME`). Never
 * uploaded. No prompts or file bodies. Workspace is the repo the call ran
 * against so Iris can still filter; it is not a source path.
 *
 * Older `{repo}/.prism/envelope-ledger.jsonl` files are read as a fallback.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { EnvelopeHostSource } from "./host-client.js";
import { prismHome } from "./paths.js";

export type { EnvelopeHostSource };

/** Legacy per-repo path — read-only fallback, never written again. */
export const ENVELOPE_LEDGER_REL = ".prism/envelope-ledger.jsonl";
export const ENVELOPE_LEDGER_NAME = "envelope-ledger.jsonl";

export const ENVELOPE_SESSION_GAP_MS = 30 * 60 * 1000;
export const ENVELOPE_KNOWN_HOSTS = ["cursor", "claude", "vscode"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
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

export type EnvelopeGrain = "daily" | "weekly" | "monthly" | "overall";

export type EnvelopeLedgerEntry = {
  readonly ts: string;
  readonly tool: string;
  readonly itemCount: number;
  readonly totalCount: number;
  readonly truncated: boolean;
  readonly limit: number;
  readonly jsonBytes: number;
  /** Dispatch job that made this Intelligence call, when known. */
  readonly jobId?: string;
  /** MCP client at write time (`cursor` / `claude` / `vscode` / …). */
  readonly host?: string;
  /** Raw MCP `clientInfo.name` when the handshake sent one. */
  readonly clientName?: string;
  /** Raw MCP `clientInfo.version` when the handshake sent one. */
  readonly clientVersion?: string;
  /** How `host` was chosen. Omitted when no host was written. */
  readonly hostSource?: EnvelopeHostSource;
  /** Workspace the call ran against. Not a source-file path. */
  readonly workspace?: string;
};

/** Per-job Envelope rollup for the Focus drawer. */
export type JobEnvelopeMetrics = {
  readonly available: boolean;
  readonly bytesKeptRatio: number | null;
  readonly tokensSaved: number | null;
  readonly calls: number;
  readonly truncatedCalls: number | null;
};

/** One local calendar day in the Iris week strip. */
export type EnvelopeDayCut = {
  readonly date: string;
  readonly listCalls: number;
  readonly truncatedCalls: number;
  readonly chatCalls: number;
  readonly jobCalls: number;
  readonly bytesKeptRatio: number | null;
};

export type EnvelopeBucket = {
  readonly key: string;
  readonly label: string;
  /** Local start of this bucket (inclusive). */
  readonly fromMs: number;
  /** Local start of the next bucket (exclusive). */
  readonly toMs: number;
  readonly listCalls: number;
  readonly truncatedCalls: number;
  readonly chatCalls: number;
  readonly jobCalls: number;
  readonly bytesKeptRatio: number | null;
  readonly dumpNotServedBytes: number;
};

export type EnvelopeHostShare = {
  readonly host: string;
  readonly listCalls: number;
  readonly truncatedCalls: number;
  readonly chatCalls: number;
  readonly jobCalls: number;
  readonly bytesKeptRatio: number | null;
  readonly dumpNotServedBytes: number;
  readonly firstTs: string;
  readonly lastTs: string;
  readonly clientNames: readonly string[];
  readonly clientVersions: readonly string[];
  readonly hostSources: readonly EnvelopeHostSource[];
  readonly topTools: readonly {
    readonly tool: string;
    readonly calls: number;
  }[];
};

export type EnvelopeToolMix = {
  readonly tool: string;
  readonly listCalls: number;
  readonly truncatedCalls: number;
  readonly bytesKeptRatio: number | null;
  readonly dumpNotServedBytes: number;
};

export type EnvelopePeakDump = {
  readonly tool: string;
  readonly itemCount: number;
  readonly totalCount: number;
  readonly jsonBytes: number;
  readonly dumpBytes: number;
};

export type EnvelopeRecentCall = {
  readonly ts: string;
  readonly tool: string;
  readonly itemCount: number;
  readonly totalCount: number;
  readonly truncated: boolean;
  readonly jsonBytes: number;
  readonly dumpBytes: number;
  readonly jobId?: string;
  readonly host?: string;
  readonly clientName?: string;
  readonly clientVersion?: string;
  readonly hostSource?: EnvelopeHostSource;
};

export type EnvelopeSessionCall = {
  readonly ts: string;
  readonly tool: string;
  readonly itemCount: number;
  readonly totalCount: number;
  readonly truncated: boolean;
  readonly jsonBytes: number;
};

export type EnvelopeSessionRow = {
  readonly id: string;
  readonly startedAt: string;
  readonly kind: "inline" | "job";
  readonly jobId?: string;
  readonly host: string;
  readonly listCalls: number;
  readonly truncatedCalls: number;
  readonly bytesKeptRatio: number | null;
  readonly followThrough: number | null;
  readonly dumpNotServedBytes: number;
  readonly calls: readonly EnvelopeSessionCall[];
};

export type EnvelopeSummarizeOptions = {
  readonly fromMs?: number;
  readonly toMs?: number;
  readonly grain?: EnvelopeGrain;
};

export type EnvelopeMetrics = {
  readonly available: boolean;
  readonly bytesKeptRatio: number | null;
  readonly bytesKeptDeltaPp: number | null;
  readonly followThrough: number | null;
  readonly habitDays: number | null;
  readonly habitDelta: number | null;
  readonly habitDenom: number | null;
  readonly listCalls: number | null;
  readonly truncatedCalls: number | null;
  readonly chatCalls: number | null;
  readonly jobCalls: number | null;
  readonly dumpNotServedBytes: number | null;
  readonly dumpNotServedTokens: number | null;
  readonly cutShortRate: number | null;
  readonly sessionCount: number | null;
  readonly inlineSessions: number | null;
  readonly jobSessions: number | null;
  readonly medianListCalls: number | null;
  readonly peakDump: EnvelopePeakDump | null;
  readonly days: readonly EnvelopeDayCut[];
  readonly buckets: readonly EnvelopeBucket[];
  readonly hosts: readonly EnvelopeHostShare[];
  readonly tools: readonly EnvelopeToolMix[];
  readonly sessions: readonly EnvelopeSessionRow[];
  readonly recent: readonly EnvelopeRecentCall[];
  readonly grain: EnvelopeGrain;
  readonly fromMs: number | null;
  readonly toMs: number | null;
  readonly provenance: {
    readonly bytesKept: "measured" | "unavailable";
    readonly followThrough: "heuristic" | "unavailable";
  };
};

export function envelopeLedgerPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(prismHome(env), ENVELOPE_LEDGER_NAME);
}

function legacyLedgerPath(workspaceRoot: string): string {
  return join(workspaceRoot, ENVELOPE_LEDGER_REL);
}

function clipField(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function sanitizeHostSource(
  value: string | undefined,
): EnvelopeHostSource | undefined {
  const source = value?.trim();
  if (source === "mcp" || source === "env" || source === "worker") {
    return source;
  }
  return undefined;
}

function sanitize(entry: EnvelopeLedgerEntry): EnvelopeLedgerEntry {
  const jobId = entry.jobId?.trim();
  const host = entry.host?.trim().toLowerCase().slice(0, 40);
  const workspace = entry.workspace?.trim().slice(0, 512);
  const clientName = clipField(entry.clientName, 80);
  const clientVersion = clipField(entry.clientVersion, 40);
  const hostSource = sanitizeHostSource(entry.hostSource);
  return {
    ts: entry.ts,
    tool: entry.tool,
    itemCount: entry.itemCount,
    totalCount: entry.totalCount,
    truncated: entry.truncated,
    limit: entry.limit,
    jsonBytes: entry.jsonBytes,
    ...(jobId ? { jobId } : {}),
    ...(host ? { host } : {}),
    ...(clientName ? { clientName } : {}),
    ...(clientVersion ? { clientVersion } : {}),
    ...(hostSource ? { hostSource } : {}),
    ...(workspace ? { workspace } : {}),
  };
}

function parseLedgerText(raw: string): EnvelopeLedgerEntry[] {
  const out: EnvelopeLedgerEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }
      const row = parsed as Partial<EnvelopeLedgerEntry>;
      if (typeof row.ts !== "string" || typeof row.tool !== "string") {
        continue;
      }
      out.push(
        sanitize({
          ts: row.ts,
          tool: row.tool,
          itemCount: Number(row.itemCount) || 0,
          totalCount: Number(row.totalCount) || 0,
          truncated: Boolean(row.truncated),
          limit: Number(row.limit) || 0,
          jsonBytes: Number(row.jsonBytes) || 0,
          ...(typeof row.jobId === "string" ? { jobId: row.jobId } : {}),
          ...(typeof row.host === "string" ? { host: row.host } : {}),
          ...(typeof row.clientName === "string"
            ? { clientName: row.clientName }
            : {}),
          ...(typeof row.clientVersion === "string"
            ? { clientVersion: row.clientVersion }
            : {}),
          ...(typeof row.hostSource === "string"
            ? {
                hostSource: row.hostSource as EnvelopeLedgerEntry["hostSource"],
              }
            : {}),
          ...(typeof row.workspace === "string"
            ? { workspace: row.workspace }
            : {}),
        }),
      );
    } catch {
      /* skip junk lines */
    }
  }
  return out;
}

async function readLedgerFile(path: string): Promise<EnvelopeLedgerEntry[]> {
  try {
    return parseLedgerText(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

function testHomeGuard(env: NodeJS.ProcessEnv): boolean {
  const inTest =
    env.VITEST === "true" ||
    env.BUN_TEST === "1" ||
    process.env.VITEST === "true" ||
    process.env.BUN_TEST === "1";
  return Boolean(inTest && !env.PRISM_HOME?.trim());
}

export async function appendEnvelopeLedger(
  workspaceRoot: string,
  entry: EnvelopeLedgerEntry,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (testHomeGuard(env)) {
    throw new Error(
      "PRISM_HOME is required to write the Envelope ledger in tests",
    );
  }
  const path = envelopeLedgerPath(env);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(
    path,
    `${JSON.stringify(
      sanitize({
        ...entry,
        ...(workspaceRoot.trim() ? { workspace: workspaceRoot } : {}),
      }),
    )}\n`,
    "utf8",
  );
}

export async function readEnvelopeLedger(
  workspaceRoot?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EnvelopeLedgerEntry[]> {
  const globalRows = testHomeGuard(env)
    ? []
    : await readLedgerFile(envelopeLedgerPath(env));
  const scoped = workspaceRoot?.trim()
    ? globalRows.filter((row) => row.workspace === workspaceRoot)
    : globalRows;
  if (!workspaceRoot?.trim()) return scoped;
  const legacy = await readLedgerFile(legacyLedgerPath(workspaceRoot));
  if (legacy.length === 0) return scoped;
  return [...legacy, ...scoped];
}

function parseTs(ts: string): number {
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

function isListCall(entry: EnvelopeLedgerEntry): boolean {
  return entry.itemCount > 0 || entry.totalCount > 0 || entry.limit > 0;
}

function gapGroups(
  entries: readonly EnvelopeLedgerEntry[],
): EnvelopeLedgerEntry[][] {
  const sorted = [...entries].sort((a, b) => parseTs(a.ts) - parseTs(b.ts));
  const groups: EnvelopeLedgerEntry[][] = [];
  let current: EnvelopeLedgerEntry[] = [];
  let last = 0;
  for (const entry of sorted) {
    const at = parseTs(entry.ts);
    if (current.length > 0 && at - last > ENVELOPE_SESSION_GAP_MS) {
      groups.push(current);
      current = [];
    }
    current.push(entry);
    last = at;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * 30-minute quiet gap, split by inline vs job so a teammate and this chat
 * never share a stretch.
 */
function sessionGroups(
  entries: readonly EnvelopeLedgerEntry[],
): EnvelopeLedgerEntry[][] {
  const streams = new Map<string, EnvelopeLedgerEntry[]>();
  for (const entry of entries) {
    const key = entry.jobId ?? "";
    const bucket = streams.get(key) ?? [];
    bucket.push(entry);
    streams.set(key, bucket);
  }
  const groups: EnvelopeLedgerEntry[][] = [];
  for (const stream of streams.values()) {
    groups.push(...gapGroups(stream));
  }
  return groups;
}

/** Estimated dump size if the list had not been bounded. */
export function dumpBytes(entry: EnvelopeLedgerEntry): number {
  if (entry.itemCount > 0 && entry.totalCount > entry.itemCount) {
    return entry.jsonBytes * (entry.totalCount / entry.itemCount);
  }
  return entry.jsonBytes;
}

/** Same 4-bytes-per-token heuristic as worker orientation. */
export function estimateTokensFromBytes(bytes: number): number {
  return Math.round(Math.max(0, bytes) / 4);
}

function bytesRatio(entries: readonly EnvelopeLedgerEntry[]): number | null {
  if (entries.length === 0) return null;
  let kept = 0;
  let dump = 0;
  for (const entry of entries) {
    kept += entry.jsonBytes;
    dump += dumpBytes(entry);
  }
  if (dump <= 0) return null;
  return kept / dump;
}

function dumpNotServedBytesOf(entries: readonly EnvelopeLedgerEntry[]): number {
  let spared = 0;
  for (const entry of entries) {
    spared += Math.max(0, dumpBytes(entry) - entry.jsonBytes);
  }
  return spared;
}

export function summarizeJobEnvelope(
  entries: readonly EnvelopeLedgerEntry[],
  jobId: string,
): JobEnvelopeMetrics {
  const mine = entries.filter((entry) => entry.jobId === jobId);
  if (mine.length === 0) {
    return {
      available: false,
      bytesKeptRatio: null,
      tokensSaved: null,
      calls: 0,
      truncatedCalls: null,
    };
  }
  let kept = 0;
  let dump = 0;
  for (const entry of mine) {
    kept += entry.jsonBytes;
    dump += dumpBytes(entry);
  }
  return {
    available: true,
    bytesKeptRatio: bytesRatio(mine),
    tokensSaved: estimateTokensFromBytes(dump - kept),
    calls: mine.length,
    truncatedCalls: mine.filter((entry) => entry.truncated).length,
  };
}

function followThroughShare(
  entries: readonly EnvelopeLedgerEntry[],
): number | null {
  let truncated = 0;
  let followed = 0;
  for (const session of sessionGroups(entries)) {
    for (let i = 0; i < session.length; i += 1) {
      const entry = session[i];
      if (!entry?.truncated) continue;
      truncated += 1;
      const next = session[i + 1];
      if (!next) continue;
      const narrowerTool = next.tool === "find_symbol";
      const smallerLimit =
        next.limit > 0 && next.limit < entry.limit && next.limit !== 500;
      if (narrowerTool || smallerLimit) followed += 1;
    }
  }
  if (truncated === 0) return null;
  return followed / truncated;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

function isoWeekLabel(ms: number): { key: string; label: string } {
  const monday = localMonday(ms);
  const thursday = addLocalDays(monday, 3);
  const year = new Date(thursday).getFullYear();
  const week1Monday = localMonday(new Date(year, 0, 4).getTime());
  const week = Math.round((monday - week1Monday) / DAY_MS / 7) + 1;
  const key = `${year}-W${String(week).padStart(2, "0")}`;
  return { key, label: `W${week}` };
}

function monthKey(ms: number): { key: string; label: string } {
  const d = new Date(ms);
  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  return { key, label: MONTHS[d.getMonth()] ?? key };
}

function dailyLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  const dt = new Date(year, month - 1, day);
  const n = date.slice(8, 10).startsWith("0") ? date.slice(9) : date.slice(8);
  return `${n} ${WEEKDAYS[dt.getDay()]}`;
}

function localDayKeysEnding(nowMs: number, count: number): string[] {
  const start = startOfLocalDay(nowMs);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(dayKey(addLocalDays(start, -i)));
  }
  return keys;
}

function cutFromRows(
  date: string,
  rows: readonly EnvelopeLedgerEntry[],
): EnvelopeDayCut {
  return {
    date,
    listCalls: rows.filter(isListCall).length,
    truncatedCalls: rows.filter((row) => row.truncated).length,
    chatCalls: rows.filter((row) => !row.jobId).length,
    jobCalls: rows.filter((row) => Boolean(row.jobId)).length,
    bytesKeptRatio: bytesRatio(rows),
  };
}

function bucketFromRows(
  key: string,
  label: string,
  rows: readonly EnvelopeLedgerEntry[],
  fromMs: number,
  toMs: number,
): EnvelopeBucket {
  const cut = cutFromRows(key, rows);
  return {
    key,
    label,
    fromMs,
    toMs,
    listCalls: cut.listCalls,
    truncatedCalls: cut.truncatedCalls,
    chatCalls: cut.chatCalls,
    jobCalls: cut.jobCalls,
    bytesKeptRatio: cut.bytesKeptRatio,
    dumpNotServedBytes: dumpNotServedBytesOf(rows),
  };
}

function envelopeWeekDays(
  week: readonly EnvelopeLedgerEntry[],
  nowMs: number,
): EnvelopeDayCut[] {
  const keys = localDayKeysEnding(nowMs, 7);
  const buckets = new Map<string, EnvelopeLedgerEntry[]>();
  for (const key of keys) buckets.set(key, []);
  for (const entry of week) {
    const key = dayKey(parseTs(entry.ts));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
  }
  return keys.map((date) => cutFromRows(date, buckets.get(date) ?? []));
}

function groupByKey(
  entries: readonly EnvelopeLedgerEntry[],
  keyOf: (entry: EnvelopeLedgerEntry) => string,
): Map<string, EnvelopeLedgerEntry[]> {
  const map = new Map<string, EnvelopeLedgerEntry[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const bucket = map.get(key) ?? [];
    bucket.push(entry);
    map.set(key, bucket);
  }
  return map;
}

function lastInclusiveDayStart(fromMs: number, toMs: number): number {
  return startOfLocalDay(Math.max(fromMs, toMs - 1));
}

function buildDailyBuckets(
  entries: readonly EnvelopeLedgerEntry[],
  fromMs: number,
  toMs: number,
): EnvelopeBucket[] {
  const keys: { key: string; start: number }[] = [];
  let t = startOfLocalDay(fromMs);
  const end = lastInclusiveDayStart(fromMs, toMs);
  while (t <= end) {
    keys.push({ key: dayKey(t), start: t });
    t = addLocalDays(t, 1);
  }
  const grouped = groupByKey(entries, (entry) => dayKey(parseTs(entry.ts)));
  return keys.map((row) =>
    bucketFromRows(
      row.key,
      dailyLabel(row.key),
      grouped.get(row.key) ?? [],
      row.start,
      addLocalDays(row.start, 1),
    ),
  );
}

function buildWeeklyBuckets(
  entries: readonly EnvelopeLedgerEntry[],
  fromMs: number,
  toMs: number,
): EnvelopeBucket[] {
  const keys: { key: string; label: string; start: number }[] = [];
  let t = localMonday(fromMs);
  const end = localMonday(Math.max(fromMs, toMs - 1));
  while (t <= end) {
    keys.push({ ...isoWeekLabel(t), start: t });
    t = addLocalDays(t, 7);
  }
  const grouped = groupByKey(
    entries,
    (entry) => isoWeekLabel(parseTs(entry.ts)).key,
  );
  return keys.map((row) =>
    bucketFromRows(
      row.key,
      row.label,
      grouped.get(row.key) ?? [],
      row.start,
      addLocalDays(row.start, 7),
    ),
  );
}

function buildMonthlyBuckets(
  entries: readonly EnvelopeLedgerEntry[],
  fromMs: number,
  toMs: number,
): EnvelopeBucket[] {
  const keys: { key: string; label: string; start: number }[] = [];
  const start = new Date(startOfLocalDay(fromMs));
  const end = new Date(startOfLocalDay(Math.max(fromMs, toMs - 1)));
  let year = start.getFullYear();
  let month = start.getMonth();
  const endYear = end.getFullYear();
  const endMonth = end.getMonth();
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const ms = new Date(year, month, 1).getTime();
    keys.push({ ...monthKey(ms), start: ms });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  const grouped = groupByKey(
    entries,
    (entry) => monthKey(parseTs(entry.ts)).key,
  );
  return keys.map((row) => {
    const start = new Date(row.start);
    return bucketFromRows(
      row.key,
      row.label,
      grouped.get(row.key) ?? [],
      row.start,
      new Date(start.getFullYear(), start.getMonth() + 1, 1).getTime(),
    );
  });
}

function peakDumpOf(
  entries: readonly EnvelopeLedgerEntry[],
): EnvelopePeakDump | null {
  let best: EnvelopePeakDump | null = null;
  let bestSpared = 0;
  for (const entry of entries) {
    const dump = dumpBytes(entry);
    const spared = dump - entry.jsonBytes;
    if (spared <= bestSpared) continue;
    bestSpared = spared;
    best = {
      tool: entry.tool,
      itemCount: entry.itemCount,
      totalCount: entry.totalCount,
      jsonBytes: entry.jsonBytes,
      dumpBytes: dump,
    };
  }
  return best;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function hostSourcesOf(
  rows: readonly EnvelopeLedgerEntry[],
): EnvelopeHostSource[] {
  const out: EnvelopeHostSource[] = [];
  for (const source of ["mcp", "env", "worker"] as const) {
    if (rows.some((row) => row.hostSource === source)) out.push(source);
  }
  return out;
}

function spanOf(rows: readonly EnvelopeLedgerEntry[]): {
  firstTs: string;
  lastTs: string;
} {
  let first = "";
  let last = "";
  let firstMs = 0;
  let lastMs = 0;
  for (const row of rows) {
    const at = parseTs(row.ts);
    if (at <= 0) continue;
    if (!first || at < firstMs) {
      first = row.ts;
      firstMs = at;
    }
    if (!last || at > lastMs) {
      last = row.ts;
      lastMs = at;
    }
  }
  return { firstTs: first, lastTs: last };
}

function topToolsOf(
  rows: readonly EnvelopeLedgerEntry[],
  n = 3,
): { readonly tool: string; readonly calls: number }[] {
  return [...groupByKey(rows, (entry) => entry.tool).entries()]
    .map(([tool, list]) => ({ tool, calls: list.length }))
    .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool))
    .slice(0, n);
}

function hostShare(
  host: string,
  rows: readonly EnvelopeLedgerEntry[],
): EnvelopeHostShare {
  const span = spanOf(rows);
  return {
    host,
    listCalls: rows.filter(isListCall).length,
    truncatedCalls: rows.filter((row) => row.truncated).length,
    chatCalls: rows.filter((row) => !row.jobId).length,
    jobCalls: rows.filter((row) => Boolean(row.jobId)).length,
    bytesKeptRatio: bytesRatio(rows),
    dumpNotServedBytes: dumpNotServedBytesOf(rows),
    firstTs: span.firstTs,
    lastTs: span.lastTs,
    clientNames: uniqueSorted(
      rows.flatMap((row) => (row.clientName ? [row.clientName] : [])),
    ),
    clientVersions: uniqueSorted(
      rows.flatMap((row) => (row.clientVersion ? [row.clientVersion] : [])),
    ),
    hostSources: hostSourcesOf(rows),
    topTools: topToolsOf(rows),
  };
}

function toolMixOf(entries: readonly EnvelopeLedgerEntry[]): EnvelopeToolMix[] {
  const grouped = groupByKey(entries, (entry) => entry.tool);
  return [...grouped.entries()]
    .map(([tool, rows]) => ({
      tool,
      listCalls: rows.filter(isListCall).length,
      truncatedCalls: rows.filter((row) => row.truncated).length,
      bytesKeptRatio: bytesRatio(rows),
      dumpNotServedBytes: dumpNotServedBytesOf(rows),
    }))
    .sort((a, b) => b.listCalls - a.listCalls || a.tool.localeCompare(b.tool));
}

function sessionHost(rows: readonly EnvelopeLedgerEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of rows) {
    const host = entry.host ?? "unknown";
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  let best = "unknown";
  let bestN = 0;
  for (const [host, n] of counts) {
    if (n > bestN) {
      best = host;
      bestN = n;
    }
  }
  return best;
}

function sessionRowsOf(
  entries: readonly EnvelopeLedgerEntry[],
): EnvelopeSessionRow[] {
  return sessionGroups(entries)
    .map((rows) => {
      const first = rows[0];
      const startedAt = first?.ts ?? "";
      const jobId = first?.jobId;
      const kind = jobId ? ("job" as const) : ("inline" as const);
      const id = `${startedAt}:${jobId ?? "inline"}`;
      return {
        id,
        startedAt,
        kind,
        ...(jobId ? { jobId } : {}),
        host: sessionHost(rows),
        listCalls: rows.filter(isListCall).length,
        truncatedCalls: rows.filter((row) => row.truncated).length,
        bytesKeptRatio: bytesRatio(rows),
        followThrough: followThroughShare(rows),
        dumpNotServedBytes: dumpNotServedBytesOf(rows),
        calls: rows.map((entry) => ({
          ts: entry.ts,
          tool: entry.tool,
          itemCount: entry.itemCount,
          totalCount: entry.totalCount,
          truncated: entry.truncated,
          jsonBytes: entry.jsonBytes,
        })),
      };
    })
    .sort((a, b) => parseTs(b.startedAt) - parseTs(a.startedAt));
}

function recentOf(
  entries: readonly EnvelopeLedgerEntry[],
): EnvelopeRecentCall[] {
  return [...entries]
    .sort((a, b) => parseTs(b.ts) - parseTs(a.ts))
    .slice(0, 200)
    .map((entry) => ({
      ts: entry.ts,
      tool: entry.tool,
      itemCount: entry.itemCount,
      totalCount: entry.totalCount,
      truncated: entry.truncated,
      jsonBytes: entry.jsonBytes,
      dumpBytes: dumpBytes(entry),
      ...(entry.jobId ? { jobId: entry.jobId } : {}),
      ...(entry.host ? { host: entry.host } : {}),
      ...(entry.clientName ? { clientName: entry.clientName } : {}),
      ...(entry.clientVersion ? { clientVersion: entry.clientVersion } : {}),
      ...(entry.hostSource ? { hostSource: entry.hostSource } : {}),
    }));
}

const ENVELOPE_UNAVAILABLE: EnvelopeMetrics = {
  available: false,
  bytesKeptRatio: null,
  bytesKeptDeltaPp: null,
  followThrough: null,
  habitDays: null,
  habitDelta: null,
  habitDenom: null,
  listCalls: null,
  truncatedCalls: null,
  chatCalls: null,
  jobCalls: null,
  dumpNotServedBytes: null,
  dumpNotServedTokens: null,
  cutShortRate: null,
  sessionCount: null,
  inlineSessions: null,
  jobSessions: null,
  medianListCalls: null,
  peakDump: null,
  days: [],
  buckets: [],
  hosts: [],
  tools: [],
  sessions: [],
  recent: [],
  grain: "daily",
  fromMs: null,
  toMs: null,
  provenance: {
    bytesKept: "unavailable",
    followThrough: "unavailable",
  },
};

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const even = sorted.length % 2 === 0;
  const a = sorted[mid] ?? 0;
  const b = sorted[mid - 1] ?? a;
  return even ? (a + b) / 2 : a;
}

function habitDaysIn(
  entries: readonly EnvelopeLedgerEntry[],
  fromMs: number,
  toMs: number,
): number | null {
  const inWindow = entries.filter((entry) => {
    const at = parseTs(entry.ts);
    return at >= fromMs && at < toMs;
  });
  if (inWindow.length === 0) return null;
  const byDay = new Map<string, number[]>();
  for (const session of sessionGroups(inWindow)) {
    const start = parseTs(session[0]?.ts ?? "");
    if (start < fromMs || start >= toMs) continue;
    const listCount = session.filter(isListCall).length;
    const key = dayKey(start);
    const bucket = byDay.get(key) ?? [];
    bucket.push(listCount);
    byDay.set(key, bucket);
  }
  if (byDay.size === 0) return null;
  let good = 0;
  for (const counts of byDay.values()) {
    if (median(counts) <= 5) good += 1;
  }
  return good;
}

function inRange(
  entries: readonly EnvelopeLedgerEntry[],
  fromMs: number,
  toMs: number,
): EnvelopeLedgerEntry[] {
  return entries.filter((entry) => {
    const at = parseTs(entry.ts);
    return at >= fromMs && at < toMs;
  });
}

function resolveWindow(
  entries: readonly EnvelopeLedgerEntry[],
  nowMs: number,
  options: EnvelopeSummarizeOptions | undefined,
): { fromMs: number; toMs: number; grain: EnvelopeGrain } {
  const grain = options?.grain ?? "daily";
  const toMs = options?.toMs ?? nowMs;
  if (options?.fromMs != null) {
    let fromMs = options.fromMs;
    if (!Number.isFinite(fromMs) || fromMs <= 0) {
      const first = entries.reduce((min, row) => {
        const at = parseTs(row.ts);
        return at > 0 && (min === 0 || at < min) ? at : min;
      }, 0);
      fromMs = first || addLocalDays(startOfLocalDay(toMs), -6);
    }
    return { fromMs, toMs, grain };
  }
  if (grain === "weekly") {
    return { fromMs: addLocalDays(localMonday(toMs), -49), toMs, grain };
  }
  if (grain === "monthly") {
    const d = new Date(toMs);
    return {
      fromMs: new Date(d.getFullYear(), d.getMonth() - 5, 1).getTime(),
      toMs,
      grain,
    };
  }
  if (grain === "overall") {
    const first = entries.reduce((min, entry) => {
      const at = parseTs(entry.ts);
      return at > 0 && (min === 0 || at < min) ? at : min;
    }, 0);
    return { fromMs: first || startOfLocalDay(toMs), toMs, grain };
  }
  return { fromMs: addLocalDays(startOfLocalDay(toMs), -6), toMs, grain };
}

function bucketsFor(
  grain: EnvelopeGrain,
  entries: readonly EnvelopeLedgerEntry[],
  fromMs: number,
  toMs: number,
): EnvelopeBucket[] {
  if (grain === "weekly") return buildWeeklyBuckets(entries, fromMs, toMs);
  if (grain === "monthly" || grain === "overall") {
    return buildMonthlyBuckets(entries, fromMs, toMs);
  }
  return buildDailyBuckets(entries, fromMs, toMs);
}

export function summarizeEnvelopeLedger(
  entries: readonly EnvelopeLedgerEntry[],
  nowMs: number = Date.now(),
  options?: EnvelopeSummarizeOptions,
): EnvelopeMetrics {
  const window = resolveWindow(entries, nowMs, options);
  const span = Math.max(1, window.toMs - window.fromMs);
  const thisWindow = inRange(entries, window.fromMs, window.toMs);
  const lastWindow = inRange(entries, window.fromMs - span, window.fromMs);

  if (thisWindow.length === 0) {
    return {
      ...ENVELOPE_UNAVAILABLE,
      grain: window.grain,
      fromMs: window.fromMs,
      toMs: window.toMs,
      days: [],
      provenance: { ...ENVELOPE_UNAVAILABLE.provenance },
    };
  }

  const bytesKeptRatio = bytesRatio(thisWindow);
  const lastRatio = bytesRatio(lastWindow);
  const bytesKeptDeltaPp =
    bytesKeptRatio !== null && lastRatio !== null
      ? (bytesKeptRatio - lastRatio) * 100
      : null;
  const followThrough = followThroughShare(thisWindow);
  const habitDays = habitDaysIn(entries, window.fromMs, window.toMs);
  const lastHabit = habitDaysIn(entries, window.fromMs - span, window.fromMs);
  const habitDelta =
    habitDays !== null && lastHabit !== null ? habitDays - lastHabit : null;
  const listCalls = thisWindow.filter(isListCall).length;
  const truncatedCalls = thisWindow.filter((entry) => entry.truncated).length;
  const chatCalls = thisWindow.filter((entry) => !entry.jobId).length;
  const jobCalls = thisWindow.filter((entry) => Boolean(entry.jobId)).length;
  const dumpNotServedBytes = dumpNotServedBytesOf(thisWindow);
  const sessions = sessionRowsOf(thisWindow);
  const inlineSessions = sessions.filter((row) => row.kind === "inline").length;
  const jobSessions = sessions.filter((row) => row.kind === "job").length;
  const listPerSession = sessions.map((row) => row.listCalls);
  const hosts = [...groupByKey(thisWindow, (entry) => entry.host ?? "unknown")]
    .map(([host, rows]) => hostShare(host, rows))
    .sort((a, b) => b.listCalls - a.listCalls || a.host.localeCompare(b.host));

  const habitDenom =
    window.grain === "daily"
      ? 7
      : Math.max(
          1,
          Math.round(
            (lastInclusiveDayStart(window.fromMs, window.toMs) -
              startOfLocalDay(window.fromMs)) /
              DAY_MS,
          ) + 1,
        );

  return {
    available: true,
    bytesKeptRatio,
    bytesKeptDeltaPp,
    followThrough,
    habitDays,
    habitDelta,
    habitDenom,
    listCalls,
    truncatedCalls,
    chatCalls,
    jobCalls,
    dumpNotServedBytes,
    dumpNotServedTokens: estimateTokensFromBytes(dumpNotServedBytes),
    cutShortRate: listCalls > 0 ? truncatedCalls / listCalls : null,
    sessionCount: sessions.length,
    inlineSessions,
    jobSessions,
    medianListCalls: listPerSession.length > 0 ? median(listPerSession) : null,
    peakDump: peakDumpOf(thisWindow),
    days: envelopeWeekDays(thisWindow, window.toMs),
    buckets: bucketsFor(window.grain, thisWindow, window.fromMs, window.toMs),
    hosts,
    tools: toolMixOf(thisWindow),
    sessions,
    recent: recentOf(thisWindow),
    grain: window.grain,
    fromMs: window.fromMs,
    toMs: window.toMs,
    provenance: {
      bytesKept: bytesKeptRatio === null ? "unavailable" : "measured",
      followThrough: followThrough === null ? "unavailable" : "heuristic",
    },
  };
}

/** Pull envelope fields from a tool result without storing payloads. */
export function envelopeFromToolResult(
  value: unknown,
): Pick<
  EnvelopeLedgerEntry,
  "itemCount" | "totalCount" | "truncated" | "limit"
> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as {
      items?: unknown;
      totalCount?: unknown;
      truncated?: unknown;
      limit?: unknown;
    };
    if (Array.isArray(row.items)) {
      const itemCount = row.items.length;
      const totalCount =
        typeof row.totalCount === "number" ? row.totalCount : itemCount;
      return {
        itemCount,
        totalCount,
        truncated: Boolean(row.truncated),
        limit: typeof row.limit === "number" ? row.limit : itemCount,
      };
    }
  }
  if (Array.isArray(value)) {
    return {
      itemCount: value.length,
      totalCount: value.length,
      truncated: false,
      limit: value.length,
    };
  }
  return { itemCount: 0, totalCount: 0, truncated: false, limit: 0 };
}
