import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Prism } from "@repo-prism/core";
import type { VerifyRunner } from "@repo-prism/checks";
import {
  nothingChanged,
  receiptTerminalLine,
  shipVerdict,
  shipVerdictLabel,
} from "@repo-prism/shared";
import { listStoredReceipts } from "@repo-prism/shared/receipt-store";
import { workspacePrismDir } from "@repo-prism/shared/prism-home";
import { createFixture, type Fixture } from "@repo-prism/test-support";
import { afterEach, describe, expect, it } from "vitest";
import {
  NO_COMMITS_YET,
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
      // P13: the session value rides on every receipt (uncalibrated → null saving).
      expect(first.value.value).toMatchObject({
        estimatedSaved: null,
        issuesCaught: 0,
      });

      release();
      const [running] = service.pending();
      const done = await running;
      expect(done?.verdict).toBe("proven");
      expect(done?.value?.estimatedSaved).toBeNull();
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

  it("RE-4: the next stop reports the earlier change's finished checks once", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `$${n}?`; }\n",
    );
    const env = isolatedEnv();
    const { run, release } = gatedRunner();
    const service = createReceiptService({ env, build: { run } });
    const workspace = open(fixture.root);
    try {
      const first = await service.receipt(workspace, { sessionId: "s-4" });
      expect(first.ok && first.value.reason).toBe("still_running");
      expect(first.ok && first.value.earlier).toBeUndefined();
      release();
      await Promise.all(service.pending());

      // The agent's next turn changes the code again before its stop.
      await fixture.write(
        "src/money.ts",
        "export function formatMoney(n: number): string { return `$${n}?!`; }\n",
      );
      const second = await service.receipt(workspace, { sessionId: "s-4" });
      expect(second.ok).toBe(true);
      if (!second.ok || !first.ok) return;
      expect(second.value.id).not.toBe(first.value.id);
      expect(second.value.earlier).toMatchObject({
        id: first.value.id,
        verdict: "proven",
      });
      expect(second.value.earlier?.summary).toMatch(/— SHIP$/);

      await Promise.all(service.pending());
      const third = await service.receipt(workspace, { sessionId: "s-4" });
      expect(third.ok && third.value.earlier).toBeUndefined();
    } finally {
      workspace.close();
    }
  });

  it("RE-5: settle waits for the stopped change's checks, starts none, and clears earlier", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `$${n}#`; }\n",
    );
    const env = isolatedEnv();
    const { run, release, calls } = gatedRunner();
    const service = createReceiptService({ env, build: { run } });
    const workspace = open(fixture.root);
    try {
      const first = await service.receipt(workspace, { sessionId: "s-5" });
      if (!first.ok) throw new Error("no receipt");
      expect(first.value.checksState).toBe("pending");

      // Still running: settle answers the stored receipt after its wait.
      const waiting = await service.settle(fixture.root, first.value.id, 20);
      expect(waiting.running).toBe(true);
      expect(waiting.receipt?.checksState).toBe("pending");

      const settled = service.settle(fixture.root, first.value.id, 5_000);
      release();
      const done = await settled;
      expect(done.receipt?.verdict).toBe("proven");
      expect(done.running).toBe(false);

      // Shown by settle: the next stop does not repeat it as `earlier`.
      await fixture.write(
        "src/money.ts",
        "export function formatMoney(n: number): string { return `$${n}##`; }\n",
      );
      const next = await service.receipt(workspace, { sessionId: "s-5" });
      expect(next.ok && next.value.earlier).toBeUndefined();
      release();
      await Promise.all(service.pending());

      // Unknown ids: nothing stored, nothing running, and no check run.
      const before = calls.length;
      const none = await service.settle(fixture.root, "no-such-id", 50);
      expect(none).toEqual({ receipt: null, running: false });
      expect(calls.length).toBe(before);
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

describe("J-08 interim: commits made during the session", () => {
  const passing = { run: async () => ({ ok: true, output: "" }) };

  it("records HEAD at session start", async () => {
    const fixture = await repo();
    const env = isolatedEnv();
    const baseline = recordSessionBaseline(fixture.root, "h-1", env);
    expect(baseline.ok && baseline.value.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(readSessionBaseline(fixture.root, "h-1", env)?.headSha).toBe(
      baseline.ok ? baseline.value.headSha : "",
    );
  });

  it("a commit mid-session gives NOT PROVEN, never SHIP or nothing changed", async () => {
    const fixture = await repo();
    const env = isolatedEnv();
    recordSessionBaseline(fixture.root, "h-2", env);
    const service = createReceiptService({ env, build: passing });
    const workspace = open(fixture.root);
    try {
      // A clean stop before the commit: nothing changed, as before.
      const before = await service.receipt(workspace, {
        sessionId: "h-2",
        waitMs: 5000,
      });
      if (!before.ok) throw new Error(before.error.message);
      expect(nothingChanged(before.value)).toBe(true);
      // The agent edits and commits: the tree is clean again.
      await fixture.write(
        "src/money.ts",
        "export function formatMoney(n: number): string { return `$${n}.00`; }\n",
      );
      fixture.commit("agent commit");
      const after = await service.receipt(workspace, {
        sessionId: "h-2",
        waitMs: 5000,
      });
      if (!after.ok) throw new Error(after.error.message);
      expect(after.value.id).not.toBe(before.value.id);
      expect(after.value.verdict).toBe("not_proven");
      expect(after.value.reason).toBe("committed_during_session");
      expect(after.value.checksState).not.toBe("pending");
      expect(nothingChanged(after.value)).toBe(false);
      expect(shipVerdict(after.value)).toBe("NOT PROVEN");
      expect(shipVerdictLabel(after.value)).toBe(
        "NOT PROVEN (a commit was made during this session)",
      );
      expect(receiptTerminalLine(after.value)).not.toMatch(/nothing changed/);
      // J-30: the stored receipt is never SHIP.
      const stored = listStoredReceipts(fixture.root, env, 10).filter(
        (r) => r.id === after.value.id,
      );
      expect(stored).toHaveLength(1);
      expect(stored[0]!.verdict).toBe("not_proven");
      expect(stored[0]!.reason).toBe("committed_during_session");
    } finally {
      workspace.close();
    }
  });

  it("a commit plus uncommitted edits is still NOT PROVEN and runs no checks", async () => {
    const fixture = await repo();
    const env = isolatedEnv();
    recordSessionBaseline(fixture.root, "h-3", env);
    const calls: string[] = [];
    const service = createReceiptService({
      env,
      build: {
        run: async (_cwd, step) => {
          calls.push(step.name);
          return { ok: true, output: "" };
        },
      },
    });
    await fixture.write("notes.md", "committed\n");
    fixture.commit("agent commit");
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `$${n}.0`; }\n",
    );
    const workspace = open(fixture.root);
    try {
      const r = await service.receipt(workspace, {
        sessionId: "h-3",
        waitMs: 5000,
      });
      if (!r.ok) throw new Error(r.error.message);
      expect(r.value.reason).toBe("committed_during_session");
      expect(shipVerdict(r.value)).toBe("NOT PROVEN");
      expect(calls).toEqual([]);
      expect(service.pending()).toHaveLength(0);
    } finally {
      workspace.close();
    }
  });

  it("no commit: an edit is checked as before, and a clean stop says nothing changed", async () => {
    const fixture = await repo();
    const env = isolatedEnv();
    recordSessionBaseline(fixture.root, "h-4", env);
    const service = createReceiptService({ env, build: passing });
    const workspace = open(fixture.root);
    try {
      const clean = await service.receipt(workspace, { sessionId: "h-4" });
      if (!clean.ok) throw new Error(clean.error.message);
      expect(clean.value.reason).not.toBe("committed_during_session");
      expect(nothingChanged(clean.value)).toBe(true);
      await fixture.write(
        "src/money.ts",
        "export function formatMoney(n: number): string { return `$${n}.00`; }\n",
      );
      const edited = await service.receipt(workspace, {
        sessionId: "h-4",
        waitMs: 20000,
      });
      if (!edited.ok) throw new Error(edited.error.message);
      expect(edited.value.reason).not.toBe("committed_during_session");
      expect(edited.value.touched.files).toEqual(["src/money.ts"]);
    } finally {
      workspace.close();
    }
  });

  /** Stops after `move`, with every check passing: never SHIP (Arc). */
  async function stopAfter(
    fixture: Fixture,
    move: () => void | Promise<void>,
    prepare?: () => void,
  ) {
    const env = isolatedEnv();
    prepare?.();
    recordSessionBaseline(fixture.root, "mv", env);
    await move();
    const service = createReceiptService({ env, build: passing });
    const workspace = open(fixture.root);
    try {
      const r = await service.receipt(workspace, {
        sessionId: "mv",
        waitMs: 20000,
      });
      if (!r.ok) throw new Error(r.error.message);
      await Promise.all(service.pending());
      const stored = listStoredReceipts(fixture.root, env, 20);
      return { receipt: r.value, stored };
    } finally {
      workspace.close();
    }
  }

  function expectNeverShip(out: Awaited<ReturnType<typeof stopAfter>>) {
    expect(out.receipt.reason).toBe("committed_during_session");
    expect(out.receipt.verdict).toBe("not_proven");
    expect(shipVerdict(out.receipt)).toBe("NOT PROVEN");
    expect(nothingChanged(out.receipt)).toBe(false);
    for (const r of out.stored) expect(shipVerdict(r), r.id).not.toBe("SHIP");
  }

  const edit = (fixture: Fixture) =>
    fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `$${n}.00`; }\n",
    );

  it("moved HEAD: amend gives NOT PROVEN", async () => {
    const fixture = await repo();
    expectNeverShip(
      await stopAfter(fixture, async () => {
        await edit(fixture);
        fixture.git("add", "-A");
        fixture.git("commit", "-q", "--amend", "--no-edit");
      }),
    );
  });

  it("moved HEAD: rebase onto another branch gives NOT PROVEN", async () => {
    const fixture = await repo();
    expectNeverShip(
      await stopAfter(
        fixture,
        () => {
          fixture.git("rebase", "-q", "other");
        },
        () => {
          fixture.git("branch", "other");
          fixture.git("checkout", "-q", "other");
          writeFileSync(join(fixture.root, "other.md"), "other\n");
          fixture.git("add", "-A");
          fixture.git("commit", "-q", "-m", "other");
          fixture.git("checkout", "-q", "-");
        },
      ),
    );
  });

  it("moved HEAD: reset to an earlier commit gives NOT PROVEN", async () => {
    const fixture = await repo();
    expectNeverShip(
      await stopAfter(
        fixture,
        () => {
          fixture.git("reset", "-q", "--hard", "HEAD~1");
        },
        () => {
          writeFileSync(join(fixture.root, "notes.md"), "second\n");
          fixture.commit("second");
        },
      ),
    );
  });

  it("moved HEAD: reset --soft keeps the changes but still gives NOT PROVEN", async () => {
    const fixture = await repo();
    expectNeverShip(
      await stopAfter(
        fixture,
        () => {
          fixture.git("reset", "-q", "--soft", "HEAD~1");
        },
        () => {
          writeFileSync(join(fixture.root, "notes.md"), "second\n");
          fixture.commit("second");
        },
      ),
    );
  });

  it("moved HEAD: a detached HEAD at another commit gives NOT PROVEN", async () => {
    const fixture = await repo();
    expectNeverShip(
      await stopAfter(
        fixture,
        () => {
          fixture.git("checkout", "-q", "--detach", "HEAD~1");
        },
        () => {
          writeFileSync(join(fixture.root, "notes.md"), "second\n");
          fixture.commit("second");
        },
      ),
    );
  });

  it("detached at the same commit is not a move: a clean stop says nothing changed", async () => {
    const fixture = await repo();
    const out = await stopAfter(fixture, () => {
      fixture.git("checkout", "-q", "--detach", "HEAD");
    });
    expect(out.receipt.reason).not.toBe("committed_during_session");
    expect(nothingChanged(out.receipt)).toBe(true);
  });

  it("missing start SHA: a record from before the fix gives NOT PROVEN once HEAD names a commit", async () => {
    const fixture = await repo();
    const env = isolatedEnv();
    recordSessionBaseline(fixture.root, "h-5", env);
    for (const file of [
      join(workspacePrismDir(fixture.root, env), "hooks", "session.json"),
    ]) {
      const old = JSON.parse(readFileSync(file, "utf8")) as Record<
        string,
        unknown
      >;
      delete old.headSha;
      delete old.sessionId;
      writeFileSync(file, JSON.stringify(old));
    }
    rmSync(join(workspacePrismDir(fixture.root, env), "sessions"), {
      recursive: true,
      force: true,
    });
    const service = createReceiptService({ env, build: passing });
    const workspace = open(fixture.root);
    try {
      const r = await service.receipt(workspace, { waitMs: 20000 });
      if (!r.ok) throw new Error(r.error.message);
      expect(r.value.reason).toBe("committed_during_session");
      expect(shipVerdict(r.value)).toBe("NOT PROVEN");
    } finally {
      workspace.close();
    }
  });

  it("missing start SHA: no commit at session start, then a first commit, gives NOT PROVEN", async () => {
    const fixture = await createFixture({ name: "receipt-unborn" });
    fixtures.push(fixture);
    await fixture.write("package.json", JSON.stringify({ name: "u" }));
    await fixture.write("src/a.ts", "export const a = 1;\n");
    const out = await stopAfter(fixture, () => {
      fixture.commit("first");
    });
    expectNeverShip(out);
  });

  it("no commits yet: the start is stored as an explicit marker; no commit stays unmoved", async () => {
    const fixture = await createFixture({ name: "receipt-unborn-2" });
    fixtures.push(fixture);
    await fixture.write("src/a.ts", "export const a = 1;\n");
    const env = isolatedEnv();
    const baseline = recordSessionBaseline(fixture.root, "u-2", env);
    expect(baseline.ok && baseline.value.headSha).toBe(NO_COMMITS_YET);
    const service = createReceiptService({ env, build: passing });
    const workspace = open(fixture.root);
    try {
      const r = await service.receipt(workspace, {
        sessionId: "u-2",
        runChecks: false,
      });
      if (!r.ok) throw new Error(r.error.message);
      expect(r.value.reason).not.toBe("committed_during_session");
      // The agent's first commit: HEAD moved from the marker.
      fixture.commit("first");
      const after = await service.receipt(workspace, {
        sessionId: "u-2",
        waitMs: 20000,
      });
      if (!after.ok) throw new Error(after.error.message);
      expect(after.value.reason).toBe("committed_during_session");
      expect(shipVerdict(after.value)).toBe("NOT PROVEN");
    } finally {
      workspace.close();
    }
  });

  it("re-recorded start: the daemon keeps the hook's start for the same session", async () => {
    const fixture = await repo();
    const env = isolatedEnv();
    const start = fixture.git("rev-parse", "HEAD");
    // Only the hook wrote the start (slow daemon).
    const hooked = join(
      workspacePrismDir(fixture.root, env),
      "hooks",
      "session.json",
    );
    mkdirSync(dirname(hooked), { recursive: true });
    writeFileSync(
      hooked,
      JSON.stringify({
        sessionId: "rr",
        startedAt: new Date().toISOString(),
        dirty: [],
        headSha: start,
      }),
    );
    await edit(fixture);
    fixture.commit("agent commit");
    // Resume or compact: the daemon now records the session.
    const again = recordSessionBaseline(fixture.root, "rr", env);
    expect(again.ok && again.value.reused).toBe(true);
    expect(again.ok && again.value.headSha).toBe(start);
    const service = createReceiptService({ env, build: passing });
    const workspace = open(fixture.root);
    try {
      const r = await service.receipt(workspace, {
        sessionId: "rr",
        waitMs: 20000,
      });
      if (!r.ok) throw new Error(r.error.message);
      expect(r.value.reason).toBe("committed_during_session");
      expect(shipVerdict(r.value)).toBe("NOT PROVEN");
    } finally {
      workspace.close();
    }
  });

  it("re-recorded start: another session's hook file is never reused", async () => {
    const fixture = await repo();
    const env = isolatedEnv();
    const hooked = join(
      workspacePrismDir(fixture.root, env),
      "hooks",
      "session.json",
    );
    mkdirSync(dirname(hooked), { recursive: true });
    writeFileSync(
      hooked,
      JSON.stringify({
        sessionId: "other",
        startedAt: new Date().toISOString(),
        dirty: ["x.ts"],
        headSha: "0".repeat(40),
      }),
    );
    const own = recordSessionBaseline(fixture.root, "mine", env);
    expect(own.ok && own.value.reused).toBe(false);
    expect(own.ok && own.value.headSha).toBe(fixture.git("rev-parse", "HEAD"));
  });
});
