import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PLAYGROUND_PORT,
  findPlaygroundApp,
  playgroundBindUrl,
  playgroundPort,
  playgroundUrl,
  playgroundViteEnabled,
} from "./playground.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("playground helpers", () => {
  it("defaults to Vite's 5173", () => {
    expect(PLAYGROUND_PORT).toBe(5173);
    expect(playgroundPort({})).toBe(5173);
    expect(playgroundPort({ PRISM_PLAYGROUND_PORT: "0" })).toBe(0);
    expect(playgroundUrl(5173)).toBe("http://prismhq.localhost:5173/");
    expect(playgroundBindUrl(5173)).toBe("http://127.0.0.1:5173/");
  });

  it("does not spawn Vite under vitest unless opted in", () => {
    expect(playgroundViteEnabled({ VITEST: "true" })).toBe(false);
    expect(playgroundViteEnabled({})).toBe(false);
    expect(
      playgroundViteEnabled({ VITEST: "true", PRISM_PLAYGROUND: "1" }),
    ).toBe(true);
  });

  it("finds apps/playground when this repo has one", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-pg-"));
    temps.push(root);
    expect(await findPlaygroundApp(root)).toBeUndefined();
    await mkdir(join(root, "apps", "playground"), { recursive: true });
    await writeFile(
      join(root, "apps", "playground", "package.json"),
      `${JSON.stringify({ name: "@repo-prism/playground" })}\n`,
    );
    expect(await findPlaygroundApp(root)).toBe(
      join(root, "apps", "playground"),
    );
  });
});
