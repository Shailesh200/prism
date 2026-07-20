import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismErrorCode } from "@prism/shared";
import { createM005Fixture } from "./test-fixture.js";
import { resolveWorkspaceRoot } from "./workspace-root.js";

let fixtureRoot: string;

beforeAll(async () => {
  fixtureRoot = await createM005Fixture();
});

describe("resolveWorkspaceRoot", () => {
  it("resolves upward from a nested file to package.json root", async () => {
    const nested = join(fixtureRoot, "src", "a.ts");
    const result = await resolveWorkspaceRoot(nested);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(fixtureRoot);
  });

  it("rejects relative paths", async () => {
    const result = await resolveWorkspaceRoot("relative/path");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(PrismErrorCode.INVALID_PATH);
  });
});
