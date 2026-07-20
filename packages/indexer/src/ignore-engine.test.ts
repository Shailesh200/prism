import { beforeAll, describe, expect, it } from "vitest";
import { createIgnoreEngine } from "./ignore-engine.js";
import { createM005Fixture } from "./test-fixture.js";

let fixtureRoot: string;

beforeAll(async () => {
  fixtureRoot = await createM005Fixture();
});

describe("createIgnoreEngine", () => {
  it("applies builtins, gitignore, and prismignore", async () => {
    const engine = await createIgnoreEngine(fixtureRoot);

    expect(engine.ignores("node_modules/pkg/index.js")).toBe(true);
    expect(engine.ignores("secret.txt")).toBe(true);
    expect(engine.ignores("build/out.js")).toBe(true);
    expect(engine.ignores("nested/x.tmp")).toBe(true);
    expect(engine.ignores("src/a.ts")).toBe(false);
    expect(engine.ignores("nested/keep.md")).toBe(false);
  });
});
