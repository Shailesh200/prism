import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prism } from "@repo-prism/core";
import type { VerifyRunner } from "@repo-prism/checks";
import { listStoredReceipts } from "@repo-prism/shared/receipt-store";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import { createFixture, type Fixture } from "@repo-prism/test-support";
import { afterEach, describe, expect, it } from "vitest";
import {
  createReceiptService,
  readSessionBaseline,
  recordSessionBaseline,
} from "./receipt-service.js";

const fixtures: Fixture[] = [];
const homes: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
  for (const home of homes.splice(0))
    rmSync(home, { recursive: true, force: true });
});

function isolatedEnv(): NodeJS.ProcessEnv {
  const home = mkdtempSync(join(tmpdir(), "prism-receipt-home-"));
  homes.push(home);
  return { ...process.env, PRISM_HOME: home };
}

async function repo(): Promise<Fixture> {
  const fixture = await createFixture({ name: "receipt-service" });
  fixtures.push(fixture);
  await fixture.write(
    "package.json",
    JSON.stringify({ name: "svc", scripts: { test: "node t.js" } }),
  );
  await fixture.write(
    "src/money.ts",
    "export function formatMoney(n: number): string { return `$${n}`; }\n",
  );
  await fixture.write(
    "src/money.test.ts",
    'import { formatMoney } from "./money.js";\nexport const t = formatMoney(1);\n',
  );
  await fixture.write("notes.md", "old notes\n");
  fixture.commit("initial");
  return fixture;
}

function open(root: string) {
  const opened = Prism.create().openRepository(root);
  if (!opened.ok) throw new Error(opened.error.message);
  return opened.value;
}

/** A runner whose test step waits until released. */
function gatedRunner(): {
  run: VerifyRunner;
  release: () => void;
  calls: string[];
} {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: string[] = [];
  return {
    calls,
    release: () => release(),
    run: async (_cwd, step) => {
      calls.push(step.name);
      if (step.name === "test") await gate;
      return { ok: true, output: "" };
    },
  };
}

describe("receipt service (plan §5.7)", () => {
  it("RE-1: answers with the structural receipt at once, then stores the checked one", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `$${n}.00`; }\n",
    );
    const env = isolatedEnv();
    const { run, release } = gatedRunner();
    const service = createReceiptService({ env, build: { run } });
    const workspace = open(fixture.root);
    try {
      const first = await service.receipt(workspace, { sessionId: "s-1" });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value.checksState).toBe("pending");
      expect(first.value.verdict).toBe("not_proven");
      expect(first.value.reason).toBe("still_running");
      expect(first.value.mode).toBe("daemon");

      release();
      const [running] = service.pending();
      const done = await running;
      expect(done?.verdict).toBe("proven");
      const stored = listStoredReceipts(fixture.root, env);
      expect(stored.map((r) => [r.id, r.checksState])).toEqual([
        [first.value.id, "done"],
      ]);

      // The next stop with the same edits gets the stored, finished receipt.
      const next = await service.receipt(workspace, { sessionId: "s-1" });
      expect(next.ok && next.value.id).toBe(first.value.id);
      expect(next.ok && next.value.verdict).toBe("proven");
    } finally {
      workspace.close();
    }
  });

  it("RE-3: a second stop while checks run returns the same id and starts no new run", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `$${n}!`; }\n",
    );
    const env = isolatedEnv();
    const { run, release, calls } = gatedRunner();
    const service = createReceiptService({ env, build: { run } });
    const workspace = open(fixture.root);
    try {
      const a = await service.receipt(workspace, { sessionId: "s-2" });
      const b = await service.receipt(workspace, { sessionId: "s-2" });
      expect(a.ok && b.ok && a.value.id === b.value.id).toBe(true);
      expect(service.pending()).toHaveLength(1);
      release();
      await Promise.all(service.pending());
      expect(calls.filter((c) => c === "test")).toHaveLength(1);
    } finally {
      workspace.close();
    }
  });

  it("scores only edits made after the session baseline", async () => {
    const fixture = await repo();
    await fixture.write("notes.md", "edited before the session\n");
    const env = isolatedEnv();
    const baseline = recordSessionBaseline(fixture.root, "s-3", env);
    expect(baseline.ok && baseline.value.dirty).toEqual(["notes.md"]);
    // Same id again keeps the first baseline (a resumed session).
    await fixture.write("src/extra.ts", "export const extra = 1;\n");
    const again = recordSessionBaseline(fixture.root, "s-3", env);
    expect(again.ok && again.value.reused).toBe(true);
    expect(again.ok && again.value.dirty).toEqual(["notes.md"]);

    const service = createReceiptService({
      env,
      build: { run: async () => ({ ok: true, output: "" }) },
    });
    const workspace = open(fixture.root);
    try {
      const receipt = await service.receipt(workspace, {
        sessionId: "s-3",
        runChecks: false,
      });
      expect(receipt.ok && receipt.value.touched.files).toEqual([
        "src/extra.ts",
      ]);
    } finally {
      workspace.close();
    }
  });

  it("never hands one session another session's baseline", async () => {
    const fixture = await repo();
    const env = isolatedEnv();
    recordSessionBaseline(fixture.root, "a", env);
    expect(readSessionBaseline(fixture.root, "a", env)?.sessionId).toBe("a");
    expect(readSessionBaseline(fixture.root, "b", env)).toBeNull();
  });

  it("moves a corrupt baseline aside and records a fresh one", async () => {
    const fixture = await repo();
    const env = isolatedEnv();
    recordSessionBaseline(fixture.root, undefined, env);
    const latest = join(
      workspacePrismDir(fixture.root, env),
      "hooks",
      "session.json",
    );
    writeFileSync(latest, "{not json");
    expect(readSessionBaseline(fixture.root, undefined, env)).toBeNull();
    const events = readFileSync(
      join(env.PRISM_HOME ?? "", "events.jsonl"),
      "utf8",
    );
    expect(events).toMatch(/session\.baseline_corrupt/);
  });
});
