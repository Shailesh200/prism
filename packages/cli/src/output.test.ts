import { describe, expect, it } from "vitest";
import { PrismErrorCode, prismError } from "@prism/shared";
import { ExitCode, exitCodeForError } from "./exit.js";
import {
  paint,
  renderError,
  renderFields,
  renderJson,
  shouldUseColor,
  stripAnsi,
} from "./output.js";

describe("colour policy (M-028)", () => {
  it("colours an interactive terminal", () => {
    expect(shouldUseColor({ noColorFlag: false, env: {}, isTty: true })).toBe(
      true,
    );
  });

  it("never colours piped output", () => {
    // The whole reason `prism dna | jq` works without the user thinking.
    expect(shouldUseColor({ noColorFlag: false, env: {}, isTty: false })).toBe(
      false,
    );
  });

  it("honours --no-color", () => {
    expect(shouldUseColor({ noColorFlag: true, env: {}, isTty: true })).toBe(
      false,
    );
  });

  it("honours NO_COLOR even when set to an empty string", () => {
    // The convention is presence, not truthiness: NO_COLOR= means no colour.
    expect(
      shouldUseColor({
        noColorFlag: false,
        env: { NO_COLOR: "" },
        isTty: true,
      }),
    ).toBe(false);
    expect(
      shouldUseColor({
        noColorFlag: false,
        env: { NO_COLOR: "0" },
        isTty: true,
      }),
    ).toBe(false);
  });

  it("emits no escapes when disabled", () => {
    expect(paint("hello", "red", false)).toBe("hello");
    expect(paint("hello", "red", true)).not.toBe("hello");
    expect(stripAnsi(paint("hello", "red", true))).toBe("hello");
  });
});

describe("rendering (M-028)", () => {
  it("aligns fields", () => {
    const rendered = stripAnsi(
      renderFields(
        [
          ["Core", "0.1.0"],
          ["Workspace", "/repo"],
        ],
        false,
      ),
    );
    expect(rendered).toBe("Core       0.1.0\nWorkspace  /repo");
  });

  it("wraps success and failure in the same envelope shape", () => {
    expect(JSON.parse(renderJson({ ok: true, data: { a: 1 } }))).toEqual({
      ok: true,
      data: { a: 1 },
    });

    const error = prismError(PrismErrorCode.NOT_FOUND, "nope");
    expect(JSON.parse(renderJson({ ok: false, error }))).toEqual({
      ok: false,
      error: { code: "PRISM_NOT_FOUND", message: "nope" },
    });
  });

  it("leads an error with its code so it can be grepped", () => {
    expect(
      stripAnsi(
        renderError(prismError(PrismErrorCode.IO_ERROR, "disk"), false),
      ),
    ).toBe("PRISM_IO_ERROR: disk");
  });
});

describe("exit codes (M-028)", () => {
  it("maps fixable-by-the-user failures to usage", () => {
    for (const code of [
      PrismErrorCode.VALIDATION,
      PrismErrorCode.NOT_FOUND,
      PrismErrorCode.INVALID_PATH,
      PrismErrorCode.INVALID_ID,
      PrismErrorCode.UNSUPPORTED,
    ]) {
      expect(exitCodeForError(prismError(code, "x")), code).toBe(
        ExitCode.USAGE,
      );
    }
  });

  it("maps our own failures to internal", () => {
    for (const code of [
      PrismErrorCode.INDEX_FAILED,
      PrismErrorCode.IO_ERROR,
      PrismErrorCode.GRAPH_ERROR,
      PrismErrorCode.UNKNOWN,
      PrismErrorCode.ANALYZER_FAILED,
    ]) {
      expect(exitCodeForError(prismError(code, "x")), code).toBe(
        ExitCode.INTERNAL,
      );
    }
  });

  it("keeps 'found something' distinct from 'failed'", () => {
    // A CI pipeline must be able to tell these apart without parsing output.
    expect(ExitCode.OK).toBe(0);
    expect(ExitCode.FINDINGS).toBe(1);
    expect(ExitCode.USAGE).toBe(2);
    expect(ExitCode.INTERNAL).toBe(3);
  });
});
