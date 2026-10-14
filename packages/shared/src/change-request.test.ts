import { describe, expect, it } from "vitest";
import { looksLikeChangeRequest } from "./change-request.js";

describe("looksLikeChangeRequest", () => {
  it.each([
    "add caching to fetchUser",
    "fix the off-by-one in packages/core/src/workspace.ts",
    "rename guardSession to checkSession across the repo",
    "Refactor `renderReceipt` so the verdict comes first",
    "can you add a --json flag to prism receipts in receipts.ts?",
    "make the stop hook work when cwd is missing in prism-hook.mjs",
    "remove the jobs_app resource",
  ])("triggers on a change request: %s", (prompt) => {
    expect(looksLikeChangeRequest(prompt)).toBe(true);
  });

  it.each([
    "what does fetchUser do?",
    "explain how prepareChange ranks files",
    "why is guardSession slow",
    "how do I run the tests",
    "add some tests",
    "thanks, looks good",
    "is renderReceipt used anywhere?",
  ])("stays quiet on a question or a vague ask: %s", (prompt) => {
    expect(looksLikeChangeRequest(prompt)).toBe(false);
  });
});
