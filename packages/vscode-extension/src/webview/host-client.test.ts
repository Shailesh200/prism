import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostToWebview, WebviewToHost } from "@repo-prism/host-session";

type HostClientModule = typeof import("./host-client.js");

const posted: WebviewToHost[] = [];

/**
 * `host-client` resolves its transport once at import time, so the VS Code API
 * shim has to exist before the module is loaded and the registry has to be
 * reset between tests.
 */
async function loadHostClient(): Promise<HostClientModule> {
  posted.length = 0;
  (
    globalThis as unknown as { acquireVsCodeApi: () => unknown }
  ).acquireVsCodeApi = () => ({
    postMessage(message: WebviewToHost) {
      posted.push(message);
    },
  });
  vi.resetModules();
  return import("./host-client.js");
}

function lastRequestId(): string {
  const last = posted[posted.length - 1];
  if (!last || last.type !== "request") {
    throw new Error("no request was posted to the host");
  }
  return last.request.id;
}

/** Minimal dashboard payload satisfying the audit summariser. */
const dashboardResponse = (id: string): HostToWebview =>
  ({
    id,
    ok: true,
    method: "dashboard",
    data: {
      root: "/tmp/repo",
      health: null,
      map: { map: null, graph: { nodes: [], edges: [] } },
      gitActivity: null,
    },
  }) as unknown as HostToWebview;

describe("host RPC deadlines (M-051 Phase 1)", () => {
  let client: HostClientModule;

  beforeEach(async () => {
    // Loaded before the clock is mocked: module evaluation does real async
    // work, and doing it under fake timers made these tests flaky.
    client = await loadHostClient();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { acquireVsCodeApi?: unknown })
      .acquireVsCodeApi;
  });

  it("resolves when the host answers", async () => {
    const inFlight = client.fetchDashboard();
    client.handleHostMessage(dashboardResponse(lastRequestId()));

    await expect(inFlight).resolves.toBeDefined();
  });

  // Before this change `reject` was stored in the pending map and never called,
  // so a host that never answered left the panel spinning indefinitely.
  it("rejects a request whose response never arrives", async () => {
    vi.useFakeTimers();
    const inFlight = client.fetchDashboard();
    const assertion = expect(inFlight).rejects.toThrow(/did not respond/i);

    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  it("names the method and the reason on timeout", async () => {
    vi.useFakeTimers();
    const inFlight = client.fetchDashboard().catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(60_000);
    const error = await inFlight;

    expect(error).toBeInstanceOf(client.HostRequestError);
    if (!(error instanceof client.HostRequestError)) return;
    expect(error.reason).toBe("timeout");
    expect(error.method).toBe("dashboard");
  });

  it("does not reject a request that answers before the deadline", async () => {
    vi.useFakeTimers();
    const inFlight = client.fetchDashboard();
    const id = lastRequestId();

    await vi.advanceTimersByTimeAsync(59_000);
    client.handleHostMessage(dashboardResponse(id));

    await expect(inFlight).resolves.toBeDefined();
    await vi.advanceTimersByTimeAsync(60_000);
  });

  it("fails in-flight requests when the panel is disposed", async () => {
    const inFlight = client.fetchDashboard().catch((error: unknown) => error);

    client.abortPendingHostRequests();
    const error = await inFlight;

    expect(error).toBeInstanceOf(client.HostRequestError);
    if (!(error instanceof client.HostRequestError)) return;
    expect(error.reason).toBe("disposed");
  });

  it("ignores a response for an unknown id instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() =>
      client.handleHostMessage({
        id: "req-does-not-exist",
        ok: true,
        method: "dashboard",
        data: null,
      } as unknown as HostToWebview),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("ignores a message with no request id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() =>
      client.handleHostMessage({ nonsense: true } as unknown as HostToWebview),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("survives a null message", async () => {
    expect(() =>
      client.handleHostMessage(null as unknown as HostToWebview),
    ).not.toThrow();
  });
});
