#!/usr/bin/env node
/**
 * B7 prompt-classifier benchmark (plan §5.11, §9.6).
 *
 * Corpus = public synthetic subset (scripts/bench/classifier/synthetic.jsonl)
 * plus, when present, the owner's private corpus at $PRISM_DEV_CORPUS
 * (default ~/.prism-dev/classifier-corpus/corpus.jsonl; decision 23: never
 * committed, only aggregate metrics are written).
 *
 * Positive class = prompts that should get a Prepare pack (label change|bug).
 * Metrics: change recall, question false-positive rate, chit-chat FP rate,
 * non-English "no pack" rate.
 *
 *   node scripts/bench/classifier-eval.mjs [--classifier hook-regex|module] [--out file]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
};

const readJsonl = (file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

async function loadClassifier(kind) {
  if (kind === "hook-regex") {
    // 1.x baseline: the CHANGE_VERB regex inlined in the hook script.
    const src = readFileSync(
      join(repoRoot, "packages/plugin/hooks/prism-hook.mjs"),
      "utf8",
    );
    const m = src.match(/const CHANGE_VERB =\s*\/(.+)\/([a-z]*);/);
    if (!m)
      throw new Error(
        "classifier-eval: CHANGE_VERB not found in prism-hook.mjs",
      );
    const re = new RegExp(m[1], m[2]);
    return (text) => ({ pack: re.test(text) });
  }
  const mod = await import(
    pathToFileURL(join(repoRoot, "packages/plugin/hooks/classify-prompt.mjs"))
      .href
  );
  return (text) => {
    const r = mod.classifyPrompt(text);
    return { pack: r.kind === "change" };
  };
}

const kind = arg("classifier", "hook-regex");
const classify = await loadClassifier(kind);
const sets = { synthetic: readJsonl(join(here, "classifier/synthetic.jsonl")) };
const privatePath =
  process.env.PRISM_DEV_CORPUS ??
  join(homedir(), ".prism-dev/classifier-corpus/corpus.jsonl");
if (existsSync(privatePath)) sets.owner = readJsonl(privatePath);

const rate = (xs, pred) =>
  xs.length === 0 ? null : xs.filter(pred).length / xs.length;
const round = (x) => (x === null ? null : Math.round(x * 1000) / 1000);

function score(rows) {
  const en = rows.filter((r) => r.lang === "en");
  const other = rows.filter((r) => r.lang !== "en");
  const pos = en.filter((r) => r.label === "change" || r.label === "bug");
  const byLabel = (l) => en.filter((r) => r.label === l);
  const packed = (r) => classify(r.text).pack;
  return {
    total: rows.length,
    english: en.length,
    nonEnglish: other.length,
    changeRecall: round(rate(pos, packed)),
    questionFalsePositive: round(rate(byLabel("question"), packed)),
    chitchatFalsePositive: round(rate(byLabel("chitchat"), packed)),
    reviewPacked: round(rate(byLabel("review"), packed)),
    nonEnglishNoPack: round(rate(other, (r) => !packed(r))),
  };
}

const result = {
  benchmark: "B7-classifier",
  classifier: kind,
  recordedAt: new Date().toISOString(),
  gate: {
    changeRecall: 0.95,
    questionFalsePositive: 0.05,
    nonEnglishNoPack: 1,
  },
  sets: Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, score(v)])),
  combined: score(Object.values(sets).flat()),
};
const out = arg("out", null);
if (out) writeFileSync(resolve(out), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
