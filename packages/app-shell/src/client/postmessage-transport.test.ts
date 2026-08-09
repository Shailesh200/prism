import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPostMessageTransport,
  type PostMessageRequestEnvelope,
} from "./postmessage-transport.js";
import { HostRequestError } from "./transport.js";
import { createPrismClient } from "./prism-client.js";

const posted: PostMessageRequestEnvelope[] = [];

function lastRequestId(): string {
  const last = posted[posted.length - 1];
  if (!last || last.type !== "request") {
    throw new Error("no request was posted to the host");
  }
  return last.request.id;
}

function makeTransport() {
  posted.length = 0;
  return createPostMessageTransport({
    postMessage(message) {
      posted.push(message);
    },
    useHttpFallback: false,
  });
}

/** Minimal dashboard payload satisfying the audit summariser. */
function dashboardResponse(id: string) {
  return {
    id,
    ok: true as const,
    method: "dashboard",
    data: {
      root: "/tmp/repo",
      repoLabel: "repo",
      health: null,
      dna: null,
      map: { map: null, graph: { nodes: [], edges: [] } },
      gitActivity: null,
    },
  };
}

describe("PostMessageTransport RPC deadlines (M-051 / M-053 T-09)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when the host answers", async () => {
    const transport = makeTransport();
    const client = createPrismClient(transport);
    const inFlight = client.fetchDashboard();
    transport.handleMessage(dashboardResponse(lastRequestId()));

    await expect(inFlight).resolves.toBeDefined();
  });

  it("rejects a request whose response never arrives", async () => {
    vi.useFakeTimers();
    const transport = makeTransport();
    const client = createPrismClient(transport);
    const inFlight = client.fetchDashboard();
    const assertion = expect(inFlight).rejects.toThrow(/did not respond/i);

    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  it("names the method and the reason on timeout", async () => {
    vi.useFakeTimers();
    const transport = makeTransport();
    const client = createPrismClient(transport);
    const inFlight = client.fetchDashboard().catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(60_000);
    const error = await inFlight;

    expect(error).toBeInstanceOf(HostRequestError);
    if (!(error instanceof HostRequestError)) return;
    expect(error.reason).toBe("timeout");
    expect(error.method).toBe("dashboard");
  });

  it("does not reject a request that answers before the deadline", async () => {
    vi.useFakeTimers();
    const transport = makeTransport();
    const client = createPrismClient(transport);
    const inFlight = client.fetchDashboard();
    const id = lastRequestId();

    await vi.advanceTimersByTimeAsync(59_000);
    transport.handleMessage(dashboardResponse(id));

    await expect(inFlight).resolves.toBeDefined();
    await vi.advanceTimersByTimeAsync(60_000);
  });

  it("fails in-flight requests when the panel is disposed", async () => {
    const transport = makeTransport();
    const client = createPrismClient(transport);
    const inFlight = client.fetchDashboard().catch((error: unknown) => error);

    transport.abort();
    const error = await inFlight;

    expect(error).toBeInstanceOf(HostRequestError);
    if (!(error instanceof HostRequestError)) return;
    expect(error.reason).toBe("disposed");
  });

  it("ignores a response for an unknown id instead of throwing", async () => {
    const transport = makeTransport();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() =>
      transport.handleMessage({
        id: "req-does-not-exist",
        ok: true,
        method: "dashboard",
        data: null,
      }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("ignores a message with no request id", async () => {
    const transport = makeTransport();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => transport.handleMessage({ nonsense: true })).not.toThrow();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("survives a null message", async () => {
    const transport = makeTransport();
    expect(() => transport.handleMessage(null)).not.toThrow();
  });
});
