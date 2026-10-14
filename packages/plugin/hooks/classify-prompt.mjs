/**
 * Dependency-free copy of `@repo-prism/shared` `classifyPrompt` for the hook
 * (plan §5.11). Generated from packages/shared/src/classify-prompt.ts by
 * `bun build --target=node --format=esm`; `classify-prompt.contract.test.ts`
 * holds the two to the same answers. Do not edit by hand: regenerate.
 */
var CHANGE_VERBS = [
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
];
var VERB = new RegExp(`^(?:${CHANGE_VERBS.join("|")})$`, "i");
var GO_AHEAD =
  /^(?:go ahead|carry on|keep going|move on to|do it\b|do (?:that|this|both|all|the rest|\d))/i;
var SYMPTOM =
  /\b(crash(?:es|ed|ing)?|hangs?|hung|freez(?:e|es|ing)|broken|breaks?\b|fail(?:s|ed|ing)?|throws?|threw|errors?\b|exception|bug(?:gy|s)?|wrong|incorrect|off[- ]by[- ]one|leaks?|regress(?:ed|ion)?|swallows?|stuck|flaky|not working|doesn'?t work|does not work|isn'?t working|no longer works?|instead of|typeerror|referenceerror|undefined is not|cannot read propert|unreachable|not able to|unable to|can'?t (?:see|open|load|find|refresh|save|connect|log ?in)|(?:not|isn'?t|aren'?t) (?:shown|showing|loading|updating|rendering|visible)|nothing (?:shows|happens|loads)|\bno \w+(?: \w+)? (?:shown|found|showing|visible|rendered))/i;
var BARE_ACK =
  /^(?:(?:yes|yeah|yep|ok|okay|sure|great|cool)[,!.\s]*)?(?:go ahead|continue|proceed|carry on|keep going|do it)[.!\s]*$/i;
var DESIRE =
  /\b(?:can|could|would|will) (?:you|we) (?:please )?(show me|\w+)|\b(?:let'?s|lets|please|(?:we|i) (?:need|want|would like)|i'd like|needs? (?:a|an|to|more)\b|should (?:\w+)|must (?:\w+)|has to|have to)\b/i;
var REVIEW =
  /\b(review|look over|look at my|double[- ]check|sanity[- ]check|audit|code review|before i (?:push|merge|open|ship|commit)|safe to (?:merge|ship|land)|any concerns|anything risky|did i (?:break|miss)|what did i break|need more tests\??|pr review)\b/i;
var QUESTION_START =
  /^(what|why|how|where|when|who|whom|which|whose|explain|describe|summari[sz]e|tell me|show me how|walk me through|is|are|was|were|does|do|did|has|have|should i|would it|could it|can i|am i)\b/i;
var PLEASANTRY =
  /^(hi|hello|hey|thanks|thank you|thx|ok|okay|cool|nice|great|good (?:morning|evening|night|job|work)|sounds good|got it|perfect|awesome|yes|no|sure|lgtm|bye)\b/i;
var ENGLISH_WORDS = new Set([
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
var FOREIGN_WORDS = new Set([
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
function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " CODE ")
    .replace(/(?:[\w.-]+\/)+[\w.-]+/g, " PATH ");
}
function words(text) {
  return text.toLowerCase().match(/[\p{L}'][\p{L}'-]*/gu) ?? [];
}
function isNonEnglish(prompt) {
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
function clauses(text) {
  return text
    .split(/(?<=[.!?;:])\s+|\n+|,\s+(?=(?:and |then |also |please )?\w)/)
    .map((c) => c.trim().replace(/^(?:and|then|also|so|but)\s+/i, ""))
    .filter(Boolean);
}
function isQuestion(clause) {
  return /\?\s*$/.test(clause) || QUESTION_START.test(clause);
}
function imperative(clause) {
  if (/\?\s*$/.test(clause)) return false;
  const opened = clause.replace(
    /^(?:please|pls|now|ok|okay|hey|so|just|quickly|also)\b[\s,]*/i,
    "",
  );
  if (GO_AHEAD.test(opened)) return true;
  const first = opened.split(/\s+/)[0];
  return first !== undefined && VERB.test(first.replace(/[^\w]/g, ""));
}
function wantsChange(clause) {
  const match = DESIRE.exec(clause);
  if (!match) return false;
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
function classifyPrompt(prompt) {
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
var NON_ENGLISH_NOTE =
  "Prism understands English prompts only in 2.0; no pack added.";
export { isNonEnglish, classifyPrompt, NON_ENGLISH_NOTE };
