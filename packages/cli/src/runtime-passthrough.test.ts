/**
 * PR 10, Arc review: a thrown PrismError passes through only when its code is
 * one Prism defines; any other code-and-message object becomes
 * PRISM_UNKNOWN, so a library's raw code never shows as ours. PRISM_IO_ERROR
 * is kept for real file-system failures Prism reports itself.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismErrorCode } from "@repo-prism/shared";
import { afterEach, describe, expect, it } from "vitest";
import { ExitCode, exitCodeForError } from "./exit.js";
import { runCommand, type CommandHandler } from "./runtime.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

async function thrown(value: unknown) {
  const cwd = mkdtempSync(join(tmpdir(), "prism-pr10-rt-"));
  dirs.push(cwd);
  let err = "";
  let out = "";
  const handler: CommandHandler = async () => {
    throw value;
  };
  const code = await runCommand(
    handler,
    {
      json: true,
      color: false,
      quiet: false,
      verbose: false,
      yes: false,
    },
    {
      cwd,
      env: { HOME: cwd, PRISM_HOME: join(cwd, ".prism") },
      isTty: false,
      writer: { out: (t) => (out += t), err: (t) => (err += t) },
    },
  );
  const text = `${out}${err}`;
  return { code, text };
}

describe("PrismError passthrough (Arc review)", () => {
  it("a known PrismErrorCode (a real file-system failure) passes through as PRISM_IO_ERROR, details included", async () => {
    const { text, code } = await thrown({
      code: PrismErrorCode.IO_ERROR,
      message: "Prism couldn't write x (the file is in use).",
      details: { restored: ["x"] },
    });
    expect(text).toContain('"PRISM_IO_ERROR"');
    expect(text).toContain("Prism couldn't write x (the file is in use).");
    expect(text).toContain('"restored"');
    expect(code).toBe(
      exitCodeForError({ code: PrismErrorCode.IO_ERROR, message: "" }),
    );
  });

  it("a known non-IO code keeps its own code and its exit code (VALIDATION: 2)", async () => {
    const { text, code } = await thrown({
      code: PrismErrorCode.VALIDATION,
      message: "Pick one.",
    });
    expect(text).toContain('"PRISM_VALIDATION"');
    expect(code).toBe(2);
    expect(code).toBe(ExitCode.USAGE);
  });

  it("an unknown code becomes PRISM_UNKNOWN, and the raw code is not shown as the code", async () => {
    const { text, code } = await thrown({
      code: "ERR_SOME_LIBRARY",
      message: "library said no",
      details: { secret: "x" },
    });
    expect(text).toContain('"PRISM_UNKNOWN"');
    expect(text).not.toContain("PRISM_IO_ERROR");
    expect(code).toBe(ExitCode.INTERNAL);
    expect(text).toContain("library said no");
    expect(text).not.toContain("ERR_SOME_LIBRARY");
    expect(text).not.toContain("secret");
  });

  it("a thrown Error is still PRISM_UNKNOWN", async () => {
    const { text, code } = await thrown(new Error("boom"));
    expect(text).toContain('"PRISM_UNKNOWN"');
    expect(code).toBe(ExitCode.INTERNAL);
  });
});
