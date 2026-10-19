import { describe, expect, it } from "vitest";
import { pulseEnabled, pulseName, reportUsage, usagePayload } from "./pulse.js";

describe("usage payload", () => {
  it("sends the tool name and the result, and nothing from the repo", () => {
    const body = usagePayload({
      surface: "mcp",
      name: "prepare_change",
      result: "ok",
      ms: 42,
    });
    expect(body).toEqual({
      name: "tool",
      url: "/mcp/prepare_change",
      data: { result: "ok", tool: "prepare_change", ms: 42 },
    });
    expect(JSON.stringify(body)).not.toContain("/Users");
  });

  it("names an install, and keeps a known client", () => {
    expect(
      usagePayload({
        surface: "cli",
        name: "install",
        result: "ok",
        client: "cursor",
      }),
    ).toMatchObject({
      name: "install",
      url: "/cli/install",
      data: { command: "install", client: "cursor", result: "ok" },
    });
  });

  it("drops a path, a prompt, and an error message", () => {
    expect(pulseName("/Users/me/repo")).toBeUndefined();
    expect(pulseName("please edit src/app.ts")).toBeUndefined();
    const body = usagePayload({
      surface: "cli",
      name: "/tmp/secret",
      result: "failed",
      code: "could not read /tmp/secret",
    });
    expect(body.data).toEqual({ result: "failed" });
    expect(body.url).toBe("/cli/unknown");
  });

  it("keeps a PRISM code and caps duration", () => {
    expect(
      usagePayload({
        surface: "mcp",
        name: "graph",
        result: "failed",
        code: "PRISM_VALIDATION",
        ms: 999_999,
      }).data,
    ).toEqual({
      result: "failed",
      tool: "graph",
      code: "PRISM_VALIDATION",
      ms: 120_000,
    });
  });
});

describe("reportUsage", () => {
  it("does not send during tests, CI, or when turned off", () => {
    expect(pulseEnabled({ VITEST: "true" })).toBe(false);
    expect(pulseEnabled({ CI: "true" })).toBe(false);
    expect(pulseEnabled({ PRISM_PULSE: "0" })).toBe(false);
    expect(pulseEnabled({})).toBe(true);
  });

  it("posts one event and ignores a network failure", async () => {
    const calls: unknown[] = [];
    reportUsage(
      { surface: "cli", name: "doctor", result: "findings" },
      {},
      async (url, init) => {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        throw new Error("offline");
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(1);
    const sent = calls[0] as {
      url: string;
      body: { type: string; payload: { name: string } };
    };
    expect(sent.url).toBe("https://pulse.shaileshjha.in/api/send");
    expect(sent.body.type).toBe("event");
    expect(sent.body.payload.name).toBe("cli");
  });

  it("sends nothing when the ping is off", async () => {
    let calls = 0;
    reportUsage(
      { surface: "cli", name: "install", result: "ok" },
      { PRISM_PULSE: "0" },
      async () => {
        calls += 1;
        return new Response();
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(0);
  });
});
