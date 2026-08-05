import { typicalRepository, type Fixture } from "@repo-prism/test-support";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  dispatchHostRequest,
  type HostDispatchState,
} from "./host-dispatch.js";
import { parseWebviewToHost } from "./protocol-guards.js";
import type { HostRequest, HostResponse } from "./protocol.js";
import { PrismSession } from "./session.js";

/**
 * The extension host surface, driven by protocol messages against a real
 * repository (M-037 Phase 3.3).
 *
 * No VS Code instance is involved, and none is needed: everything worth testing
 * between the webview and Core happens in `dispatchHostRequest`. An Electron
 * harness would take minutes per run to cover the same ground, and the part it
 * would additionally cover — that VS Code can load the bundle — is what
 * packaging verification is for.
 */

let fixture: Fixture;
let session: PrismSession;
const state: HostDispatchState = { zoom: "package", layers: [] };

beforeAll(async () => {
  fixture = await typicalRepository();
  session = new PrismSession();
  const opened = await session.open(fixture.root);
  if (!opened.ok) throw new Error(`session.open: ${opened.error.message}`);
}, 120_000);

afterAll(async () => {
  session?.close?.();
  await fixture?.cleanup();
});

let nextId = 0;
async function send(
  request: Omit<HostRequest, "id"> & { id?: string },
): Promise<HostResponse> {
  const id = request.id ?? `req-${++nextId}`;
  return dispatchHostRequest(session, { ...request, id } as HostRequest, state);
}

function expectOk(response: HostResponse): Extract<HostResponse, { ok: true }> {
  expect(
    response.ok,
    `host request failed: ${"error" in response ? response.error : ""}`,
  ).toBe(true);
  return response as Extract<HostResponse, { ok: true }>;
}

describe("host requests reach Core and come back shaped", () => {
  it("answers a dashboard request with a real index behind it", async () => {
    const response = expectOk(await send({ method: "dashboard" }));

    expect(response.method).toBe("dashboard");
    // The fixture has eleven files; a dashboard that reports none has not
    // actually indexed anything.
    expect(JSON.stringify(response)).toContain("src/features/cart.ts");
  });

  it("answers engineering health from the same index Core used", async () => {
    const response = expectOk(await send({ method: "engineeringHealth" }));
    const direct = await session.getEngineeringHealth();

    expect(direct.ok).toBe(true);
    if (!direct.ok || direct.value === null) {
      throw new Error("engineering health unavailable for the fixture");
    }

    const data = (response as { data: { metrics: { id: string }[] } | null })
      .data;
    // The host must forward Core's answer, not re-derive or filter it.
    expect(data?.metrics.map((m) => m.id)).toEqual(
      direct.value.metrics.map((m) => m.id),
    );
    expect(data?.metrics.length).toBeGreaterThan(0);
  });

  it("reports a missing file as a refusal the webview can render", async () => {
    // Two failure channels exist on purpose. Transport failure means the host
    // could not answer at all; an in-band `{ ok: false }` means it answered and
    // the answer is "no". A screen that only checked the envelope would render
    // this one as success with empty data.
    const response = expectOk(
      await send({
        method: "impact",
        target: { kind: "file", id: "src/does/not/exist.ts" },
      } as Omit<HostRequest, "id">),
    );

    const data = (response as { data: { ok: boolean; error?: string } }).data;
    expect(data.ok).toBe(false);
    expect((data.error ?? "").length).toBeGreaterThan(0);
  });

  it("fails at the transport level when there is no workspace open", async () => {
    const closed = new PrismSession();
    const response = await dispatchHostRequest(
      closed,
      { id: "no-ws", method: "graph" },
      state,
    );

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.length).toBeGreaterThan(0);
  });

  it("keeps the response id the request asked with", async () => {
    // The webview correlates by id; returning the wrong one resolves the wrong
    // promise and renders one screen's data on another.
    const response = await send({ method: "graph", id: "correlate-me" });
    expect(response.id).toBe("correlate-me");
  });

  it("rejects an unknown method rather than throwing", async () => {
    const response = await send({
      method: "definitely-not-a-method",
    } as unknown as Omit<HostRequest, "id">);

    expect(response.ok).toBe(false);
  });
});

describe("consent is enforced at the host boundary", () => {
  it("refuses a network-bearing request when consent was never granted", async () => {
    // The transport succeeds and the *operation* refuses, so the webview can
    // render a specific "this needs permission" state rather than a generic
    // failure. Assert on the inner result, not the envelope.
    const response = expectOk(await send({ method: "gitFetch" }));
    const data = (response as { data: { ok: boolean; error?: string } }).data;

    expect(data.ok).toBe(false);
    expect(data.error?.toLowerCase()).toContain("consent");
  });

  it("lists consent purposes as ungranted rather than omitting them", async () => {
    const response = expectOk(await send({ method: "listConsent" }));
    const purposes = (response as { data: { granted: boolean }[] }).data;

    expect(purposes.length).toBeGreaterThan(0);
    expect(purposes.every((p) => p.granted === false)).toBe(true);
  });

  it("records a grant that Core can then see", async () => {
    expectOk(
      await send({
        method: "setConsent",
        purpose: "network.git-remote",
        granted: true,
      } as Omit<HostRequest, "id">),
    );

    const stored = await session.getConsent("network.git-remote");
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.value?.granted).toBe(true);
  });
});

describe("the guard that stands between the webview and dispatch", () => {
  it("accepts a well-formed request", () => {
    expect(
      parseWebviewToHost({
        type: "request",
        request: { id: "1", method: "dashboard" },
      }).ok,
    ).toBe(true);
  });

  it("rejects a request with no method, and says why", () => {
    const parsed = parseWebviewToHost({
      type: "request",
      request: { id: "1" },
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    // The reason is logged, so it has to name the problem rather than say
    // "invalid message" and leave someone reading the source to work it out.
    expect(parsed.reason).toMatch(/method/i);
  });

  it("rejects anything that is not a message of a known type", () => {
    // A webview is a browser context; anything that can post to it can post
    // these. Dispatch must never see a shape it did not expect.
    for (const bad of [{ hello: "world" }, null, "request", 42, []]) {
      expect(parseWebviewToHost(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("rejects a known type carrying the wrong payload", () => {
    expect(parseWebviewToHost({ type: "openFile" }).ok).toBe(false);
    expect(parseWebviewToHost({ type: "openFile", path: "" }).ok).toBe(false);
    expect(parseWebviewToHost({ type: "zoom", zoom: 3 }).ok).toBe(false);
  });
});
