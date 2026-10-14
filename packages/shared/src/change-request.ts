/**
 * Does a prompt ask for a code change? (ADR-0065, M-093)
 *
 * Deterministic and local: a change verb, no leading question, and at least
 * one concrete anchor (a path, a file name, or a code identifier). The hook
 * then asks Prepare, which confirms the anchor exists in the graph. No model.
 */

const CHANGE_VERB =
  /\b(fix|fixes|fixing|add|adds|adding|rename|refactor|implement|remove|delete|drop|migrate|port|update|change|replace|introduce|extract|move|wire|support|create|build|write|rewrite|convert|split|merge|handle|make\b[^.?!]{0,40}\bwork)\b/i;

const QUESTION_START =
  /^\s*(what|why|how|where|when|who|which|explain|describe|summari[sz]e|tell me|show me|walk me through|can you explain|could you explain|is there|are there|does|do|did|is|are|should|would)\b/i;

const PATH_LIKE =
  /(?:^|[\s`'"(])(?:[\w.-]+\/)+[\w.-]+|\b[\w-]+\.(?:[cm]?[jt]sx?|json|md|ya?ml|css|scss|py|go|rs)\b/;
const IDENTIFIER =
  /`[^`]+`|\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b|\b[a-z0-9]+_[a-z0-9_]+\b/;

export function looksLikeChangeRequest(prompt: string): boolean {
  const text = prompt.trim();
  if (text.length < 8 || text.length > 4000) return false;
  const firstClause = text.split(/[.!\n]/)[0] ?? text;
  if (QUESTION_START.test(firstClause) && !CHANGE_VERB.test(firstClause)) {
    return false;
  }
  if (
    /\?\s*$/.test(firstClause) &&
    !/^\s*(can|could|would|will) you\b/i.test(firstClause)
  ) {
    return false;
  }
  if (!CHANGE_VERB.test(text)) return false;
  return PATH_LIKE.test(text) || IDENTIFIER.test(text);
}
