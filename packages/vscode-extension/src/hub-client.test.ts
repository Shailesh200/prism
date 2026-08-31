import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runningCount, sameWorkspace } from "./hub-client.js";

describe("hub-client (ADR-0043)", () => {
  it("does not import Dispatch", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "hub-client.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/@repo-prism\/dispatch/);
  });

  it("counts in-flight jobs", () => {
    expect(
      runningCount([
        { status: "running" },
        { status: "done" },
        { status: "paused" },
      ]),
    ).toBe(1);
  });

  it("compares workspace roots without trailing slashes", () => {
    expect(sameWorkspace("/Repos/Prism/", "/repos/prism")).toBe(true);
  });
});
