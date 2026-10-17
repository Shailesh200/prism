import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { classifyPrompt } from "./classify-prompt.js";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(
  here,
  "..",
  "..",
  "..",
  "scripts",
  "bench",
  "classifier",
  "synthetic.jsonl",
);

describe("classify-prompt.mjs contract", () => {
  it("answers exactly like @repo-prism/shared classifyPrompt", async () => {
    const hook = (await import(
      pathToFileURL(
        join(here, "..", "..", "plugin", "hooks", "classify-prompt.mjs"),
      ).href
    )) as { classifyPrompt: typeof classifyPrompt };
    const prompts = readFileSync(corpus, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { text: string }).text);
    prompts.push("Yes, go ahead", "डैशबोर्ड ठीक करो", "do 1 & 2", "");
    for (const prompt of prompts) {
      expect(hook.classifyPrompt(prompt)).toEqual(classifyPrompt(prompt));
    }
  });
});
