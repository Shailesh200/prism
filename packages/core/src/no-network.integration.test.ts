import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import * as net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tls from "node:tls";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prism } from "./prism.js";
import type { PrismWorkspace } from "./workspace.js";

/**
 * Prism's headline claim is that nothing leaves your machine unless you ask
 * (M-036 Phase 3). Stating that in an ADR is cheap; this suite makes it a
 * property of the build.
 *
 * Every outbound primitive is replaced with one that records the attempt and
 * throws. We assert on *attempts*, not on timeouts or firewall behaviour, so
 * the suite is deterministic and a failure names the exact call that escaped.
 */

const attempts: string[] = [];

function record(what: string): never {
  attempts.push(what);
  throw new Error(`network call escaped local-only analysis: ${what}`);
}

const originals = {
  fetch: globalThis.fetch,
  socketConnect: net.Socket.prototype.connect,
  tlsConnect: tls.TLSSocket.prototype.connect,
};

function describeTarget(args: readonly unknown[]): string {
  const first = args[0];
  if (typeof first === "string") return first;
  if (first instanceof URL) return first.href;
  if (first && typeof first === "object") {
    const o = first as { host?: string; hostname?: string; port?: unknown };
    if (o.host || o.hostname) return `${o.hostname ?? o.host}:${o.port ?? ""}`;
  }
  return JSON.stringify(first ?? null);
}

/**
 * `http.request`, `https.request` and `fetch` all end at a socket, so trapping
 * `Socket.prototype.connect` catches every one of them — including anything a
 * transitive dependency reaches for. ES module namespaces are frozen, which
 * rules out patching the module functions directly anyway.
 *
 * Unix-domain sockets are left alone: they never leave the machine, and the
 * SQLite cache and spawned tools legitimately use local IPC.
 */
function install(): void {
  globalThis.fetch = ((...args: unknown[]) =>
    record(`fetch ${describeTarget(args)}`)) as typeof fetch;

  const trap = function (this: net.Socket, ...args: unknown[]): net.Socket {
    const target = describeTarget(args);
    if (target.startsWith("/") || target.includes(".sock")) {
      return originals.socketConnect.apply(
        this,
        args as Parameters<typeof originals.socketConnect>,
      );
    }
    return record(`socket.connect ${target}`);
  };

  net.Socket.prototype.connect = trap as typeof net.Socket.prototype.connect;
  tls.TLSSocket.prototype.connect =
    trap as typeof tls.TLSSocket.prototype.connect;
}

function restore(): void {
  globalThis.fetch = originals.fetch;
  net.Socket.prototype.connect = originals.socketConnect;
  tls.TLSSocket.prototype.connect = originals.tlsConnect;
}

/**
 * A repository with enough shape that every analysis has something to say —
 * an empty folder would pass this suite by doing nothing at all.
 */
async function buildFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "prism-no-network-"));
  await mkdir(join(root, "src", "features"), { recursive: true });
  await mkdir(join(root, "src", "api"), { recursive: true });

  await writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: "no-network-fixture",
        version: "1.0.0",
        private: true,
        scripts: { test: "vitest run", build: "tsc" },
        dependencies: { express: "4.18.0", react: "18.2.0" },
        devDependencies: { typescript: "5.4.0", vitest: "1.0.0" },
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    join(root, "src", "api", "server.ts"),
    [
      "import express from 'express';",
      "import { total } from '../features/cart.js';",
      "export const app = express();",
      "app.get('/api/cart', (_req, res) => res.json({ total: total([]) }));",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    join(root, "src", "features", "cart.ts"),
    [
      "export type Item = { price: number; qty: number };",
      "export function total(items: Item[]): number {",
      "  return items.reduce((sum, i) => sum + i.price * i.qty, 0);",
      "}",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    join(root, "src", "features", "cart.test.ts"),
    [
      "import { total } from './cart.js';",
      "it('sums', () => { expect(total([])).toBe(0); });",
    ].join("\n"),
    "utf8",
  );

  // Git history gives ownership and activity something real to read.
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  };
  git("init", "--quiet");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture Author");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");

  return root;
}

describe("local-only analysis makes no network calls (M-036 Phase 3)", () => {
  let root: string;
  let workspace: PrismWorkspace;

  beforeAll(async () => {
    root = await buildFixture();
    install();
    const opened = Prism.create().openRepository(root);
    if (!opened.ok) throw new Error(`openRepository: ${opened.error.message}`);
    workspace = opened.value;
  }, 120_000);

  afterAll(() => {
    restore();
    workspace?.close();
  });

  /**
   * Every entry point a user reaches without opting into anything. If a future
   * change adds a lookup — a vulnerability database, a "latest version" check,
   * an avatar — one of these fails and names it.
   */
  // Some of these are synchronous and some are not; the harness cares only
  // that they run, so the shape is deliberately loose.
  const surfaces: ReadonlyArray<
    readonly [string, () => unknown | Promise<unknown>]
  > = [
    ["index", () => workspace.index()],
    ["getDna", () => workspace.getDna()],
    ["getHealth", () => workspace.getHealth()],
    ["getRepositoryMap", () => workspace.getRepositoryMap()],
    ["getDependencyGraph", () => workspace.getDependencyGraph()],
    ["getKnowledgeGraph", () => workspace.getKnowledgeGraph()],
    ["getStackProfile", () => workspace.getStackProfile()],
    ["listFeatures", () => workspace.listFeatures()],
    ["getEngineeringHealth", () => workspace.getEngineeringHealth()],
    ["getTestingReport", () => workspace.getTestingReport()],
    ["getSecurityReport", () => workspace.getSecurityReport()],
    ["getBackendReport", () => workspace.getBackendReport()],
    ["getOverviewModel", () => workspace.getOverviewModel()],
    ["getDomainReport", () => workspace.getDomainReport("frontend")],
    ["getGitActivity", () => workspace.getGitActivity()],
    ["getChangedPaths", () => workspace.getChangedPaths()],
    [
      "blastRadius",
      () => workspace.blastRadius({ kind: "file", id: "src/features/cart.ts" }),
    ],
    [
      "safeDelete",
      () => workspace.safeDelete({ kind: "file", id: "src/features/cart.ts" }),
    ],
    ["explainArea", () => workspace.explainArea("src/features")],
    [
      "exploreCode",
      () =>
        workspace.exploreCode({ kind: "file", path: "src/features/cart.ts" }),
    ],
    [
      "testImpact",
      () => workspace.testImpact({ kind: "file", id: "src/features/cart.ts" }),
    ],
  ];

  it.each(surfaces)(
    "%s reaches no host",
    async (name, run) => {
      const before = attempts.length;
      const result = await run();
      // Analysis is allowed to decline (no git, no coverage); it is not allowed
      // to phone home. A thrown trap would also surface here as a rejection.
      expect(result).toBeDefined();
      expect(attempts.slice(before)).toEqual([]);
      expect(name).toBeTruthy();
    },
    180_000,
  );

  it("attempted nothing across the whole suite", () => {
    expect(attempts).toEqual([]);
  });

  it("would have caught a call, so the silence above means something", async () => {
    // Without this, the suite would pass just as happily if the traps were
    // never installed — the most dangerous kind of green.
    const before = attempts.length;

    // The traps throw synchronously rather than returning a rejected promise,
    // so a caller cannot swallow them with a stray `.catch()`.
    expect(() => fetch("https://example.invalid/leak")).toThrow(
      /escaped local-only analysis/,
    );
    expect(() => net.connect({ host: "example.invalid", port: 443 })).toThrow(
      /escaped local-only analysis/,
    );

    const caught = attempts.splice(before);
    expect(caught).toHaveLength(2);
    expect(caught[0]).toContain("example.invalid");
  });

  it("refuses the gated paths cleanly, with no partial side effect", async () => {
    const before = attempts.length;

    const job = await workspace.startUtilityJob({ kind: "lighthouse" });
    expect(job.ok).toBe(false);
    if (!job.ok) {
      expect(job.error.message).toMatch(/consent/i);
    }

    const bundle = await workspace.startUtilityJob({ kind: "bundle-stats" });
    expect(bundle.ok).toBe(false);

    // Refused before the request, not after it.
    expect(attempts.slice(before)).toEqual([]);
  }, 60_000);
});

describe("Core DTOs carry no credentials (M-036 Phase 3.4)", () => {
  it("names no token, key, secret or password field", async () => {
    const { readFile } = await import("node:fs/promises");
    const schemas = await readFile(
      join(import.meta.dirname, "..", "..", "shared", "src", "schemas.ts"),
      "utf8",
    );

    // Field *declarations* only: prose and `apiKeyUrl`-style documentation
    // links are not credentials, and matching them would train everyone to
    // ignore this test.
    const offenders = [
      ...schemas.matchAll(
        /^\s*(\w*(?:token|secret|password|credential|apiKey)\w*)\s*:/gim,
      ),
    ].map((match) => match[1]);

    expect(offenders).toEqual([]);
  });
});
