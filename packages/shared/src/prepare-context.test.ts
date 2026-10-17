import { describe, expect, it } from "vitest";
import {
  PREPARE_NUDGE,
  buildPromptPack,
  changeRisk,
  confidentFile,
  lensLabel,
  promptNames,
  promptSummaryLine,
  widensScope,
} from "./prepare-context.js";
import type { ContextFile, PrepareChange } from "./schemas.js";

const file = (
  path: string,
  why: string[],
  confidence?: "high" | "medium" | "low",
): ContextFile =>
  ({
    path,
    symbols: [],
    signatures: [{ line: 3, name: "run", signature: "function run(): void" }],
    why,
    ...(confidence ? { confidence } : {}),
    tokenWeight: 10,
    provenance: "index",
  }) as unknown as ContextFile;

const prep = (files: ContextFile[], extra: Partial<PrepareChange> = {}) =>
  ({
    pack: {
      task: "t",
      files,
      tokenEstimate: 10,
      tests: ["src/a.test.ts"],
      run: [{ cwd: ".", command: "npx vitest run src/a.test.ts" }],
      truncated: false,
      totalCount: files.length,
    },
    reuse: [],
    conventions: [
      { path: "src/style.ts", symbol: "styled", pattern: "x", evidence: "" },
    ],
    ...extra,
  }) as unknown as PrepareChange;

describe("round 2 prompt pack", () => {
  it("lists only files the task named, at most three, signatures for the top one", () => {
    const pack = buildPromptPack({
      prompt: "Failing tests:\n- src/retry.test.ts\n- src/loop.test.ts",
      prep: prep([
        file("src/retry.ts", ["matches retry", "named in task"]),
        file("src/near.ts", ["import distance 1"], "high"),
        file("src/loop.ts", ["named in task"]),
        file("src/y.ts", ["matches retry", "seed file"]),
        file("src/z.ts", ["named in task"]),
        file("src/w.ts", ["named in task"]),
      ]),
    });
    const text = pack.text!;
    expect(text).toContain("- src/retry.ts: matches retry, named in task");
    expect(text).not.toContain("src/near.ts");
    expect(text).not.toContain("src/y.ts");
    expect(text.match(/function run/g)).toHaveLength(1);
    expect(text).toContain("Run: npx vitest run src/a.test.ts");
    expect(pack.shown.map((f) => f.path)).toEqual([
      "src/retry.ts",
      "src/loop.ts",
      "src/z.ts",
    ]);
  });

  it("a text match or a neighbour alone is a guess: no files, one prepare_change line", () => {
    const pack = buildPromptPack({
      prompt: "make the retry loop stop after five tries",
      prep: prep([
        file("src/retry.ts", ["matches retry, loop", "seed file"], "high"),
        file("src/loop.ts", ["import distance 1"], "high"),
        file("src/log.ts", ["changed with src/retry.ts"], "high"),
      ]),
    });
    expect(pack.text).toBe(PREPARE_NUDGE);
    expect(pack.shown).toEqual([]);
    expect(pack.reason).toBe("not sure of any file");
    expect(pack.summary).toEqual(["no sure file (asked for prepare_change)"]);
  });

  it("lists a clear top pick (lead) the prompt did not name", () => {
    const pack = buildPromptPack({
      prompt: "make the tray kill skip the prompt",
      prep: prep([
        {
          ...file("src/main/tray.ts", ["matches tray", "seed file"]),
          lead: true,
        },
        file("src/main/os.ts", ["matches tray"]),
      ]),
    });
    expect(pack.text).toContain(
      "Prism · files for this task, from mcp__prism__prepare_change; start with these:",
    );
    expect(pack.text).toContain("- src/main/tray.ts: matches tray, seed file");
    expect(pack.text).not.toContain("src/main/os.ts");
    expect(pack.summary).toEqual(["1 file (tray.ts)"]);
  });

  it("says nothing when the prompt already names every file", () => {
    const pack = buildPromptPack({
      prompt: "in src/retry.ts make the loop stop after five tries",
      prep: prep([file("src/retry.ts", ["named in task"])]),
    });
    expect(pack.text).toBeNull();
    expect(pack.named).toBe(true);
    expect(pack.reason).toBe("the prompt names every file");
    expect(pack.summary).toEqual(["nothing new (you named the files)"]);
  });

  it("session memory: a follow-up gets only what is new", () => {
    const files = [
      file("src/retry.ts", ["named in task"]),
      file("src/loop.ts", ["named in task"]),
    ];
    const first = buildPromptPack({ prompt: "fix retry", prep: prep(files) });
    const surfaced = new Set(first.shown.map((f) => f.path));
    const again = buildPromptPack({
      prompt: "fix retry",
      prep: prep(files),
      surfaced,
    });
    expect(again.text).toBeNull();
    expect(again.reason).toBe("nothing new since earlier in the session");
    expect(again.summary).toEqual(["nothing new (same files as before)"]);

    const delta = buildPromptPack({
      prompt: "also log each retry",
      prep: prep([...files, file("src/log.ts", ["named in task"])]),
      surfaced,
    });
    expect(delta.text).toContain("- src/log.ts");
    expect(delta.text).not.toContain("- src/retry.ts");
    expect(delta.text).toContain("Same as before: src/retry.ts, src/loop.ts");
    // Standing pointer: not repeated after the first block.
    expect(delta.text).not.toContain("House style");
    expect(delta.shown.map((f) => f.path)).toEqual(["src/log.ts"]);
    expect(delta.summary).toEqual(["1 file (log.ts)", "same files as before"]);
  });

  it("a lens alone still speaks when there is no pack", () => {
    const pack = buildPromptPack({
      prompt: "review this diff",
      prep: null,
      lens: { id: "dev", name: "Dev Lens", procedure: "Check reuse." },
    });
    expect(pack.text).toBe("Lens: Dev Lens\nCheck reuse.");
  });

  it("suggests reuse only beside the listed files", () => {
    const hit = (path: string, score: number) => ({
      path,
      symbol: "helper",
      kind: "function",
      score,
      evidence: "",
      provenance: "index",
    });
    const pack = buildPromptPack({
      prompt: "fix retry",
      prep: prep([file("src/net/retry.ts", ["named in task"])], {
        reuse: [
          hit("src/adapter/far.ts", 0.9),
          hit("src/net/weak.ts", 0.3),
          hit("src/net/backoff.ts", 0.7),
        ],
      } as never),
    });
    expect(pack.text).toContain("Reuse: helper (src/net/backoff.ts)");
    expect(pack.text).not.toContain("far.ts");
    expect(pack.text).not.toContain("weak.ts");
  });

  it("names a house-style exemplar only when it sits beside a listed file", () => {
    const far = buildPromptPack({
      prompt: "fix retry",
      prep: prep([file("src/net/retry.ts", ["named in task"])], {
        conventions: [
          { path: "benchmarks/x/express.mts", symbol: "expressRouter" },
        ],
      } as never),
    });
    expect(far.text).not.toContain("House style");
    const near = buildPromptPack({
      prompt: "fix retry",
      prep: prep([file("src/net/retry.ts", ["named in task"])], {
        conventions: [{ path: "src/net/backoff.ts", symbol: "backoff" }],
      } as never),
    });
    expect(near.text).toContain("House style: src/net/backoff.ts (backoff)");
  });

  it("a risky change gets an Architect plan cue; the tool reminders are after the edit (round 4)", () => {
    const safety = buildPromptPack({
      prompt: "remove the confirmation before kill",
      prep: prep([file("src/retry.ts", ["seed file"])]),
    });
    expect(safety.text).toContain(PREPARE_NUDGE);
    expect(safety.text).toContain(
      "Risky change (safety check): plan first with the Architect lens.",
    );
    expect(safety.text).toContain("mcp__prism__prepare_change");
    expect(safety.text).not.toContain("blast_radius");
    expect(safety.text).not.toContain("test_impact");
    expect(safety.summary).toEqual([
      "no sure file (asked for prepare_change)",
      "plan cue (safety check)",
    ]);
    const named = buildPromptPack({
      prompt: "in src/retry.ts make it stop after five tries",
      prep: prep([file("src/retry.ts", ["named in task"])], {
        order: { needsSignOff: ["src/retry.ts"] },
      } as never),
    });
    expect(named.text).toContain("Risky change (high blast: src/retry.ts)");
    const plain = buildPromptPack({
      prompt: "make the retry loop stop after five tries",
      prep: prep([file("src/retry.ts", ["named in task"])]),
    });
    expect(plain.text).not.toContain("Risky change");
  });

  it("changeRisk: safety words, config or settings, high-blast files", () => {
    const p = prep([]);
    expect(changeRisk("skip the confirm dialog", p, [])).toBe("safety check");
    expect(changeRisk("add a toggle to settings", p, [])).toBe(
      "config or settings",
    );
    expect(
      changeRisk("rename the flag", p, [
        file("src/config.ts", ["named in task"]),
      ]),
    ).toBe("config or settings");
    expect(changeRisk("fix the heatmap colors", p, [])).toBeNull();
  });

  it("changeRisk: a fix in a high-blast file gets no plan cue; safety and config still do (round 5)", () => {
    const blast = prep([], {
      order: { needsSignOff: ["src/retry.ts"] },
    } as never);
    const retry = [file("src/retry.ts", ["named in task"])];
    for (const prompt of [
      "Tests listed below fail on this checkout. Fix the source so they pass.",
      "fix the off-by-one in src/retry.ts",
      "src/retry.ts is broken after the last change",
      "the retry bug is back",
    ])
      expect(changeRisk(prompt, blast, retry)).toBeNull();
    expect(
      changeRisk("make src/retry.ts stop after five tries", blast, retry),
    ).toBe("high blast: src/retry.ts");
    expect(changeRisk("fix it: skip the confirm dialog", blast, retry)).toBe(
      "safety check",
    );
    expect(changeRisk("fix the port", blast, [file("src/config.ts", [])])).toBe(
      "config or settings",
    );
  });

  it("changeRisk: a mention or a settings page is not a risky change (website round)", () => {
    const p = prep([]);
    for (const prompt of [
      "Port the product page; Prism reads its config from .prism/config.json",
      "update the settings page layout to match the design",
      "confirm the page renders, then add the hero",
      "Settings.tsx: fix the spacing of the save button",
    ])
      expect(changeRisk(prompt, p, [])).toBeNull();
    expect(
      changeRisk("fix the spacing", p, [
        file("src/views/Settings.tsx", ["named in task"]),
      ]),
    ).toBeNull();
    expect(
      changeRisk("bump the port", p, [file("apps/web/next.config.mjs", [])]),
    ).toBeNull();
    expect(changeRisk("disable the delete guard", p, [])).toBe("safety check");
    expect(changeRisk("turn off the dark mode setting", p, [])).toBe(
      "config or settings",
    );
    expect(changeRisk("bump the port", p, [file("settings.json", [])])).toBe(
      "config or settings",
    );
  });

  it("widensScope spots a follow-up that reaches further", () => {
    expect(widensScope("no confirm for anything anywhere, just do it")).toBe(
      true,
    );
    expect(widensScope("do the same for all the menus")).toBe(true);
    expect(widensScope("rename it to retryOnce")).toBe(false);
    expect(widensScope("install it")).toBe(false);
  });

  it("confidentFile and promptNames", () => {
    expect(confidentFile(file("a.ts", ["named in task"]))).toBe(true);
    expect(
      confidentFile({
        ...file("a.ts", ["seed file"]),
        lead: true,
      } as ContextFile),
    ).toBe(true);
    expect(confidentFile(file("a.ts", ["changed with b.ts"], "high"))).toBe(
      false,
    );
    expect(promptNames("edit retry.ts please", "src/retry.ts")).toBe(true);
    expect(promptNames("edit myretry.ts please", "src/retry.ts")).toBe(false);
  });
});

describe("round 5 prepare_change line", () => {
  it("built for prepare_change: no nudge to call it, the same summary words", () => {
    const unsure = buildPromptPack({
      prompt: "make the retry loop stop after five tries",
      prep: prep([
        file("src/retry.ts", ["matches retry", "seed file"], "high"),
      ]),
      fromTool: true,
    });
    expect(unsure.text).toBeNull();
    expect(unsure.summary).toEqual(["no sure file (read before editing)"]);
    const risky = buildPromptPack({
      prompt: "make the tray kill skip the confirm dialog",
      prep: prep([file("src/tray.ts", ["named in task"])]),
      fromTool: true,
    });
    expect(risky.cue).toHaveLength(1);
    expect(risky.cue[0]).toMatch(/^Risky change \(safety check\)/);
    expect(risky.summary).toContain("plan cue (safety check)");
  });

  it("one line for the user, the lens named once", () => {
    expect(lensLabel("Dev")).toBe("Dev lens");
    expect(lensLabel("Architect lens")).toBe("Architect lens");
    expect(promptSummaryLine(["Dev lens", "1 file (a.ts)"], true)).toBe(
      "Prism · Dev lens + 1 file (a.ts)",
    );
    expect(promptSummaryLine([], true)).toBe("Prism · nothing to add");
    expect(promptSummaryLine([], false)).toBeNull();
  });
});

describe("round 4 partial index", () => {
  it("says the index is partial and how to finish it, instead of a guess", () => {
    const pack = buildPromptPack({
      prompt: "add rate limiting to the card recommendation API endpoint",
      prep: prep([file("src/web/page.tsx", ["matches card"], "low")], {
        partialIndex: { analyzed: 500, total: 900 },
      }),
    });
    expect(pack.text).toBe(
      "Prism · the index is partial (500 of 900 code files), so files outside it are missing. Run `prism index` to finish it.",
    );
    expect(pack.reason).toBe("index is partial");
    expect(pack.shown).toEqual([]);
    expect(pack.text).not.toContain(PREPARE_NUDGE);
  });
});

describe("round 4 tool ids", () => {
  it("names Claude Code's tool id in the nudge, and none in an answer to the tool", () => {
    expect(PREPARE_NUDGE).toContain(
      "Call mcp__prism__prepare_change with the task",
    );
    const files = [
      { ...file("src/main/tray.ts", ["matches tray"]), lead: true },
    ] as ContextFile[];
    const hook = buildPromptPack({ prompt: "fix the tray", prep: prep(files) });
    expect(hook.text).toMatch(
      /^Prism · files for this task, from mcp__prism__prepare_change; start with these:/,
    );
    const tool = buildPromptPack({
      prompt: "fix the tray",
      prep: prep(files),
      fromTool: true,
    });
    expect(tool.text).toMatch(/^Prism · files for this task:/);
  });
});
