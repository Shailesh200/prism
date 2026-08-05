import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFixture, type Fixture } from "./fixture.js";
import {
  emptyRepository,
  repositoryWithoutGit,
  typicalRepository,
} from "./repositories.js";

// A fixture builder that silently produces the wrong shape makes every test
// built on it lie, so it gets tests of its own.
describe("createFixture", () => {
  const open: Fixture[] = [];

  afterEach(async () => {
    await Promise.all(open.splice(0).map((f) => f.cleanup()));
  });

  async function track(fixture: Fixture): Promise<Fixture> {
    open.push(fixture);
    return fixture;
  }

  it("creates a real git repository", async () => {
    const fixture = await track(await createFixture({ name: "unit" }));
    await fixture.write("a.txt", "hello");
    const sha = fixture.commit("first");

    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.git("rev-parse", "--is-inside-work-tree")).toBe("true");
    expect(fixture.git("log", "--oneline")).toContain("first");
  });

  it("creates nested directories on write", async () => {
    const fixture = await track(await createFixture({ name: "unit" }));
    await fixture.write("deep/er/still/file.ts", "export const x = 1;\n");

    expect(
      await readFile(join(fixture.root, "deep/er/still/file.ts"), "utf8"),
    ).toBe("export const x = 1;\n");
  });

  it("attributes commits to the author it was given", async () => {
    const fixture = await track(await createFixture({ name: "unit" }));
    await fixture.write("a.txt", "one");
    fixture.commit("by ada", {
      author: "Ada Lovelace",
      email: "ada@example.invalid",
      date: "2026-03-04T10:00:00+00:00",
    });

    expect(fixture.git("log", "-1", "--format=%an <%ae>")).toBe(
      "Ada Lovelace <ada@example.invalid>",
    );
    expect(fixture.git("log", "-1", "--format=%aI")).toContain("2026-03-04");
  });

  it("skips git entirely when asked", async () => {
    const fixture = await track(
      await createFixture({ name: "unit", git: false }),
    );
    expect(existsSync(join(fixture.root, ".git"))).toBe(false);
  });

  it("does not depend on the machine's git identity", async () => {
    const fixture = await track(await createFixture({ name: "unit" }));
    // Local config must win over whatever the developer or CI runner has set.
    const configured = execFileSync("git", ["config", "user.email"], {
      cwd: fixture.root,
      encoding: "utf8",
    }).trim();
    expect(configured).toBe("fixture@example.invalid");
  });

  it("cleans up, and tolerates being cleaned up twice", async () => {
    const fixture = await createFixture({ name: "unit" });
    await fixture.write("a.txt", "x");
    const { root } = fixture;

    await fixture.cleanup();
    await fixture.cleanup();

    expect(existsSync(root)).toBe(false);
  });
});

describe("named repository shapes", () => {
  const open: Fixture[] = [];

  afterEach(async () => {
    await Promise.all(open.splice(0).map((f) => f.cleanup()));
  });

  it("typicalRepository has the shape its callers rely on", async () => {
    const fixture = await typicalRepository();
    open.push(fixture);

    // These are load-bearing: tests assert on cycles, on an orphan, and on more
    // than one author. If the shape drifts, those tests pass for a wrong reason.
    expect(existsSync(join(fixture.root, "src/cycle/left.ts"))).toBe(true);
    expect(existsSync(join(fixture.root, "src/lib/orphan.ts"))).toBe(true);
    expect(existsSync(join(fixture.root, "src/features/cart.test.ts"))).toBe(
      true,
    );

    const authors = fixture.git("log", "--format=%ae");
    expect(new Set(authors.split("\n")).size).toBe(2);
    expect(fixture.git("rev-list", "--count", "HEAD")).toBe("2");
  });

  it("repositoryWithoutGit really has no git", async () => {
    const fixture = await repositoryWithoutGit();
    open.push(fixture);

    expect(existsSync(join(fixture.root, ".git"))).toBe(false);
    expect(existsSync(join(fixture.root, "src/index.ts"))).toBe(true);
  });

  it("emptyRepository has history but nothing to analyse", async () => {
    const fixture = await emptyRepository();
    open.push(fixture);

    expect(existsSync(join(fixture.root, "package.json"))).toBe(false);
    expect(fixture.git("rev-list", "--count", "HEAD")).toBe("1");
  });
});
