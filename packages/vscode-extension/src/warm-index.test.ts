import { PrismErrorCode } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import { warmIndexOtherFolders, type WarmIndexSession } from "./warm-index.js";

type FakeSession = WarmIndexSession & {
  readonly root: string | undefined;
  closed: boolean;
};

function makeDeps(opts?: {
  failRoots?: readonly string[];
  throwRoots?: readonly string[];
}) {
  const opened: string[] = [];
  const sessions: FakeSession[] = [];
  const warnings: string[] = [];
  const deps = {
    createSession: (): WarmIndexSession => {
      let root: string | undefined;
      const session: FakeSession = {
        get root() {
          return root;
        },
        closed: false,
        open: async (target: string) => {
          root = target;
          if (opts?.throwRoots?.includes(target)) {
            throw new Error("disk exploded");
          }
          if (opts?.failRoots?.includes(target)) {
            return {
              ok: false as const,
              error: {
                code: PrismErrorCode.IO_ERROR,
                message: "denied",
              },
            };
          }
          opened.push(target);
          return { ok: true as const, value: undefined };
        },
        close: () => {
          session.closed = true;
        },
      };
      sessions.push(session);
      return session;
    },
    log: {
      info: () => undefined,
      warn: (msg: string) => {
        warnings.push(msg);
      },
    },
  };
  return { deps, opened, sessions, warnings };
}

describe("warmIndexOtherFolders (M-057 P-B7)", () => {
  it("indexes every folder in order and closes each session", async () => {
    const { deps, opened, sessions } = makeDeps();
    await warmIndexOtherFolders(["/a", "/b", "/c"], deps);
    expect(opened).toEqual(["/a", "/b", "/c"]);
    expect(sessions).toHaveLength(3);
    expect(sessions.every((s) => s.closed)).toBe(true);
  });

  it("skips a folder whose open fails and continues with the rest", async () => {
    const { deps, opened, sessions, warnings } = makeDeps({
      failRoots: ["/bad"],
    });
    await warmIndexOtherFolders(["/bad", "/good"], deps);
    expect(opened).toEqual(["/good"]);
    expect(warnings.some((w) => w.includes("/bad"))).toBe(true);
    expect(sessions.every((s) => s.closed)).toBe(true);
  });

  it("survives a throwing open and still closes that session", async () => {
    const { deps, opened, sessions, warnings } = makeDeps({
      throwRoots: ["/boom"],
    });
    await warmIndexOtherFolders(["/boom", "/after"], deps);
    expect(opened).toEqual(["/after"]);
    expect(warnings.some((w) => w.includes("disk exploded"))).toBe(true);
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.closed)).toBe(true);
  });

  it("is a no-op for a single-root workspace", async () => {
    const { deps, sessions } = makeDeps();
    await warmIndexOtherFolders([], deps);
    expect(sessions).toHaveLength(0);
  });
});
