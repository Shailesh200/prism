/** JSON the Envelope APIs return — kept here so the Dashboard does not import Dispatch. */

export type EnvelopeGrain = "daily" | "weekly" | "monthly" | "overall";
export type EnvelopeHostSource = "mcp" | "env" | "worker";

export type EnvelopeBucket = {
  readonly key: string;
  readonly label: string;
  readonly fromMs: number;
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

export type EnvelopeDayCut = {
  readonly date: string;
  readonly listCalls: number;
  readonly truncatedCalls: number;
  readonly chatCalls: number;
  readonly jobCalls: number;
  readonly bytesKeptRatio: number | null;
};

export type EnvelopePeakDump = {
  readonly tool: string;
  readonly itemCount: number;
  readonly totalCount: number;
  readonly jsonBytes: number;
  readonly dumpBytes: number;
};

export type EnvelopeToolMix = {
  readonly tool: string;
  readonly listCalls: number;
  readonly truncatedCalls: number;
  readonly bytesKeptRatio: number | null;
  readonly dumpNotServedBytes: number;
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
