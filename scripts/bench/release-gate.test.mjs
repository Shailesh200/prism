import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calibrate, renderDoc, summarize, toRaw } from "./b6-report.mjs";
import { releaseChecks, WARN_ONLY_2_0_0 } from "./release-gate.mjs";

const b1 = (withP, without) => ({
  totals: {
    withPrism: { estimatedTokens: withP },
    withoutPrism: { estimatedTokens: without },
  },
});
const run = (arm, i, tokens, cost, success = true, task = `t${i % 4}`) => ({
  host: "Claude Code",
  task,
  repo: "hono",
  arm,
  run: i,
  model: "m",
  durationMs: 1000,
  timedOut: false,
  testsPass: success,
  testsUntouched: true,
  success,
  usage: {
    input: tokens,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    costUsd: cost,
  },
});
const raw = (rowsA, rowsB) => ({
  schema: 1,
  measuredOn: "2026-10-15",
  model: "m",
  limitMinutes: 10,
  repos: [{ name: "hono", url: "https://github.com/honojs/hono" }],
  runs: [...rowsA, ...rowsB],
});
const ten = (arm, tokens, cost, success) =>
  Array.from({ length: 10 }, (_, i) => run(arm, i, tokens, cost, success));
const status = (out, id) => out.find((r) => r.id === id)?.status;

describe("release gate (P14)", () => {
  it("GATE-T1: B1 ratio above 1.0 fails, at or below passes", () => {
    assert.equal(
      status(releaseChecks({ b1: b1(120, 100) }), "GATE-T1.B1ratio"),
      "fail",
    );
    assert.equal(
      status(releaseChecks({ b1: b1(100, 100) }), "GATE-T1.B1ratio"),
      "pass",
    );
  });
  it("GATE-T2: missing B6 fails", () => {
    assert.equal(
      status(releaseChecks({ b1: b1(1, 1), raw: null }), "GATE-T2.B6"),
      "fail",
    );
  });
  it("GATE-T2: fewer than 10 per arm, or with-Prism costlier, fails", () => {
    const small = raw(ten("A", 100, 1).slice(0, 9), ten("B", 90, 1));
    assert.equal(
      status(
        releaseChecks({ raw: small, doc: renderDoc(small) }),
        "GATE-T2.ClaudeCode.n",
      ),
      "fail",
    );
    const worse = raw(ten("A", 100, 1), ten("B", 120, 2));
    const out = releaseChecks({ raw: worse, doc: renderDoc(worse) });
    // 2.0.0 only: Claude Code tokens and cost warn (WARN_ONLY_2_0_0); 2.0.1
    // makes them failures again.
    assert.equal(status(out, "GATE-T2.ClaudeCode.tokens"), "warn");
    assert.equal(status(out, "GATE-T2.ClaudeCode.cost"), "warn");
    assert.deepEqual([...WARN_ONLY_2_0_0].sort(), [
      "GATE-T2.ClaudeCode.cost",
      "GATE-T2.ClaudeCode.tokens",
    ]);
    const lower = raw(ten("A", 100, 1, true), ten("B", 90, 1, false));
    assert.equal(
      status(
        releaseChecks({ raw: lower, doc: renderDoc(lower) }),
        "GATE-T2.ClaudeCode.success",
      ),
      "fail",
    );
    const good = raw(ten("A", 100, 1), ten("B", 90, 0.9));
    const ok = releaseChecks({ raw: good, doc: renderDoc(good) });
    for (const id of ["n", "tokens", "cost", "success"])
      assert.equal(status(ok, `GATE-T2.ClaudeCode.${id}`), "pass");
  });
  it("GATE-T2: a required host with no sessions fails, with its reason", () => {
    const r = {
      ...raw(ten("A", 100, 1), ten("B", 90, 0.9)),
      notRun: [{ host: "opencode", reason: "no credential" }],
    };
    const out = releaseChecks({ raw: r, doc: renderDoc(r) });
    const miss = out.find((x) => x.id === "GATE-T2.opencode.missing");
    assert.equal(miss?.status, "fail");
    assert.match(miss.why, /no credential/);
    assert.match(renderDoc(r), /\*\*opencode\*\*: not run\. no credential\./);
    const both = raw(ten("A", 100, 1), [
      ...ten("B", 90, 0.9),
      ...ten("A", 100, 1).map((x) => ({ ...x, host: "opencode" })),
      ...ten("B", 90, 0.9).map((x) => ({ ...x, host: "opencode" })),
    ]);
    assert.equal(
      releaseChecks({ raw: both, doc: renderDoc(both) }).some((x) =>
        x.id.endsWith(".missing"),
      ),
      false,
    );
  });
  it("GATE-T3: a private repo name in the proof fails", () => {
    process.env.PRISM_PRIVATE_NAMES = "private-repo-x";
    const r = raw(ten("A", 100, 1), ten("B", 90, 1));
    assert.equal(
      status(
        releaseChecks({ raw: r, doc: `${renderDoc(r)}private-repo-x` }),
        "GATE-T3.publicOnly",
      ),
      "fail",
    );
    assert.equal(
      status(
        releaseChecks({ raw: r, doc: renderDoc(r) }),
        "GATE-T3.publicOnly",
      ),
      "pass",
    );
  });
  it("GATE-T4: the report regenerates byte-identical from raw JSON", () => {
    const r = raw(ten("A", 100, 1), ten("B", 90, 1));
    assert.equal(renderDoc(r), renderDoc(JSON.parse(JSON.stringify(r))));
    assert.equal(
      status(
        releaseChecks({ raw: r, doc: `${renderDoc(r)} ` }),
        "GATE-T4.regenerates",
      ),
      "fail",
    );
  });
});

describe("value-line calibration (P13 VAL vs B6)", () => {
  it("fits tokens per file on half the tasks and checks the other half", () => {
    const tasks = [0, 1, 2, 3].map((i) => ({
      task: `t${i}`,
      measuredSaved: 5000 * (i + 1) - 1000,
      tokensIn: 1000,
      filesCovered: i + 1,
    }));
    const c = calibrate(tasks);
    assert.equal(c.tokensPerFile, 5000);
    assert.equal(c.pass, true);
  });
  it("fails when Prism did not save tokens", () => {
    const tasks = [0, 1, 2, 3].map((i) => ({
      task: `t${i}`,
      measuredSaved: -20000,
      tokensIn: 3000,
      filesCovered: 2,
    }));
    assert.equal(calibrate(tasks).pass, false);
  });
  it("is not calibrated when no files were sent", () => {
    assert.equal(
      calibrate([{ task: "a", measuredSaved: 1, tokensIn: 0, filesCovered: 0 }])
        .tokensPerFile,
      null,
    );
  });
});

describe("b6 publish across hosts", () => {
  it("keeps each row's own host, so opencode rows count for opencode", () => {
    const row = (host, arm) => ({
      host,
      task: "t",
      repo: "hono",
      arm,
      run: 1,
      model: "m",
      durationMs: 1000,
      timedOut: false,
      testsPass: true,
      testsUntouched: true,
      success: true,
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
    });
    const raw = toRaw(
      [row("claude", "A"), row("opencode", "B"), row("private", "A")],
      {
        host: "Claude Code",
        measuredOn: "d",
        model: "m",
        limitMinutes: 10,
      },
    );
    assert.deepEqual(raw.runs.map((r) => r.host).sort(), [
      "Claude Code",
      "Claude Code",
      "opencode",
    ]);
    assert.deepEqual(summarize(raw).hosts, ["Claude Code", "opencode"]);
  });
});
