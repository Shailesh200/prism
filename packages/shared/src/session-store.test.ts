import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dedupePrepareChange } from "./session-dedupe.js";
import type { PrepareChange } from "./schemas.js";
import {
  pruneSessionStores,
  readSessionStore,
  sessionStoreIsHashesOnly,
  writeSessionStore,
  emptySessionStore,
  SESSION_TTL_MS,
} from "./session-store.js";

function prep(files: { path: string; hash?: string }[]): PrepareChange {
  return {
    pack: {
      task: "t",
      files: files.map((f) => ({
        path: f.path,
        symbols: ["x"],
        signatures: [
          { name: "x", kind: "function", signature: "function x()", line: 1 },
        ],
        why: ["seed file"],
        tokenWeight: 40,
        confidence: "medium" as const,
        provenance: "heuristic" as const,
      })),
      tokenEstimate: files.length * 40,
      tests: [],
      truncated: false,
      totalCount: files.length,
    },
    reuse: [],
    conventions: [],
    notes: [],
    order: {
      inScope: files.map((f) => f.path),
      offLimits: [],
      needsSignOff: [],
      advisory: true,
      hookArmed: false,
    },
    workingSet: null,
    generatedAt: "2026-10-15T00:00:00.000Z",
    indexIndexedAt: "2026-10-15T00:00:00.000Z",
    reuseProvenance: "unavailable",
    conventionsProvenance: "unavailable",
    ambiguous: null,
  };
}

describe("session store (P4)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  function envHome(): NodeJS.ProcessEnv {
    const home = mkdtempSync(join(tmpdir(), "prism-ses-"));
    dirs.push(home);
    return { ...process.env, PRISM_HOME: home };
  }

  it("SES-1 second identical prepare is ≥ 70% smaller", () => {
    const env = envHome();
    const fileHashes = { "src/a.ts": "aaaaaaaaaaaaaaaa" };
    const first = dedupePrepareChange(prep([{ path: "src/a.ts" }]), {
      sessionId: "s1",
      fileHashes,
      env,
    });
    expect(first.prep.pack.files[0]?.signatures.length).toBe(1);
    const second = dedupePrepareChange(prep([{ path: "src/a.ts" }]), {
      sessionId: "s1",
      fileHashes,
      env,
    });
    expect(second.prep.pack.tokenEstimate).toBeLessThanOrEqual(
      first.prep.pack.tokenEstimate * 0.3,
    );
    expect(second.prep.pack.files[0]?.why[0]).toMatch(/sent earlier/);
  });

  it("SES-2 edited file is resent", () => {
    const env = envHome();
    dedupePrepareChange(prep([{ path: "src/a.ts" }]), {
      sessionId: "s2",
      fileHashes: { "src/a.ts": "hash111111111111" },
      env,
    });
    const again = dedupePrepareChange(prep([{ path: "src/a.ts" }]), {
      sessionId: "s2",
      fileHashes: { "src/a.ts": "hash222222222222" },
      env,
    });
    expect(again.prep.pack.files[0]?.signatures.length).toBe(1);
    expect(again.prep.pack.files[0]?.why[0]).not.toMatch(/sent earlier/);
  });

  it("SES-3 different sessions don't share", () => {
    const env = envHome();
    const hashes = { "src/a.ts": "aaaaaaaaaaaaaaaa" };
    dedupePrepareChange(prep([{ path: "src/a.ts" }]), {
      sessionId: "alpha",
      fileHashes: hashes,
      env,
    });
    const other = dedupePrepareChange(prep([{ path: "src/a.ts" }]), {
      sessionId: "beta",
      fileHashes: hashes,
      env,
    });
    expect(other.prep.pack.files[0]?.signatures.length).toBe(1);
  });

  it("SES-4 TTL prune", () => {
    const env = envHome();
    const store = emptySessionStore("old");
    writeSessionStore(
      {
        ...store,
        updatedAt: new Date(Date.now() - SESSION_TTL_MS - 1000).toISOString(),
      },
      env,
    );
    const deleted = pruneSessionStores(env);
    expect(deleted.length).toBe(1);
    expect(readSessionStore("old", env).turn).toBe(0);
  });

  it("SES-5 store has hashes/ids only, no content", () => {
    const env = envHome();
    const { store } = dedupePrepareChange(prep([{ path: "src/a.ts" }]), {
      sessionId: "priv",
      fileHashes: { "src/a.ts": "deadbeefdeadbeef" },
      env,
    });
    expect(sessionStoreIsHashesOnly(store)).toBe(true);
    const raw = JSON.stringify(store);
    expect(raw).not.toContain("function x()");
    expect(raw).not.toContain("seed file");
  });
});
