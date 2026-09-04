import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listJobNotes, readJobNote, resolveJobNotePath } from "./notes.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("resolveJobNotePath", () => {
  it("accepts a notes markdown path and rejects traversal", () => {
    const root = "/repo";
    expect(resolveJobNotePath(root, ".prism/dispatch/notes/audit.md")).toBe(
      join(root, ".prism/dispatch/notes/audit.md"),
    );
    expect(
      resolveJobNotePath(root, ".prism/dispatch/notes/../jobs.json"),
    ).toBeUndefined();
    expect(resolveJobNotePath(root, "src/secret.md")).toBeUndefined();
  });
});

describe("listJobNotes / readJobNote", () => {
  it("finds a write-up from the summary and reads it", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-notes-"));
    temps.push(root);
    await mkdir(join(root, ".prism/dispatch/notes"), { recursive: true });
    await writeFile(
      join(root, ".prism/dispatch/notes/audit-gsap-components.md"),
      "# GSAP\n\nUsed in two places.\n",
    );
    const listed = await listJobNotes({
      workspace: root,
      jobId: "audit-gsap",
      summary:
        "I wrote the findings to `.prism/dispatch/notes/audit-gsap-components.md`.",
    });
    expect(listed.map((row) => row.path)).toEqual([
      ".prism/dispatch/notes/audit-gsap-components.md",
    ]);
    const file = await readJobNote({
      workspace: root,
      rel: ".prism/dispatch/notes/audit-gsap-components.md",
    });
    expect(file?.text).toMatch(/Used in two places/);
    expect(file?.truncated).toBe(false);
  });

  it("does not read a path outside the notes directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-notes-"));
    temps.push(root);
    await mkdir(join(root, ".prism/dispatch"), { recursive: true });
    await writeFile(join(root, ".prism/dispatch/jobs.json"), "{}\n");
    expect(
      await readJobNote({
        workspace: root,
        rel: ".prism/dispatch/notes/../../jobs.json",
      }),
    ).toBeUndefined();
  });
});
