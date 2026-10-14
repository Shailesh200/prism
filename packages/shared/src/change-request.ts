/**
 * Does a prompt ask for a code change? (ADR-0065, plan §5.8 H-PROMPT)
 *
 * The prompt classifier's answer (`classifyPrompt`): an English change verb,
 * a symptom, or a polite request. Whether the prompt names anything in the
 * repo is Prepare's call afterwards (`prepareIsAnchored`), so a vague ask
 * ("make it pretty") passes here and is dropped there (HK-5).
 */
import { classifyPrompt } from "./classify-prompt.js";

export function looksLikeChangeRequest(prompt: string): boolean {
  return classifyPrompt(prompt).kind === "change";
}
