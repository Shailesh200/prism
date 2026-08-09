import type { JsonValue } from "@repo-prism/shared";

/**
 * Progress event forwarded while a long-running host/HTTP job is alive.
 * Progress refreshes the PostMessage silence deadline (M-051).
 */
export type TransportProgressEvent = {
  readonly message: string;
  readonly detail?: JsonValue;
};

export type TransportInvokeOptions = {
  readonly onProgress?: (event: TransportProgressEvent) => void;
  readonly timeoutMs?: number;
};

export type TransportResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

/**
 * Thin I/O layer under {@link createPrismClient}. Method bodies (audit,
 * summarizers, soft-fail policy) live once in the client; transports only
 * talk to Core via HTTP or the extension host via postMessage.
 */
export type PrismTransport = {
  /** Label used as the audit `target` (workspace root or `"workspace"`). */
  readonly targetLabel: string;
  /**
   * Audit `command` prefix — e.g. `"host"` → `host:overlay`, or `"http"` →
   * kept readable in the HTTP transport via richer command strings.
   */
  command(method: string, detail?: string): string;
  invoke<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: TransportInvokeOptions,
  ): Promise<TransportResult<T>>;
};

/**
 * Every request carries a deadline. Without one, a host that dies or drops a
 * message leaves the panel spinning forever with no way back (M-051 Phase 1).
 */
export const DEFAULT_RPC_TIMEOUT_MS = 60_000;

/**
 * Operations that stream progress — Lighthouse, bundle analyze, test runs —
 * legitimately take minutes. Their deadline is refreshed by each progress
 * event, so this is the ceiling for silence, not for total duration.
 */
export const PROGRESS_RPC_TIMEOUT_MS = 5 * 60_000;

export class HostRequestError extends Error {
  readonly method: string;
  readonly reason: "timeout" | "disposed" | "transport";

  constructor(
    message: string,
    method: string,
    reason: "timeout" | "disposed" | "transport",
  ) {
    super(message);
    this.name = "HostRequestError";
    this.method = method;
    this.reason = reason;
  }
}
