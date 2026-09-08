import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentStoreDir, dispatchDir, runsDir } from "./paths.js";

describe("Dispatch paths", () => {
  it("keeps job records and console logs per-repo", () => {
    const root = "/Users/me/app";
    expect(dispatchDir(root)).toBe(join(root, ".prism", "dispatch"));
    expect(runsDir(root)).toBe(join(root, ".prism", "dispatch", "runs"));
  });

  it("puts the Cursor agent catalog in ~/.prism, not the repo", () => {
    const root = "/Users/me/app";
    expect(agentStoreDir({})).toBe(
      join(homedir(), ".prism", "dispatch", "agent-store"),
    );
    expect(agentStoreDir({})).not.toBe(
      join(root, ".prism", "dispatch", "agent-store"),
    );
  });

  it("honours PRISM_HOME so tests do not write into the real home dir", () => {
    const env = { PRISM_HOME: "/tmp/prism-home" };
    expect(agentStoreDir(env)).toBe(
      join("/tmp/prism-home", "dispatch", "agent-store"),
    );
  });
});
