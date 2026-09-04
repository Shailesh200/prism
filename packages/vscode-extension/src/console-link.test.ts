import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchConsoleStatus, findConsole } from "./console-link.js";

async function hubHome(record: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "prism-console-link-"));
  const hub = join(root, "hub");
  await mkdir(hub, { recursive: true });
  await writeFile(join(hub, "hub.json"), JSON.stringify(record));
  return hub;
}

describe("findConsole", () => {
  it("returns nothing when no hub record exists", async () => {
    const link = await findConsole({
      env: { PRISM_HUB_HOME: join(tmpdir(), "prism-absent-hub") },
    });
    expect(link).toBeUndefined();
  });

  it("returns a tokenised URL when the Console answers", async () => {
    const home = await hubHome({ port: 17330, token: "t0ken" });
    const link = await findConsole({
      env: { PRISM_HUB_HOME: home },
      fetchImpl: (async () => new Response("{}", { status: 200 })) as never,
    });
    expect(link?.port).toBe(17330);
    expect(link?.url).toContain("prismhq.localhost:17330");
    expect(link?.url).toContain("token=t0ken");
  });

  it("speaks the branded public name only when opted in", async () => {
    const home = await hubHome({ port: 17330, token: "t0ken" });
    const link = await findConsole({
      env: { PRISM_HUB_HOME: home, PRISM_CONSOLE_ALIAS: "1" },
      fetchImpl: (async () => new Response("{}", { status: 200 })) as never,
    });
    expect(link?.url).toContain("local.prismhq.in:17330");
  });
});

describe("fetchConsoleStatus", () => {
  it("reports no Console rather than throwing when nothing is running", async () => {
    const status = await fetchConsoleStatus({
      env: { PRISM_HUB_HOME: join(tmpdir(), "prism-absent-hub") },
    });
    expect(status.console).toBeNull();
    expect(status.connectors).toEqual([]);
  });

  it("carries the version and the host connectors", async () => {
    const home = await hubHome({ port: 17330, token: "t0ken" });
    const status = await fetchConsoleStatus({
      env: { PRISM_HUB_HOME: home },
      fetchImpl: (async (input: string) => {
        if (input.includes("/api/connectors")) {
          return Response.json({
            connectors: [
              {
                id: "slack",
                label: "Slack",
                hosts: ["cursor"],
                skills: [],
                source: "x",
              },
            ],
            unreadable: [],
          });
        }
        return Response.json({ ok: true, version: "1.2.0", workspaces: 2 });
      }) as never,
    });

    expect(status.console?.port).toBe(17330);
    expect(status.version).toBe("1.2.0");
    expect(status.workspaces).toBe(2);
    expect(status.connectors.map((c) => c.id)).toEqual(["slack"]);
  });

  it("still reports the Console when the connector walk fails", async () => {
    // A discovery walk that trips on one unreadable manifest must not also
    // blank the version — the card would then say "not running" about a
    // Console that is answering.
    const home = await hubHome({ port: 17330, token: "t0ken" });
    const status = await fetchConsoleStatus({
      env: { PRISM_HUB_HOME: home },
      fetchImpl: (async (input: string) => {
        if (input.includes("/api/connectors")) throw new Error("boom");
        return Response.json({ ok: true, version: "1.2.0" });
      }) as never,
    });

    expect(status.console?.port).toBe(17330);
    expect(status.version).toBe("1.2.0");
    expect(status.connectors).toEqual([]);
  });
});
