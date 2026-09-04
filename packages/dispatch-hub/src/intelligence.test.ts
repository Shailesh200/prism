import { describe, expect, it, vi } from "vitest";
import type { HostRequest, PrismSession } from "@repo-prism/host-session";
import {
  createIntelligencePlane,
  type IntelligenceModule,
} from "./intelligence.js";

type FakeSession = PrismSession & { closed: boolean; openedWith: string[] };

function fakeSession(openOk = true): FakeSession {
  const session = {
    closed: false,
    openedWith: [] as string[],
    open: async (path: string) => {
      session.openedWith.push(path);
      return openOk
        ? { ok: true as const, value: undefined }
        : { ok: false as const, error: new Error("index failed") };
    },
    close: () => {
      session.closed = true;
    },
  };
  return session as unknown as FakeSession;
}

function moduleWith(sessions: FakeSession[]): {
  mod: IntelligenceModule;
  loads: number;
  dispatched: HostRequest[];
} {
  const state = { loads: 0, dispatched: [] as HostRequest[] };
  let index = 0;
  const mod: IntelligenceModule = {
    createSession: () => sessions[index++] ?? fakeSession(),
    dispatch: async (_session, request) => {
      state.dispatched.push(request);
      return { id: request.id, ok: true, value: null };
    },
  };
  return {
    mod,
    get loads() {
      return state.loads;
    },
    dispatched: state.dispatched,
  };
}

const req = (id: string): HostRequest =>
  ({ id, method: "dashboard" }) as HostRequest;

describe("IntelligencePlane", () => {
  it("does not load Core until something asks for intelligence", async () => {
    const load = vi.fn(async () => moduleWith([fakeSession()]).mod);
    const plane = createIntelligencePlane({ load });

    expect(plane.loaded()).toBe(false);
    expect(load).not.toHaveBeenCalled();

    await plane.handle("/repo", req("1"));

    expect(load).toHaveBeenCalledTimes(1);
    expect(plane.loaded()).toBe(true);
    plane.close();
  });

  it("reuses one session across requests for the same repository", async () => {
    const session = fakeSession();
    const plane = createIntelligencePlane({
      load: async () => moduleWith([session]).mod,
    });

    await plane.handle("/repo", req("1"));
    await plane.handle("/repo", req("2"));

    expect(session.openedWith).toEqual(["/repo"]);
    plane.close();
  });

  it("closes the first repository when a second one is asked for", async () => {
    const first = fakeSession();
    const second = fakeSession();
    const plane = createIntelligencePlane({
      load: async () => moduleWith([first, second]).mod,
    });

    await plane.handle("/a", req("1"));
    await plane.handle("/b", req("2"));

    expect(first.closed).toBe(true);
    expect(plane.openWorkspace()).toBe("/b");
    plane.close();
  });

  it("shares one index build between concurrent first requests", async () => {
    const session = fakeSession();
    const plane = createIntelligencePlane({
      load: async () => moduleWith([session]).mod,
    });

    await Promise.all([
      plane.handle("/repo", req("1")),
      plane.handle("/repo", req("2")),
      plane.handle("/repo", req("3")),
    ]);

    expect(session.openedWith).toEqual(["/repo"]);
    plane.close();
  });

  it("reports an open failure as a failed response, not a throw", async () => {
    const plane = createIntelligencePlane({
      load: async () => moduleWith([fakeSession(false)]).mod,
    });

    const answer = await plane.handle("/repo", req("1"));

    expect(answer).toMatchObject({ id: "1", ok: false });
    expect(plane.openWorkspace()).toBeUndefined();
    plane.close();
  });

  it("evicts an idle session so an always-on daemon does not hold a repo forever", async () => {
    vi.useFakeTimers();
    try {
      const session = fakeSession();
      let clock = 0;
      const plane = createIntelligencePlane({
        load: async () => moduleWith([session]).mod,
        idleMs: 1_000,
        now: () => clock,
      });

      await plane.handle("/repo", req("1"));
      expect(plane.openWorkspace()).toBe("/repo");

      clock = 5_000;
      await vi.advanceTimersByTimeAsync(1_000);

      expect(session.closed).toBe(true);
      expect(plane.openWorkspace()).toBeUndefined();
      plane.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
