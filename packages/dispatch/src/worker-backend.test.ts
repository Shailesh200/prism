import { describe, expect, it } from "vitest";
import { resolveWorkerBackend, workerBackendLabel } from "./worker-backend.js";

describe("resolveWorkerBackend", () => {
  it("defaults to cursor when nothing says otherwise", () => {
    expect(resolveWorkerBackend({})).toBe("cursor");
    expect(resolveWorkerBackend({ env: {}, clientName: "cursor" })).toBe(
      "cursor",
    );
  });

  it("matches a Claude Code host from clientInfo", () => {
    expect(resolveWorkerBackend({ clientName: "claude-code" })).toBe("claude");
    expect(resolveWorkerBackend({ clientName: "Claude Desktop" })).toBe(
      "claude",
    );
  });

  it("lets PRISM_WORKER override the host", () => {
    expect(
      resolveWorkerBackend({
        env: { PRISM_WORKER: "claude" },
        clientName: "cursor",
      }),
    ).toBe("claude");
    expect(
      resolveWorkerBackend({
        env: { PRISM_WORKER: " cursor " },
        clientName: "claude-code",
      }),
    ).toBe("cursor");
  });

  it("lets configure beat PRISM_WORKER and the host", () => {
    expect(
      resolveWorkerBackend({
        config: { workerBackend: "cursor" },
        env: { PRISM_WORKER: "claude" },
        clientName: "claude-code",
      }),
    ).toBe("cursor");
    expect(
      resolveWorkerBackend({
        config: { workerBackend: "claude" },
        clientName: "cursor",
      }),
    ).toBe("claude");
    // "auto" falls through to env/host.
    expect(
      resolveWorkerBackend({
        config: { workerBackend: "auto" },
        clientName: "claude-code",
      }),
    ).toBe("claude");
  });

  it("ignores junk env values", () => {
    expect(resolveWorkerBackend({ env: { PRISM_WORKER: "gemini" } })).toBe(
      "cursor",
    );
  });
});

describe("workerBackendLabel", () => {
  it("names the backend for doctor output", () => {
    expect(workerBackendLabel("cursor")).toBe("Cursor");
    expect(workerBackendLabel("claude")).toBe("Claude Code");
  });
});
