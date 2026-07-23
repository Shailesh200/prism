/**
 * Session-local audit trail for the playground.
 * Records real Core API calls made by this browser tab — not a Core-persisted
 * store yet. Entries stay on-device (sessionStorage) and are never uploaded.
 */

export type AuditCategory =
  | "index"
  | "analysis"
  | "dna"
  | "git"
  | "test"
  | "cache"
  | "impact"
  | "integration";

export type AuditStatus = "success" | "warning" | "error";

export type AuditDiagnostic = {
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly path?: string;
  readonly fix?: string;
};

export type AuditEntry = {
  readonly id: string;
  /** ISO-8601 timestamp. */
  readonly at: string;
  readonly category: AuditCategory;
  readonly operation: string;
  readonly target: string;
  readonly durationMs: number;
  readonly status: AuditStatus;
  /** Exact API / command string when known. */
  readonly command?: string;
  /** Human-readable output / summary lines. */
  readonly output?: string;
  readonly diagnostics?: readonly AuditDiagnostic[];
};

const STORAGE_KEY = "prism.playground.audit-log.v1";
const MAX_ENTRIES = 250;

type Listener = () => void;

let entries: AuditEntry[] = load();
const listeners = new Set<Listener>();

function load(): AuditEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota — keep in-memory only */
  }
}

function emit(): void {
  for (const l of listeners) l();
}

export function getAuditEntries(): readonly AuditEntry[] {
  return entries;
}

export function subscribeAudit(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearAuditLog(): void {
  entries = [];
  persist();
  emit();
}

export function recordAudit(
  partial: Omit<AuditEntry, "id" | "at"> & { at?: string },
): AuditEntry {
  const entry: AuditEntry = {
    id: `audit:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    at: partial.at ?? new Date().toISOString(),
    category: partial.category,
    operation: partial.operation,
    target: partial.target,
    durationMs: Math.max(0, Math.round(partial.durationMs)),
    status: partial.status,
    ...(partial.command ? { command: partial.command } : {}),
    ...(partial.output ? { output: partial.output } : {}),
    ...(partial.diagnostics && partial.diagnostics.length > 0
      ? { diagnostics: partial.diagnostics }
      : {}),
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  persist();
  emit();
  return entry;
}

/** Time an async operation and record the resulting audit entry. */
export async function withAudit<T>(
  meta: {
    category: AuditCategory;
    operation: string;
    target: string;
    command?: string;
  },
  run: () => Promise<T>,
  summarize: (
    result: T,
    ok: true,
  ) => {
    status: AuditStatus;
    output?: string;
    diagnostics?: readonly AuditDiagnostic[];
  },
): Promise<T> {
  const started = performance.now();
  try {
    const result = await run();
    const summary = summarize(result, true);
    recordAudit({
      category: meta.category,
      operation: meta.operation,
      target: meta.target,
      durationMs: performance.now() - started,
      status: summary.status,
      ...(meta.command ? { command: meta.command } : {}),
      ...(summary.output ? { output: summary.output } : {}),
      ...(summary.diagnostics ? { diagnostics: summary.diagnostics } : {}),
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordAudit({
      category: meta.category,
      operation: meta.operation,
      target: meta.target,
      durationMs: performance.now() - started,
      status: "error",
      ...(meta.command ? { command: meta.command } : {}),
      output: message,
      diagnostics: [{ severity: "error", message }],
    });
    throw error;
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
}

export function formatAuditTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Short calendar date (e.g. `Jul 23`) to pair with {@link formatAuditTime}. */
export function formatAuditDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
  });
}

export function relativeAuditTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const delta = Date.now() - ms;
  const secs = Math.round(delta / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(ms).toLocaleString();
}

export const AUDIT_CATEGORIES: readonly {
  id: AuditCategory | "all";
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "index", label: "Index" },
  { id: "analysis", label: "Analysis" },
  { id: "dna", label: "DNA" },
  { id: "git", label: "Git" },
  { id: "test", label: "Test" },
  { id: "cache", label: "Cache" },
  { id: "impact", label: "Impact" },
  { id: "integration", label: "Integration" },
];
