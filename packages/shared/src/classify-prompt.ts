/**
 * Prompt classifier for the prompt hook (plan §5.8 H-PROMPT, §5.11).
 *
 * Deterministic, local, English only. Order of the rules:
 *   1. empty or tiny → chitchat
 *   2. not English (mostly non-Latin script, or more foreign than English
 *      function words) → non_english: no pack, one note
 *   3. a review request → review (the review path, no pack)
 *   4. any imperative change or symptom clause → change (gets a pack)
 *   5. a question → question (no pack)
 *   6. short pleasantries → chitchat
 *   7. otherwise → other (no pack)
 * Prepare then decides whether anything in the repo matches (HK-5).
 *
 * `packages/plugin/hooks/classify-prompt.mjs` is a dependency-free copy for
 * the hook; `classify-prompt.contract.test.ts` holds the two to the same
 * answers.
 */

export type PromptKind =
  | "change"
  /** A change too small to need Prism context (typo, wording, formatting). */
  | "trivial"
  | "review"
  | "question"
  | "chitchat"
  | "non_english"
  | "other";

export type PromptClass = {
  readonly kind: PromptKind;
  /** Which rule decided, for the event log. */
  readonly rule: string;
};

/** Change verbs at the start of a clause (imperative), base form. */
const CHANGE_VERBS = [
  "add",
  "adjust",
  "allow",
  "apply",
  "build",
  "bump",
  "change",
  "clean",
  "cleanup",
  "complete",
  "continue",
  "finish",
  "proceed",
  "redo",
  "trigger",
  "convert",
  "create",
  "debounce",
  "delete",
  "deprecate",
  "disable",
  "document",
  "drop",
  "enable",
  "ensure",
  "expose",
  "extend",
  "extract",
  "fix",
  "format",
  "reformat",
  "generate",
  "handle",
  "hide",
  "implement",
  "improve",
  "increase",
  "inline",
  "insert",
  "introduce",
  "limit",
  "log",
  "lower",
  "make",
  "memoize",
  "merge",
  "migrate",
  "move",
  "optimize",
  "optimise",
  "patch",
  "persist",
  "port",
  "prevent",
  "raise",
  "reduce",
  "refactor",
  "remove",
  "rename",
  "reorder",
  "replace",
  "repair",
  "resolve",
  "restore",
  "restructure",
  "retry",
  "return",
  "revert",
  "rewrite",
  "set",
  "show",
  "simplify",
  "sort",
  "split",
  "stop",
  "store",
  "support",
  "swap",
  "switch",
  "throttle",
  "tidy",
  "turn",
  "tweak",
  "update",
  "upgrade",
  "use",
  "validate",
  "wire",
  "wrap",
  "write",
] as const;

/** Base form only: "add the flag" is a request, "adding the flag" is not. */
const VERB = new RegExp(`^(?:${CHANGE_VERBS.join("|")})$`, "i");

/** Clause openers that ask to carry on with work already agreed. */
const GO_AHEAD =
  /^(?:go ahead|carry on|keep going|move on to|do it\b|do (?:that|this|both|all|the rest|\d))/i;

/** Symptoms: a bug described, not a verb asked for (HK-3). */
const SYMPTOM =
  /\b(crash(?:es|ed|ing)?|hangs?|hung|freez(?:e|es|ing)|broken|breaks?\b|fail(?:s|ed|ing)?|throws?|threw|errors?\b|exception|bug(?:gy|s)?|wrong|incorrect|off[- ]by[- ]one|leaks?|regress(?:ed|ion)?|swallows?|stuck|flaky|not working|doesn'?t work|does not work|isn'?t working|no longer works?|instead of|typeerror|referenceerror|undefined is not|cannot read propert|unreachable|not able to|unable to|can'?t (?:see|open|load|find|refresh|save|connect|log ?in)|(?:not|isn'?t|aren'?t) (?:shown|showing|loading|updating|rendering|visible)|nothing (?:shows|happens|loads)|\bno \w+(?: \w+)? (?:shown|found|showing|visible|rendered))/i;

/** A bare go-ahead with nothing to act on: an acknowledgement. */
const BARE_ACK =
  /^(?:(?:yes|yeah|yep|ok|okay|sure|great|cool)[,!.\s]*)?(?:go ahead|continue|proceed|carry on|keep going|do it)[.!\s]*$/i;

/** Wanting a change, not asking about one. */
const DESIRE =
  /\b(?:can|could|would|will) (?:you|we) (?:please )?(show me|\w+)|\b(?:let'?s|lets|please|(?:we|i) (?:need|want|would like)|i'd like|needs? (?:a|an|to|more)\b|should (?:\w+)|must (?:\w+)|has to|have to)\b/i;

const REVIEW =
  /\b(review|look over|look at my|double[- ]check|sanity[- ]check|audit|code review|before i (?:push|merge|open|ship|commit)|safe to (?:merge|ship|land)|any concerns|anything risky|did i (?:break|miss)|what did i break|need more tests\??|pr review)\b/i;

const QUESTION_START =
  /^(what|why|how|where|when|who|whom|which|whose|explain|describe|summari[sz]e|tell me|show me how|walk me through|is|are|was|were|does|do|did|has|have|should i|would it|could it|can i|am i)\b/i;

const PLEASANTRY =
  /^(hi|hello|hey|thanks|thank you|thx|ok|okay|cool|nice|great|good (?:morning|evening|night|job|work)|sounds good|got it|perfect|awesome|yes|no|sure|lgtm|bye)\b/i;

/** Function words that only English uses (ambiguous ones like "in" left out). */
const ENGLISH_WORDS = new Set([
  "the",
  "and",
  "of",
  "to",
  "is",
  "it",
  "that",
  "this",
  "with",
  "for",
  "on",
  "be",
  "are",
  "was",
  "when",
  "what",
  "why",
  "how",
  "where",
  "which",
  "who",
  "should",
  "would",
  "could",
  "can",
  "will",
  "not",
  "my",
  "your",
  "its",
  "from",
  "into",
  "by",
  "or",
  "if",
  "then",
  "so",
  "but",
  "we",
  "you",
  "i",
  "me",
  "our",
  "they",
  "there",
  "here",
  "after",
  "before",
  "because",
  "every",
  "all",
  "any",
  "some",
  "more",
  "less",
  "out",
  "up",
  "down",
  "just",
  "only",
  "also",
  "does",
  "did",
  "has",
  "have",
  "had",
  "been",
  "being",
  "an",
  "a",
  "please",
  "it's",
  "don't",
  "doesn't",
  "isn't",
  "make",
  "add",
  "fix",
  "use",
  "new",
  "old",
  "same",
  "other",
  "each",
  "than",
  "too",
  "very",
  "now",
]);

/**
 * Function words and common coding imperatives of other languages written
 * in Latin script (French, German, Spanish, Portuguese, Italian, Turkish,
 * Indonesian, Hindi/Urdu in Latin script). Words shared with English are left
 * out.
 */
const FOREIGN_WORDS = new Set([
  // French
  "le",
  "la",
  "les",
  "une",
  "des",
  "du",
  "dans",
  "pour",
  "avec",
  "sur",
  "est",
  "et",
  "ajoute",
  "ajouter",
  "corrige",
  "corriger",
  "supprime",
  "renomme",
  "il",
  "elle",
  "ne",
  "pas",
  "qui",
  "que",
  // German
  "der",
  "das",
  "den",
  "dem",
  "ein",
  "eine",
  "einen",
  "und",
  "ist",
  "nicht",
  "mit",
  "für",
  "zu",
  "hinzu",
  "füge",
  "behebe",
  "ändere",
  "lösche",
  "fehler",
  "bitte",
  // Spanish / Portuguese / Italian
  "el",
  "los",
  "las",
  "una",
  "un",
  "del",
  "en",
  "con",
  "por",
  "para",
  "es",
  "y",
  "añade",
  "agrega",
  "arregla",
  "corrige",
  "elimina",
  "cambia",
  "refactoriza",
  "adicione",
  "adiciona",
  "corrija",
  "em",
  "um",
  "uma",
  "não",
  "aggiungi",
  "correggi",
  "il",
  "di",
  "che",
  "falla",
  "registro",
  // Turkish / Indonesian
  "için",
  "bir",
  "ve",
  "yaz",
  "ekle",
  "düzelt",
  "dan",
  "yang",
  "tambahkan",
  "perbaiki",
  "untuk",
  // Hindi / Urdu in Latin script
  "ko",
  "karo",
  "kar",
  "karna",
  "nahi",
  "nahin",
  "hai",
  "hain",
  "ka",
  "ki",
  "ke",
  "mein",
  "theek",
  "thik",
  "badal",
  "raha",
  "rahi",
  "kaam",
  "banao",
  "hatao",
  "jodo",
  "sahi",
  "kya",
  "kyun",
  "aur",
]);

function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " CODE ")
    .replace(/(?:[\w.-]+\/)+[\w.-]+/g, " PATH ");
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}'][\p{L}'-]*/gu) ?? [];
}

/** True when the prompt is not English (plan §5.8 H-PROMPT, HK-4). */
export function isNonEnglish(prompt: string): boolean {
  const text = stripCode(prompt);
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  const latin = letters.filter((c) => /[A-Za-z\u00C0-\u024F]/.test(c));
  if (latin.length / letters.length < 0.7) return true;
  let english = 0;
  let foreign = 0;
  for (const word of words(text)) {
    if (ENGLISH_WORDS.has(word)) english += 1;
    else if (FOREIGN_WORDS.has(word)) foreign += 1;
    else if (/[\u00C0-\u024F]/.test(word)) foreign += 1;
  }
  if (foreign === 0) return false;
  return foreign >= english;
}

/** Clauses split on sentence ends, semicolons, "and then", and commas. */
function clauses(text: string): string[] {
  return text
    .split(/(?<=[.!?;:])\s+|\n+|,\s+(?=(?:and |then |also |please )?\w)/)
    .map((c) => c.trim().replace(/^(?:and|then|also|so|but)\s+/i, ""))
    .filter(Boolean);
}

function isQuestion(clause: string): boolean {
  return /\?\s*$/.test(clause) || QUESTION_START.test(clause);
}

/** An imperative change: the clause opens with a change verb, no "?". */
function imperative(clause: string): boolean {
  if (/\?\s*$/.test(clause)) return false;
  const opened = clause.replace(
    /^(?:please|pls|now|ok|okay|hey|so|just|quickly|also)\b[\s,]*/i,
    "",
  );
  if (GO_AHEAD.test(opened)) return true;
  const first = opened.split(/\s+/)[0];
  return first !== undefined && VERB.test(first.replace(/[^\w]/g, ""));
}

function wantsChange(clause: string): boolean {
  const match = DESIRE.exec(clause);
  if (!match) return false;
  // "can you explain …" is a question in polite form, not a change.
  const verb = match[1]?.toLowerCase();
  if (
    verb &&
    /^(explain|tell|describe|show me|help|walk|summari[sz]e|find|check|list|clarify)$/.test(
      verb,
    )
  ) {
    return false;
  }
  return true;
}

/** Cosmetic, single-spot edits (plan P5). Precision first: any doubt → not trivial. */
const TRIVIAL =
  /\b(?:typos?|spelling|misspell(?:ed|ing)?|whitespace|indentation|re-?indent|formatting|reformat|trailing (?:whitespace|spaces?|commas?)|semicolons?|lint (?:errors?|warnings?)|wording|comments?|docstrings?|log message|bump (?:the )?version|version bump|capitali[sz]ation|punctuation)\b/i;
const NOT_TRIVIAL =
  /\b(?:all|every|everywhere|across|each|codebase|whole|entire|repo|project|bug|crash\w*|broken|fails?|failing|exceptions?|regression|feature|endpoint|api|tests?|logic|behaviou?r|refactor\w*|migrat\w*|system|module|support|implement\w*)\b/i;

export function isTrivialChange(plain: string): boolean {
  return (
    words(plain).length <= 14 && TRIVIAL.test(plain) && !NOT_TRIVIAL.test(plain)
  );
}

export function classifyPrompt(prompt: string): PromptClass {
  const verdict = classifyBase(prompt);
  if (verdict.kind === "change" && isTrivialChange(stripCode(prompt.trim()))) {
    return { kind: "trivial", rule: "trivial" };
  }
  return verdict;
}

function classifyBase(prompt: string): PromptClass {
  const text = prompt.trim();
  if (text.length < 2) return { kind: "chitchat", rule: "empty" };
  if (isNonEnglish(text)) return { kind: "non_english", rule: "language" };
  const plain = stripCode(text);
  if (REVIEW.test(plain)) return { kind: "review", rule: "review" };

  if (BARE_ACK.test(plain))
    return { kind: "chitchat", rule: "acknowledgement" };
  const parts = clauses(plain);
  for (const clause of parts) {
    if (imperative(clause)) return { kind: "change", rule: "imperative" };
  }
  const questions = parts.filter(isQuestion);
  for (const clause of parts) {
    if (questions.includes(clause)) {
      // A polite request phrased as a question still asks for a change.
      if (
        /^(?:can|could|would|will) (?:you|we)\b/i.test(clause) &&
        wantsChange(clause)
      ) {
        return { kind: "change", rule: "polite-request" };
      }
      continue;
    }
    if (SYMPTOM.test(clause)) return { kind: "change", rule: "symptom" };
    if (wantsChange(clause)) return { kind: "change", rule: "desire" };
  }
  if (questions.length > 0) return { kind: "question", rule: "question" };
  if (PLEASANTRY.test(plain) && words(plain).length <= 4) {
    return { kind: "chitchat", rule: "pleasantry" };
  }
  return { kind: "other", rule: "no-signal" };
}

/** The one line the prompt hook shows once per session for HK-4. */
export const NON_ENGLISH_NOTE =
  "Prism understands English prompts only in 2.0; no pack added.";
