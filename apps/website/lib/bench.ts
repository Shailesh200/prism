/**
 * Real-agent results, with and without Prism, as raw values. Every change
 * shown on the site is computed from these, never typed in. Sources are in
 * .bench/web/design/FACTS.md: docs/benchmarks/2.x.md (B6) and the Round 2 /
 * Round 3 sections of plans/notes/prism-2-next-change-report.md, whose
 * Cursor agent rows were recomputed from
 * plans/notes/benchmark-real-agents/{runs,grades}-r2{,fix}-agent.jsonl.
 */

export type Val = { v: number; text: string };
export type Better = "higher" | "lower";
export type Measure = {
  label: string;
  without: Val;
  with: Val;
  better: Better;
};
export type Group = {
  tool: string;
  model: string;
  run: string;
  measures: Measure[];
  note?: string;
};

const en = (n: number) => n.toLocaleString("en-US");
export const of = (n: number, d: number): Val => ({
  v: n / d,
  text: `${n} of ${d}`,
});
export const tok = (n: number): Val => ({ v: n, text: en(n) });
export const ktok = (k: number): Val => ({ v: k * 1000, text: `${k}k` });
export const grade = (g: number): Val => ({ v: g, text: g.toFixed(2) });
export const usd = (d: number): Val => ({ v: d, text: `$${d.toFixed(3)}` });
export const sec = (s: number): Val => ({ v: s, text: `${s} s` });

/** Relative change with Prism against without, in percent; null when "without" is 0. */
export function change(m: Pick<Measure, "without" | "with">): number | null {
  if (m.without.v === 0) return null;
  return ((m.with.v - m.without.v) / m.without.v) * 100;
}

export type Verdict = "win" | "loss" | "tie";

export function verdict(m: Measure): Verdict {
  const c = change(m);
  if (c === null)
    return m.with.v > 0 === (m.better === "higher") ? "win" : "loss";
  if (Math.abs(c) < 0.5) return "tie";
  return c > 0 === (m.better === "higher") ? "win" : "loss";
}

/** "−28 %", "+33 %", "same". */
export function formatChange(m: Measure): string {
  const c = change(m);
  if (c === null) return "new";
  if (Math.abs(c) < 0.5) return "same";
  return `${c > 0 ? "+" : "−"}${Math.round(Math.abs(c))} %`;
}

const m = (
  label: string,
  without: Val,
  withPrism: Val,
  better: Better,
): Measure => ({ label, without, with: withPrism, better });

export const OPENCODE_R3_TOKENS = m(
  "Median tokens",
  ktok(574),
  ktok(414),
  "lower",
);
export const CURSOR_REVIEW_FOUND = m(
  "Seeded problems found",
  of(3, 7),
  of(4, 7),
  "higher",
);
export const CURSOR_REVIEW_TOKENS = m(
  "Median tokens",
  tok(979_394),
  tok(670_605),
  "lower",
);
export const OPENCODE_B6_SOLVED = m(
  "Tasks solved",
  of(7, 11),
  of(8, 11),
  "higher",
);
export const OPENCODE_B6_TOKENS = m(
  "Median tokens",
  tok(549_036),
  tok(407_487),
  "lower",
);
export const HABITS_RAN = m("Habits that ran", of(0, 6), of(6, 6), "higher");

export const GROUPS: Group[] = [
  {
    tool: "Claude Code",
    model: "claude-opus-5-5",
    run: "11 small fixes",
    measures: [
      m("Tasks solved", of(11, 11), of(11, 11), "higher"),
      m("Median tokens", tok(144_373), tok(134_414), "lower"),
      m("Median time", sec(42), sec(42), "lower"),
      m("Median cost", usd(0.168), usd(0.185), "lower"),
    ],
    note: "Claude Code did not call Prism’s tools in these 11 runs.",
  },
  {
    tool: "Claude Code",
    model: "claude-opus-5-5",
    run: "Review, 11 seeded problems",
    measures: [m("Seeded problems found", of(10, 11), of(10, 11), "higher")],
  },
  {
    tool: "Claude Code",
    model: "claude-opus-5-5",
    run: "9 follow-ups, three turns",
    measures: [
      m("Correctness (1–5)", grade(4.56), grade(4.44), "higher"),
      m("Minimalism (1–5)", grade(4.44), grade(3.89), "higher"),
      m("Tests pass", of(9, 9), of(8, 9), "higher"),
      m("Median tokens", ktok(535), ktok(548), "lower"),
    ],
    note: "Grader preferred without Prism 3 times, with Prism once, 5 ties.",
  },
  {
    tool: "Cursor agent CLI",
    model: "grok-4.7-high",
    run: "Review, 7 seeded problems",
    measures: [
      CURSOR_REVIEW_FOUND,
      CURSOR_REVIEW_TOKENS,
      m("Median time", sec(607), sec(469), "lower"),
    ],
    note: "4 sessions each way.",
  },
  {
    tool: "Cursor agent CLI",
    model: "grok-4.7-high",
    run: "Larger fixes",
    measures: [
      m("Solved", of(4, 4), of(3, 3), "higher"),
      m("Correctness (1–5)", grade(5), grade(5), "higher"),
      m("Minimalism (1–5)", grade(4.6), grade(4.67), "higher"),
      m("Median time", sec(316), sec(294), "lower"),
      m("Median tokens", tok(1_328_142), tok(1_455_138), "lower"),
    ],
    note: "4 sessions without, 3 with. Graded pairs: 4 ties, 1 preferred without.",
  },
  {
    tool: "Cursor agent CLI",
    model: "grok-4.7-high",
    run: "Follow-ups, three turns",
    measures: [
      m("Solved", of(2, 2), of(2, 2), "higher"),
      m("Median time", sec(780), sec(679), "lower"),
      m("Median tokens", tok(2_283_649), tok(3_764_972), "lower"),
    ],
    note: "2 sessions each way, both graded ties.",
  },
  {
    tool: "opencode",
    model: "mimo-v2.6-flash-free",
    run: "11 small fixes, quality graded blind",
    measures: [
      OPENCODE_R3_TOKENS,
      m("Tests pass", of(8, 11), of(8, 11), "higher"),
      m("Minimalism (1–5)", grade(4.36), grade(4.36), "higher"),
      m("Style (1–5)", grade(4.36), grade(4.09), "higher"),
      m("Correctness (1–5)", grade(4.64), grade(4.27), "higher"),
    ],
    note: "Grader preferred without Prism 4 times, with Prism 2, 5 ties.",
  },
  {
    tool: "opencode",
    model: "mimo-v2.6-flash-free",
    run: "11 small fixes, solve rate",
    measures: [OPENCODE_B6_SOLVED, OPENCODE_B6_TOKENS],
  },
];
