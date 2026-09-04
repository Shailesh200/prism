import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createClaudeAuthPort,
  ensureClaudeWorkerAuth,
  inspectClaudeWorkerAuth,
  parseClaudeAuthStatus,
} from "./claude-auth.js";

let home: string | undefined;

afterEach(async () => {
  if (home) await rm(home, { recursive: true, force: true });
  home = undefined;
});

const cliFound = async (): Promise<boolean> => true;
const cliMissing = async (): Promise<boolean> => false;

describe("createClaudeAuthPort", () => {
  it("reports cli-missing when the binary does not run", async () => {
    const port = createClaudeAuthPort({ probeCli: cliMissing, env: {} });
    expect(await port.status()).toEqual({
      kind: "missing",
      reason: "cli-missing",
    });
  });

  it("treats ANTHROPIC_API_KEY as signed in", async () => {
    const port = createClaudeAuthPort({
      probeCli: cliFound,
      env: { ANTHROPIC_API_KEY: "sk-ant-…" },
    });
    expect(await port.status()).toEqual({ kind: "stored" });
  });

  it("treats the Claude Code credentials file as signed in", async () => {
    home = await mkdtemp(join(tmpdir(), "prism-claude-auth-"));
    await mkdir(join(home, ".claude"), { recursive: true });
    await writeFile(join(home, ".claude", ".credentials.json"), "{}");
    const port = createClaudeAuthPort({
      home,
      probeCli: cliFound,
      probeLogin: async () => ({ loggedIn: false }),
      env: {},
    });
    expect(await port.status()).toEqual({ kind: "stored" });
  });

  it("treats claude auth status as signed in when the credentials file is gone", async () => {
    home = await mkdtemp(join(tmpdir(), "prism-claude-auth-"));
    const port = createClaudeAuthPort({
      home,
      probeCli: cliFound,
      probeLogin: async () => ({
        loggedIn: true,
        email: "dev@prism.test",
      }),
      env: {},
    });
    expect(await port.status()).toEqual({
      kind: "stored",
      email: "dev@prism.test",
    });
  });

  it("reports signin-missing when the CLI exists without credentials", async () => {
    home = await mkdtemp(join(tmpdir(), "prism-claude-auth-"));
    const port = createClaudeAuthPort({
      home,
      probeCli: cliFound,
      probeLogin: async () => ({ loggedIn: false }),
      env: {},
    });
    expect(await port.status()).toEqual({
      kind: "missing",
      reason: "signin-missing",
    });
  });
});

describe("inspectClaudeWorkerAuth", () => {
  it("never asks for an API key or mcp.json edit", () => {
    const cliGone = inspectClaudeWorkerAuth({
      kind: "missing",
      reason: "cli-missing",
    });
    expect(cliGone.ready).toBe(false);
    expect(cliGone.message).toMatch(/install/i);
    expect(cliGone.message).not.toMatch(/API key|mcp\.json|CURSOR_API_KEY/i);

    const signedOut = inspectClaudeWorkerAuth({
      kind: "missing",
      reason: "signin-missing",
    });
    expect(signedOut.ready).toBe(false);
    expect(signedOut.message).toMatch(/run claude once in a terminal/i);
    expect(signedOut.message).not.toMatch(/API key|mcp\.json/i);
  });

  it("is ready on a stored sign-in without exposing anything", () => {
    const row = inspectClaudeWorkerAuth({
      kind: "stored",
      email: "dev@prism.test",
    });
    expect(row.ready).toBe(true);
    expect(row.email).toBe("dev@prism.test");
    expect(row.apiKey).toBeUndefined();
    expect(row.message).not.toMatch(/API key|token|keychain/i);
  });
});

describe("parseClaudeAuthStatus", () => {
  it("reads loggedIn from claude auth status JSON", () => {
    expect(
      parseClaudeAuthStatus(
        '{\n  "loggedIn": true,\n  "authMethod": "claude.ai",\n  "email": "dev@prism.test"\n}\n',
      ),
    ).toEqual({ loggedIn: true, email: "dev@prism.test" });
    expect(parseClaudeAuthStatus('{"loggedIn": false}')).toEqual({
      loggedIn: false,
    });
    expect(parseClaudeAuthStatus("not json")).toEqual({ loggedIn: false });
  });
});

describe("ensureClaudeWorkerAuth", () => {
  it("returns the inspection; there is no browser login to drive", async () => {
    const row = await ensureClaudeWorkerAuth({
      env: {},
      auth: createClaudeAuthPort({
        probeCli: cliFound,
        env: { ANTHROPIC_API_KEY: "k" },
      }),
    });
    expect(row.ready).toBe(true);
  });

  it("says how to recover when the port is absent", async () => {
    const row = await ensureClaudeWorkerAuth({ env: {} });
    expect(row.ready).toBe(false);
    expect(row.message).toMatch(/reload the prism mcp server/i);
  });
});
