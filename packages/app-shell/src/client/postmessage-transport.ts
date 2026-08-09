import {
  DEFAULT_RPC_TIMEOUT_MS,
  HostRequestError,
  PROGRESS_RPC_TIMEOUT_MS,
  type PrismTransport,
  type TransportInvokeOptions,
  type TransportProgressEvent,
  type TransportResult,
} from "./transport.js";

/** Envelope the webview posts to the extension host. */
export type PostMessageRequestEnvelope = {
  readonly type: "request";
  readonly request: { id: string; method: string } & Record<string, unknown>;
};

type Pending = {
  resolve: (value: TransportResult<unknown>) => void;
  reject: (err: Error) => void;
  onProgress?: (event: TransportProgressEvent) => void;
  timer: ReturnType<typeof setTimeout>;
  timeoutMs: number;
  method: string;
};

export type PostMessageTransport = PrismTransport & {
  handleMessage(msg: unknown): void;
  abort(reason?: string): void;
};

export type PostMessageTransportOptions = {
  /**
   * Post a request envelope to the host. When omitted (or `useHttpFallback`
   * is true), requests go to {@link httpFallbackUrl} instead.
   */
  readonly postMessage?: (message: PostMessageRequestEnvelope) => void;
  /** Use HTTP `/api/host` (or custom URL) instead of postMessage. */
  readonly useHttpFallback?: boolean;
  readonly httpFallbackUrl?: string;
  readonly targetLabel?: string;
  readonly fetchImpl?: typeof fetch;
};

/**
 * postMessage (or `/api/host`) transport with M-051 RPC deadlines: timeout,
 * dispose-abort, progress refresh, and unknown-id / malformed message guards.
 */
export function createPostMessageTransport(
  options: PostMessageTransportOptions = {},
): PostMessageTransport {
  const pending = new Map<string, Pending>();
  let seq = 0;
  const fetchImpl = options.fetchImpl ?? fetch;
  const httpFallbackUrl = options.httpFallbackUrl ?? "/api/host";
  const useHttpFallback =
    options.useHttpFallback === true ||
    typeof options.postMessage !== "function";
  const targetLabel = options.targetLabel ?? "workspace";

  function nextId(): string {
    seq += 1;
    return `req-${seq}`;
  }

  function settle(id: string): Pending | undefined {
    const wait = pending.get(id);
    if (!wait) return undefined;
    clearTimeout(wait.timer);
    pending.delete(id);
    return wait;
  }

  function startDeadline(
    id: string,
    timeoutMs: number,
    method: string,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      const expired = settle(id);
      expired?.reject(
        new HostRequestError(
          `The extension host did not respond to "${method}" within ${Math.round(
            timeoutMs / 1000,
          )}s.`,
          method,
          "timeout",
        ),
      );
    }, timeoutMs);
  }

  function refreshDeadline(id: string): void {
    const wait = pending.get(id);
    if (!wait) return;
    clearTimeout(wait.timer);
    wait.timer = startDeadline(id, wait.timeoutMs, wait.method);
  }

  function forwardProgress(id: string, event: TransportProgressEvent): void {
    const wait = pending.get(id);
    if (!wait) return;
    refreshDeadline(id);
    wait.onProgress?.(event);
  }

  function abort(
    reason = "The Prism panel was reloaded before the request finished.",
  ): void {
    const inFlight = [...pending.entries()];
    pending.clear();
    for (const [, wait] of inFlight) {
      clearTimeout(wait.timer);
      wait.reject(new HostRequestError(reason, wait.method, "disposed"));
    }
  }

  function handleMessage(msg: unknown): void {
    if (!msg || typeof msg !== "object") return;
    const record = msg as Record<string, unknown>;
    if (
      record.type === "lighthouseLabProgress" &&
      typeof record.id === "string"
    ) {
      const event: TransportProgressEvent =
        record.detail !== undefined
          ? {
              message: typeof record.message === "string" ? record.message : "",
              detail: record.detail as NonNullable<
                TransportProgressEvent["detail"]
              >,
            }
          : {
              message: typeof record.message === "string" ? record.message : "",
            };
      forwardProgress(record.id, event);
      return;
    }
    if (
      record.type === "bundleAnalyzeProgress" &&
      typeof record.id === "string"
    ) {
      const event: TransportProgressEvent =
        record.detail !== undefined
          ? {
              message: typeof record.message === "string" ? record.message : "",
              detail: record.detail as NonNullable<
                TransportProgressEvent["detail"]
              >,
            }
          : {
              message: typeof record.message === "string" ? record.message : "",
            };
      forwardProgress(record.id, event);
      return;
    }
    if (typeof record.id !== "string") {
      console.warn("[prism] Discarded host message without a request id.", msg);
      return;
    }
    const wait = settle(record.id);
    if (!wait) {
      console.warn(
        `[prism] Received a host response for unknown request "${record.id}" — it may have already timed out.`,
      );
      return;
    }
    if (record.ok === true) {
      wait.resolve({ ok: true, data: record.data });
      return;
    }
    wait.resolve({
      ok: false,
      error:
        typeof record.error === "string"
          ? record.error
          : `Host request "${wait.method}" failed.`,
    });
  }

  async function invokeHttp<T>(
    full: { id: string; method: string } & Record<string, unknown>,
    timeoutMs: number,
  ): Promise<TransportResult<T>> {
    const method = full.method;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(httpFallbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(full),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new HostRequestError(
          `Host request "${method}" failed with HTTP ${res.status}.`,
          method,
          "transport",
        );
      }
      const json = (await res.json()) as Record<string, unknown>;
      if (json.ok === true) {
        return { ok: true, data: json.data as T };
      }
      return {
        ok: false,
        error:
          typeof json.error === "string"
            ? json.error
            : `Host request "${method}" failed.`,
      };
    } catch (error: unknown) {
      if (error instanceof HostRequestError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new HostRequestError(
          `The Prism host did not respond to "${method}" within ${Math.round(
            timeoutMs / 1000,
          )}s.`,
          method,
          "timeout",
        );
      }
      throw new HostRequestError(
        error instanceof Error
          ? error.message
          : `Host request "${method}" failed.`,
        method,
        "transport",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function invoke<T>(
    method: string,
    params: Record<string, unknown> = {},
    invokeOptions?: TransportInvokeOptions,
  ): Promise<TransportResult<T>> {
    const id = nextId();
    const full = { ...params, id, method };
    const timeoutMs =
      invokeOptions?.timeoutMs ??
      (invokeOptions?.onProgress
        ? PROGRESS_RPC_TIMEOUT_MS
        : DEFAULT_RPC_TIMEOUT_MS);

    if (useHttpFallback) {
      return invokeHttp<T>(full, timeoutMs);
    }

    return new Promise<TransportResult<T>>((resolve, reject) => {
      pending.set(id, {
        resolve: resolve as (value: TransportResult<unknown>) => void,
        reject,
        ...(invokeOptions?.onProgress
          ? { onProgress: invokeOptions.onProgress }
          : {}),
        timer: startDeadline(id, timeoutMs, method),
        timeoutMs,
        method,
      });
      options.postMessage!({
        type: "request",
        request: full,
      });
    });
  }

  return {
    targetLabel,
    command(method: string, detail?: string): string {
      return detail ? `host:${method} ${detail}` : `host:${method}`;
    },
    invoke,
    handleMessage,
    abort,
  };
}
