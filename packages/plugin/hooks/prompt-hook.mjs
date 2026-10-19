/**
 * Dependency-free copy of `@repo-prism/shared/prompt-hook` for the hook, so a
 * prompt costs one Node process. Generated from
 * packages/shared/src/prompt-hook.ts by `bun run gen:prompt-hook`
 * (packages/plugin); `prompt-hook.contract.test.ts` holds the two to the same
 * answers. Do not edit by hand: regenerate.
 */
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name),
    });
};

// ../shared/src/prompt-hook.ts
import { createHash as createHash3 } from "node:crypto";
import {
  mkdirSync as mkdirSync4,
  readFileSync as readFileSync2,
  writeFileSync as writeFileSync2,
} from "node:fs";
import {
  dirname as dirname2,
  join as join5,
  resolve as resolve2,
} from "node:path";

// ../shared/src/classify-prompt.ts
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
var TRIVIAL =
  /\b(?:typos?|spelling|misspell(?:ed|ing)?|whitespace|indentation|re-?indent|formatting|reformat|trailing (?:whitespace|spaces?|commas?)|semicolons?|lint (?:errors?|warnings?)|wording|comments?|docstrings?|log message|bump (?:the )?version|version bump|capitali[sz]ation|punctuation)\b/i;
var NOT_TRIVIAL =
  /\b(?:all|every|everywhere|across|each|codebase|whole|entire|repo|project|bug|crash\w*|broken|fails?|failing|exceptions?|regression|feature|endpoint|api|tests?|logic|behaviou?r|refactor\w*|migrat\w*|system|module|support|implement\w*)\b/i;
function isTrivialChange(plain) {
  return (
    words(plain).length <= 14 && TRIVIAL.test(plain) && !NOT_TRIVIAL.test(plain)
  );
}
function classifyPrompt(prompt) {
  const verdict = classifyBase(prompt);
  if (verdict.kind === "change" && isTrivialChange(stripCode(prompt.trim()))) {
    return { kind: "trivial", rule: "trivial" };
  }
  return verdict;
}
function classifyBase(prompt) {
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

// ../shared/src/events.ts
import {
  appendFileSync,
  mkdirSync as mkdirSync2,
  renameSync as renameSync2,
  rmSync as rmSync2,
  statSync as statSync2,
} from "node:fs";
import { join as join2 } from "node:path";

// ../shared/src/prism-home.ts
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
function prismHomeDir(env = process.env) {
  const override = env.PRISM_HOME?.trim();
  if (override) return override;
  if (useLocalPrismStore(env))
    return join(tmpdir(), `prism-test-home-${process.pid}`);
  return join(homedir(), ".prism");
}
function useLocalPrismStore(env = process.env) {
  if (env.VITEST === "true" && !env.PRISM_HOME?.trim()) return true;
  if (env.BUN_TEST === "1" && !env.PRISM_HOME?.trim()) return true;
  return false;
}
function canonicalRoot(workspaceRoot) {
  try {
    return realpathSync.native(workspaceRoot);
  } catch {
    return resolve(workspaceRoot);
  }
}
function workspaceKey(workspaceRoot) {
  return createHash("sha256")
    .update(canonicalRoot(workspaceRoot))
    .digest("hex")
    .slice(0, 24);
}
function legacyRepoPrismDir(workspaceRoot) {
  return join(resolve(workspaceRoot), ".prism");
}
function workspacePrismDir(workspaceRoot, env = process.env) {
  if (useLocalPrismStore(env)) return legacyRepoPrismDir(workspaceRoot);
  return join(prismHomeDir(env), "workspaces", workspaceKey(workspaceRoot));
}
var PENDING_JOB_FILES = new Set(["jobs.json", "jobs.json.migrated"]);
var PENDING_DISPATCH_DIRS = new Set(["worktrees"]);

// ../shared/src/events.ts
var EVENTS_MAX_BYTES = 5 * 1024 * 1024;
var EVENTS_GENERATIONS = 3;
function eventsPath(env = process.env) {
  return join2(prismHomeDir(env), "events.jsonl");
}
function rotateLog(path, maxBytes, generations = EVENTS_GENERATIONS) {
  let size;
  try {
    size = statSync2(path).size;
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (size < maxBytes) return;
  rmSync2(`${path}.${generations - 1}`, { force: true });
  for (let n = generations - 2; n >= 1; n -= 1) {
    try {
      renameSync2(`${path}.${n}`, `${path}.${n + 1}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  renameSync2(path, `${path}.1`);
}
function recordEvent(input, options = {}) {
  if (input.outcome !== "ok" && !input.reason) {
    throw new Error(
      `event ${input.event}: outcome ${input.outcome} needs a reason`,
    );
  }
  const path = eventsPath(options.env);
  const line = {
    ts: (options.now ?? new Date()).toISOString(),
    pid: process.pid,
    ...input,
  };
  try {
    mkdirSync2(prismHomeDir(options.env), { recursive: true, mode: 448 });
    rotateLog(path, options.maxBytes ?? EVENTS_MAX_BYTES);
    appendFileSync(
      path,
      `${JSON.stringify(line)}
`,
      { mode: 384 },
    );
    return { written: true };
  } catch (error) {
    return {
      written: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

// ../shared/src/lens-route.ts
var ARCHITECT =
  /\b(pull request|pr review|new feature|big feature|architecture|architect|rfc)\b|\breview\b[^.?!]{0,60}\b(pr|pull request|this change|the change|my change|uncommitted change|diff|(?:last |latest |this )?commit|before i open a pr)\b|\bbefore i open a pr\b|\bplan(?:ning)? (?:a |the |this )?(?:new |big )?(?:feature|migration|redesign|system)\b/i;
var QA =
  /\b(?:find(?: any| the| all)? bugs?|bug hunt|hunt (?:for )?bugs?|regress\w*|what'?s broken|missing tests?|does this (?:break|fail)|why does [^.?!]{1,60}\b(?:fail|break|crash|throw)s?)\b|\bqa\b/i;
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var NEGATED =
  /\b(?:do not|don't|dont|no need to)\b[^.!?\n]*|(?:^|(?<=[.!?\n]))\s*never\b[^.!?\n]*/gi;
function routableText(task) {
  return task
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/^\s*>.*$/gm, " ")
    .replace(/"[^"\n]{0,400}"/g, " ")
    .replace(NEGATED, " ");
}
function phraseAt(text, phrase) {
  const match = new RegExp(
    `(?<![\\w-])${escapeRegExp(phrase.trim()).replace(/\s+/g, "\\s+")}(?![\\w-])`,
    "i",
  ).exec(text);
  return match ? match.index : -1;
}
var ASKED_BEFORE =
  /\b(?:use|using|apply|switch to|with|as)\s+(?:the\s+|a\s+|prism'?s\s+)?$/i;
function mentionOf(task, lens) {
  const names =
    lens.name.toLowerCase() === lens.id ? [lens.id] : [lens.name, lens.id];
  let best = { at: -1, rank: -1 };
  for (const name of names) {
    if (name.length < 2) continue;
    const pattern = new RegExp(
      `(?<![\\w-])${escapeRegExp(name.trim()).replace(/\s+/g, "\\s+")}(?![\\w-])`,
      "gi",
    );
    for (const match of task.matchAll(pattern)) {
      const at = match.index;
      const after = task.slice(at + match[0].length);
      const rank = ASKED_BEFORE.test(task.slice(Math.max(0, at - 30), at))
        ? 2
        : /^\s+lens\b/i.test(after)
          ? 1
          : 0;
      if (rank > best.rank || (rank === best.rank && at < best.at))
        best = { at, rank };
    }
  }
  return best;
}
function chooseLensDetailed(task, lenses) {
  const enabled = lenses.filter((lens) => lens.enabled);
  if (enabled.length === 0) return;
  const text = routableText(task);
  const unquotedCode = task
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(NEGATED, " ");
  const named = enabled
    .map((lens) => ({ lens, ...mentionOf(unquotedCode, lens) }))
    .filter((row) => row.at >= 0)
    .sort((a, b) => b.rank - a.rank || a.at - b.at);
  const top = named[0];
  if (top && (top.rank > 0 || named.length === 1))
    return { lens: top.lens, by: "named" };
  if (top) {
    const intent = named.reduce(
      (rest, row) =>
        [row.lens.name, row.lens.id].reduce(
          (t, name) =>
            t.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), " "),
          rest,
        ),
      text,
    );
    const routed = routeBuiltIn(
      intent,
      named.map((row) => row.lens),
    );
    return { lens: routed?.lens ?? top.lens, by: "named" };
  }
  const triggered = enabled
    .flatMap((lens) =>
      (lens.triggers ?? [])
        .filter((phrase) => phraseAt(text, phrase) >= 0)
        .map((phrase) => ({ lens, length: phrase.trim().length })),
    )
    .sort(
      (a, b) =>
        b.length - a.length ||
        (b.lens.updatedAt ?? "").localeCompare(a.lens.updatedAt ?? ""),
    );
  if (triggered[0]) {
    const ids = [...new Set(triggered.map((row) => row.lens.id))];
    return {
      lens: triggered[0].lens,
      by: "trigger",
      ...(ids.length > 1 ? { conflict: ids } : {}),
    };
  }
  return routeBuiltIn(text, enabled, enabled[0]);
}
function routeBuiltIn(text, lenses, fallback) {
  const byId = (id) => lenses.find((lens) => lens.id === id);
  const qa = byId("qa");
  if (QA.test(text) && qa) return { lens: qa, by: "qa" };
  const architect = byId("architect");
  if (ARCHITECT.test(text) && architect) {
    return { lens: architect, by: "architect" };
  }
  const dev = byId("dev") ?? fallback;
  return dev ? { lens: dev, by: "default" } : undefined;
}

// ../shared/src/lens-store.ts
import { createHash as createHash2, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join as join3 } from "node:path";

// ../../node_modules/.bun/zod@3.25.76/node_modules/zod/v3/external.js
var exports_external = {};
__export(exports_external, {
  void: () => voidType,
  util: () => util,
  unknown: () => unknownType,
  union: () => unionType,
  undefined: () => undefinedType,
  tuple: () => tupleType,
  transformer: () => effectsType,
  symbol: () => symbolType,
  string: () => stringType,
  strictObject: () => strictObjectType,
  setErrorMap: () => setErrorMap,
  set: () => setType,
  record: () => recordType,
  quotelessJson: () => quotelessJson,
  promise: () => promiseType,
  preprocess: () => preprocessType,
  pipeline: () => pipelineType,
  ostring: () => ostring,
  optional: () => optionalType,
  onumber: () => onumber,
  oboolean: () => oboolean,
  objectUtil: () => objectUtil,
  object: () => objectType,
  number: () => numberType,
  nullable: () => nullableType,
  null: () => nullType,
  never: () => neverType,
  nativeEnum: () => nativeEnumType,
  nan: () => nanType,
  map: () => mapType,
  makeIssue: () => makeIssue,
  literal: () => literalType,
  lazy: () => lazyType,
  late: () => late,
  isValid: () => isValid,
  isDirty: () => isDirty,
  isAsync: () => isAsync,
  isAborted: () => isAborted,
  intersection: () => intersectionType,
  instanceof: () => instanceOfType,
  getParsedType: () => getParsedType,
  getErrorMap: () => getErrorMap,
  function: () => functionType,
  enum: () => enumType,
  effect: () => effectsType,
  discriminatedUnion: () => discriminatedUnionType,
  defaultErrorMap: () => en_default,
  datetimeRegex: () => datetimeRegex,
  date: () => dateType,
  custom: () => custom,
  coerce: () => coerce,
  boolean: () => booleanType,
  bigint: () => bigIntType,
  array: () => arrayType,
  any: () => anyType,
  addIssueToContext: () => addIssueToContext,
  ZodVoid: () => ZodVoid,
  ZodUnknown: () => ZodUnknown,
  ZodUnion: () => ZodUnion,
  ZodUndefined: () => ZodUndefined,
  ZodType: () => ZodType,
  ZodTuple: () => ZodTuple,
  ZodTransformer: () => ZodEffects,
  ZodSymbol: () => ZodSymbol,
  ZodString: () => ZodString,
  ZodSet: () => ZodSet,
  ZodSchema: () => ZodType,
  ZodRecord: () => ZodRecord,
  ZodReadonly: () => ZodReadonly,
  ZodPromise: () => ZodPromise,
  ZodPipeline: () => ZodPipeline,
  ZodParsedType: () => ZodParsedType,
  ZodOptional: () => ZodOptional,
  ZodObject: () => ZodObject,
  ZodNumber: () => ZodNumber,
  ZodNullable: () => ZodNullable,
  ZodNull: () => ZodNull,
  ZodNever: () => ZodNever,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNaN: () => ZodNaN,
  ZodMap: () => ZodMap,
  ZodLiteral: () => ZodLiteral,
  ZodLazy: () => ZodLazy,
  ZodIssueCode: () => ZodIssueCode,
  ZodIntersection: () => ZodIntersection,
  ZodFunction: () => ZodFunction,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodError: () => ZodError,
  ZodEnum: () => ZodEnum,
  ZodEffects: () => ZodEffects,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodDefault: () => ZodDefault,
  ZodDate: () => ZodDate,
  ZodCatch: () => ZodCatch,
  ZodBranded: () => ZodBranded,
  ZodBoolean: () => ZodBoolean,
  ZodBigInt: () => ZodBigInt,
  ZodArray: () => ZodArray,
  ZodAny: () => ZodAny,
  Schema: () => ZodType,
  ParseStatus: () => ParseStatus,
  OK: () => OK,
  NEVER: () => NEVER,
  INVALID: () => INVALID,
  EMPTY_PATH: () => EMPTY_PATH,
  DIRTY: () => DIRTY,
  BRAND: () => BRAND,
});

// ../../node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/util.js
var util;
(function (util2) {
  util2.assertEqual = (_) => {};
  function assertIs(_arg) {}
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2
      .objectKeys(obj)
      .filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function (e) {
      return obj[e];
    });
  };
  util2.objectKeys =
    typeof Object.keys === "function"
      ? (obj) => Object.keys(obj)
      : (object) => {
          const keys = [];
          for (const key in object) {
            if (Object.prototype.hasOwnProperty.call(object, key)) {
              keys.push(key);
            }
          }
          return keys;
        };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item)) return item;
    }
    return;
  };
  util2.isInteger =
    typeof Number.isInteger === "function"
      ? (val) => Number.isInteger(val)
      : (val) =>
          typeof val === "number" &&
          Number.isFinite(val) &&
          Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array
      .map((val) => (typeof val === "string" ? `'${val}'` : val))
      .join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function (objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second,
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set",
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (
        data.then &&
        typeof data.then === "function" &&
        data.catch &&
        typeof data.catch === "function"
      ) {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// ../../node_modules/.bun/zod@3.25.76/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite",
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};

class ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper =
      _mapper ||
      function (issue) {
        return issue.message;
      };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
}
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// ../../node_modules/.bun/zod@3.25.76/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// ../../node_modules/.bun/zod@3.25.76/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
// ../../node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...(issueData.path || [])];
  const fullIssue = {
    ...issueData,
    path: fullPath,
  };
  if (issueData.message !== undefined) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message,
    };
  }
  let errorMessage = "";
  const maps = errorMaps
    .filter((m) => !!m)
    .slice()
    .reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage,
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      ctx.schemaErrorMap,
      overrideMap,
      overrideMap === en_default ? undefined : en_default,
    ].filter((x) => !!x),
  });
  ctx.common.issues.push(issue);
}

class ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid") this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted") this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted") return INVALID;
      if (s.status === "dirty") status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value,
      });
    }
    return ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted") return INVALID;
      if (value.status === "aborted") return INVALID;
      if (key.status === "dirty") status.dirty();
      if (value.status === "dirty") status.dirty();
      if (
        key.value !== "__proto__" &&
        (typeof value.value !== "undefined" || pair.alwaysSet)
      ) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
}
var INVALID = Object.freeze({
  status: "aborted",
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
// ../../node_modules/.bun/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function (errorUtil2) {
  errorUtil2.errToObj = (message) =>
    typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) =>
    typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// ../../node_modules/.bun/zod@3.25.76/node_modules/zod/v3/types.js
class ParseInputLazyPath {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
}
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error) return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      },
    };
  }
};
function processCreateParams(params) {
  if (!params) return {};
  const {
    errorMap: errorMap2,
    invalid_type_error,
    required_error,
    description,
  } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(
      `Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`,
    );
  }
  if (errorMap2) return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type") return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}

class ZodType {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return (
      ctx || {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent,
      }
    );
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent,
      },
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success) return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap,
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data),
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async,
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data),
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result)
          ? {
              value: result.value,
            }
          : {
              issues: ctx.common.issues,
            };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true,
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) =>
      isValid(result)
        ? {
            value: result.value,
          }
        : {
            issues: ctx.common.issues,
          },
    );
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success) return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true,
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data),
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult)
      ? maybeAsyncResult
      : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () =>
        ctx.addIssue({
          code: ZodIssueCode.custom,
          ...getIssueProperties(val),
        });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(
          typeof refinementData === "function"
            ? refinementData(val, ctx)
            : refinementData,
        );
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement },
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data),
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform },
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault,
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def),
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch,
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description,
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(undefined).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex =
  /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex =
  /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex =
  /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex =
  /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex =
  /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex =
  /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset) opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt)) return false;
  try {
    const [header] = jwt.split(".");
    if (!header) return false;
    const base64 = header
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(header.length + ((4 - (header.length % 4)) % 4), "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null) return false;
    if ("typ" in decoded && decoded?.typ !== "JWT") return false;
    if (!decoded.alg) return false;
    if (alg && decoded.alg !== alg) return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}

class ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType,
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = undefined;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message,
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message,
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message,
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message),
    });
  }
  _addCheck(check) {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, check],
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message),
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options,
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision:
        typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message),
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options,
      });
    }
    return this._addCheck({
      kind: "time",
      precision:
        typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message),
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message),
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message),
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message),
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message),
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message),
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message),
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message),
    });
  }
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }],
    });
  }
  toLowerCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }],
    });
  }
  toUpperCase() {
    return new ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }],
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min) min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max) max = ch.value;
      }
    }
    return max;
  }
}
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params),
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return (valInt % stepInt) / 10 ** decCount;
}

class ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType,
      });
      return INVALID;
    }
    let ctx = undefined;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive
          ? input.data < check.value
          : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive
          ? input.data > check.value
          : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message,
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message),
        },
      ],
    });
  }
  _addCheck(check) {
    return new ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check],
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message),
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message),
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message),
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message),
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message),
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message),
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message),
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message),
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message),
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min) min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max) max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find(
      (ch) =>
        ch.kind === "int" ||
        (ch.kind === "multipleOf" && util.isInteger(ch.value)),
    );
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (
        ch.kind === "finite" ||
        ch.kind === "int" ||
        ch.kind === "multipleOf"
      ) {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min) min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max) max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
}
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params),
  });
};

class ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = undefined;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive
          ? input.data < check.value
          : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive
          ? input.data > check.value
          : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message,
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message,
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType,
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message),
        },
      ],
    });
  }
  _addCheck(check) {
    return new ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check],
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message),
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message),
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message),
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message),
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message),
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min) min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max) max = ch.value;
      }
    }
    return max;
  }
}
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params),
  });
};

class ZodBoolean extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params),
  });
};

class ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType,
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date,
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = undefined;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date",
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date",
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime()),
    };
  }
  _addCheck(check) {
    return new ZodDate({
      ...this._def,
      checks: [...this._def.checks, check],
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message),
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message),
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min) min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max) max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
}
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params),
  });
};

class ZodSymbol extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params),
  });
};

class ZodUndefined extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params),
  });
};

class ZodNull extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params),
  });
};

class ZodAny extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params),
  });
};

class ZodUnknown extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
}
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params),
  });
};

class ZodNever extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType,
    });
    return INVALID;
  }
}
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params),
  });
};

class ZodVoid extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    return OK(input.data);
  }
}
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params),
  });
};

class ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : undefined,
          maximum: tooBig ? def.exactLength.value : undefined,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message,
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message,
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message,
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all(
        [...ctx.data].map((item, i) => {
          return def.type._parseAsync(
            new ParseInputLazyPath(ctx, item, ctx.path, i),
          );
        }),
      ).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(
        new ParseInputLazyPath(ctx, item, ctx.path, i),
      );
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) },
    });
  }
  max(maxLength, message) {
    return new ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) },
    });
  }
  length(len, message) {
    return new ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) },
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
}
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params),
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape,
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element),
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}

class ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null) return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType,
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (
      !(
        this._def.catchall instanceof ZodNever &&
        this._def.unknownKeys === "strip"
      )
    ) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(
          new ParseInputLazyPath(ctx, value, ctx.path, key),
        ),
        alwaysSet: key in ctx.data,
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] },
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys,
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key),
          ),
          alwaysSet: key in ctx.data,
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve()
        .then(async () => {
          const syncPairs = [];
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            syncPairs.push({
              key,
              value,
              alwaysSet: pair.alwaysSet,
            });
          }
          return syncPairs;
        })
        .then((syncPairs) => {
          return ParseStatus.mergeObjectSync(status, syncPairs);
        });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...(message !== undefined
        ? {
            errorMap: (issue, ctx) => {
              const defaultError =
                this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
              if (issue.code === "unrecognized_keys")
                return {
                  message: errorUtil.errToObj(message).message ?? defaultError,
                };
              return {
                message: defaultError,
              };
            },
          }
        : {}),
    });
  }
  strip() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "strip",
    });
  }
  passthrough() {
    return new ZodObject({
      ...this._def,
      unknownKeys: "passthrough",
    });
  }
  extend(augmentation) {
    return new ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation,
      }),
    });
  }
  merge(merging) {
    const merged = new ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape(),
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject,
    });
    return merged;
  }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  catchall(index) {
    return new ZodObject({
      ...this._def,
      catchall: index,
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape,
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => shape,
    });
  }
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape,
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new ZodObject({
      ...this._def,
      shape: () => newShape,
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
}
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params),
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params),
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params),
  });
};

class ZodUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map(
        (result) => new ZodError(result.ctx.common.issues),
      );
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors,
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(
        options.map(async (option) => {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: [],
            },
            parent: null,
          };
          return {
            result: await option._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: childCtx,
            }),
            ctx: childCtx,
          };
        }),
      ).then(handleResults);
    } else {
      let dirty = undefined;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: [],
          },
          parent: null,
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx,
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors,
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
}
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params),
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [undefined];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [undefined, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};

class ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator],
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx,
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx,
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  static create(discriminator, options, params) {
    const optionsMap = new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(
          `A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`,
        );
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(
            `Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`,
          );
        }
        optionsMap.set(value, type);
      }
    }
    return new ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params),
    });
  }
}
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util
      .objectKeys(a)
      .filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (
    aType === ZodParsedType.date &&
    bType === ZodParsedType.date &&
    +a === +b
  ) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}

class ZodIntersection extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types,
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        }),
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(
        this._def.left._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        }),
        this._def.right._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        }),
      );
    }
  }
}
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params),
  });
};

class ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array",
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array",
      });
      status.dirty();
    }
    const items = [...ctx.data]
      .map((item, itemIndex) => {
        const schema = this._def.items[itemIndex] || this._def.rest;
        if (!schema) return null;
        return schema._parse(
          new ParseInputLazyPath(ctx, item, ctx.path, itemIndex),
        );
      })
      .filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new ZodTuple({
      ...this._def,
      rest,
    });
  }
}
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params),
  });
};

class ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(
          new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key),
        ),
        alwaysSet: key in ctx.data,
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third),
      });
    }
    return new ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second),
    });
  }
}

class ZodMap extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(
          new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"]),
        ),
        value: valueType._parse(
          new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]),
        ),
      };
    });
    if (ctx.common.async) {
      const finalMap = new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
}
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params),
  });
};

class ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message,
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message,
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = new Set();
      for (const element of elements2) {
        if (element.status === "aborted") return INVALID;
        if (element.status === "dirty") status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) =>
      valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)),
    );
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) },
    });
  }
  max(maxSize, message) {
    return new ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) },
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
}
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params),
  });
};

class ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [
          ctx.common.contextualErrorMap,
          ctx.schemaErrorMap,
          getErrorMap(),
          en_default,
        ].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error,
        },
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [
          ctx.common.contextualErrorMap,
          ctx.schemaErrorMap,
          getErrorMap(),
          en_default,
        ].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error,
        },
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function (...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args
          .parseAsync(args, params)
          .catch((e) => {
            error.addIssue(makeArgsIssue(args, e));
            throw error;
          });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type
          .parseAsync(result, params)
          .catch((e) => {
            error.addIssue(makeReturnsIssue(result, e));
            throw error;
          });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function (...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create()),
    });
  }
  returns(returnType) {
    return new ZodFunction({
      ...this._def,
      returns: returnType,
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params),
    });
  }
}

class ZodLazy extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
}
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params),
  });
};

class ZodLiteral extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value,
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
}
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params),
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params),
  });
}

class ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type,
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues,
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return ZodEnum.create(values, {
      ...this._def,
      ...newDef,
    });
  }
  exclude(values, newDef = this._def) {
    return ZodEnum.create(
      this.options.filter((opt) => !values.includes(opt)),
      {
        ...this._def,
        ...newDef,
      },
    );
  }
}
ZodEnum.create = createZodEnum;

class ZodNativeEnum extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (
      ctx.parsedType !== ZodParsedType.string &&
      ctx.parsedType !== ZodParsedType.number
    ) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type,
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues,
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
}
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params),
  });
};

class ZodPromise extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (
      ctx.parsedType !== ZodParsedType.promise &&
      ctx.common.async === false
    ) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    const promisified =
      ctx.parsedType === ZodParsedType.promise
        ? ctx.data
        : Promise.resolve(ctx.data);
    return OK(
      promisified.then((data) => {
        return this._def.type.parseAsync(data, {
          path: ctx.path,
          errorMap: ctx.common.contextualErrorMap,
        });
      }),
    );
  }
}
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params),
  });
};

class ZodEffects extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects
      ? this._def.schema.sourceType()
      : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      },
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted") return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx,
          });
          if (result.status === "aborted") return INVALID;
          if (result.status === "dirty") return DIRTY(result.value);
          if (status.value === "dirty") return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted") return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx,
        });
        if (result.status === "aborted") return INVALID;
        if (result.status === "dirty") return DIRTY(result.value);
        if (status.value === "dirty") return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error(
            "Async refinement encountered during synchronous parse operation. Use .parseAsync instead.",
          );
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        });
        if (inner.status === "aborted") return INVALID;
        if (inner.status === "dirty") status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema
          ._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx })
          .then((inner) => {
            if (inner.status === "aborted") return INVALID;
            if (inner.status === "dirty") status.dirty();
            return executeRefinement(inner.value).then(() => {
              return { status: status.value, value: inner.value };
            });
          });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        });
        if (!isValid(base)) return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(
            `Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`,
          );
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema
          ._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx })
          .then((base) => {
            if (!isValid(base)) return INVALID;
            return Promise.resolve(effect.transform(base.value, checkCtx)).then(
              (result) => ({
                status: status.value,
                value: result,
              }),
            );
          });
      }
    }
    util.assertNever(effect);
  }
}
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params),
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params),
  });
};
class ZodOptional extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(undefined);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params),
  });
};

class ZodNullable extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params),
  });
};

class ZodDefault extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx,
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
}
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue:
      typeof params.default === "function"
        ? params.default
        : () => params.default,
    ...processCreateParams(params),
  });
};

class ZodCatch extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: [],
      },
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx,
      },
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value:
            result2.status === "valid"
              ? result2.value
              : this._def.catchValue({
                  get error() {
                    return new ZodError(newCtx.common.issues);
                  },
                  input: newCtx.data,
                }),
        };
      });
    } else {
      return {
        status: "valid",
        value:
          result.status === "valid"
            ? result.value
            : this._def.catchValue({
                get error() {
                  return new ZodError(newCtx.common.issues);
                },
                input: newCtx.data,
              }),
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
}
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue:
      typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params),
  });
};

class ZodNaN extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType,
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
}
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params),
  });
};
var BRAND = Symbol("zod_brand");

class ZodBranded extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx,
    });
  }
  unwrap() {
    return this._def.type;
  }
}

class ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx,
        });
        if (inResult.status === "aborted") return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx,
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx,
      });
      if (inResult.status === "aborted") return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value,
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx,
        });
      }
    }
  }
  static create(a, b) {
    return new ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline,
    });
  }
}

class ZodReadonly extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result)
      ? result.then((data) => freeze(data))
      : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params),
  });
};
function cleanParams(params, data) {
  const p =
    typeof params === "function"
      ? params(data)
      : typeof params === "string"
        ? { message: params }
        : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate,
};
var ZodFirstPartyTypeKind;
(function (ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (
  cls,
  params = {
    message: `Input not instance of ${cls.name}`,
  },
) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: (arg) => ZodString.create({ ...arg, coerce: true }),
  number: (arg) => ZodNumber.create({ ...arg, coerce: true }),
  boolean: (arg) =>
    ZodBoolean.create({
      ...arg,
      coerce: true,
    }),
  bigint: (arg) => ZodBigInt.create({ ...arg, coerce: true }),
  date: (arg) => ZodDate.create({ ...arg, coerce: true }),
};
var NEVER = INVALID;
// ../shared/src/lenses.ts
var LENS_ID = /^[a-z][a-z0-9-]{0,39}$/;
var LensIdSchema = exports_external.string().regex(LENS_ID);
var LENS_FACT_ORIGINS = ["seeded", "learned", "user"];
var LensFactOriginSchema = exports_external.enum(LENS_FACT_ORIGINS);
var LENS_EVIDENCE = [
  "boundaries",
  "cycles",
  "rationale",
  "off-limits",
  "blast",
  "test-impact",
  "verify-plan",
  "test-layout",
  "reuse",
  "house-style",
  "duplicates",
];
var LensEvidenceSchema = exports_external.enum(LENS_EVIDENCE);
var LENS_CHECK_IDS = [
  "new_cross_package_edge",
  "new_value_cycle",
  "off_limits_touched",
  "reuse_missed",
  "new_dependency_added",
  "untested_new_branch",
  "untested_changed_symbol",
  "dependents_not_in_diff",
  "test_reaches_but_not_run",
];
var LensCheckIdSchema = exports_external.enum(LENS_CHECK_IDS);
var LensCheckStatusSchema = exports_external.enum([
  "pass",
  "concern",
  "fail",
  "overruled",
]);
var LENS_EVIDENCE_MAX = 20;
var LensFindingSchema = exports_external.object({
  lens: exports_external.string().min(1),
  check: LensCheckIdSchema,
  status: LensCheckStatusSchema,
  evidence: exports_external
    .array(exports_external.string().min(1))
    .max(LENS_EVIDENCE_MAX),
  note: exports_external.string().optional(),
});
var LensFactSchema = exports_external.object({
  id: exports_external.string().min(1),
  lens: LensIdSchema,
  text: exports_external.string().min(1),
  origin: LensFactOriginSchema,
  source: exports_external.string().min(1).optional(),
  createdAt: exports_external.string().datetime(),
});
var LensDefinitionSchema = exports_external.object({
  id: LensIdSchema,
  name: exports_external.string().min(1).max(60),
  role: exports_external.string().min(1).max(200),
  focus: exports_external.string().min(1).max(600),
  tone: exports_external.string().max(200).default(""),
  checklist: exports_external
    .array(exports_external.string().min(1).max(300))
    .max(20),
  evidence: exports_external.array(LensEvidenceSchema),
  procedure: exports_external.string().max(2500).default(""),
  enabled: exports_external.boolean().default(true),
  seededDefault: exports_external.boolean().default(false),
  triggers: exports_external
    .array(exports_external.string().min(1).max(80))
    .max(20)
    .default([]),
  checks: exports_external.array(LensCheckIdSchema).max(20).default([]),
  overrules: exports_external
    .array(
      exports_external.object({
        check: LensCheckIdSchema,
        fingerprint: exports_external.string().min(1),
        note: exports_external.string().min(1).max(500),
        at: exports_external.string().datetime(),
      }),
    )
    .max(200)
    .default([]),
  updatedAt: exports_external.string().datetime().optional(),
});
var LensVerdictValueSchema = exports_external.enum(["pass", "concern", "fail"]);
var LensReviewRecordSchema = exports_external.object({
  id: exports_external.string().min(1),
  lens: LensIdSchema,
  at: exports_external.string().datetime(),
  subject: exports_external.string().min(1).max(500),
  evidence: exports_external.array(exports_external.string()).max(60),
  verdict: LensVerdictValueSchema,
  reasoning: exports_external.string().max(8000),
  failedChecks: exports_external
    .array(exports_external.string())
    .max(20)
    .default([]),
  sequential: exports_external.boolean().default(false),
  override: exports_external
    .object({
      at: exports_external.string().datetime(),
      note: exports_external.string().min(1).max(500),
    })
    .optional(),
});
var LensViewSchema = exports_external.object({
  definition: LensDefinitionSchema,
  facts: exports_external.array(LensFactSchema),
  history: exports_external.array(LensReviewRecordSchema),
});

// ../shared/src/work-order.ts
var WORK_ORDER_STATES = ["allowed", "blocked", "needsSignOff"];
var WorkOrderStateSchema = exports_external.enum(WORK_ORDER_STATES);
var WorkOrderOffLimitSchema = exports_external.object({
  path: exports_external.string().min(1),
  reason: exports_external.string().min(1),
});
var WorkOrderSchema = exports_external.object({
  inScope: exports_external.array(exports_external.string().min(1)),
  offLimits: exports_external.array(WorkOrderOffLimitSchema),
  needsSignOff: exports_external.array(exports_external.string().min(1)),
  advisory: exports_external.boolean(),
  hookArmed: exports_external.boolean(),
});
var WorkOrderEvaluationSchema = exports_external.object({
  path: exports_external.string().min(1),
  state: WorkOrderStateSchema,
  veto: exports_external.boolean(),
  copy: exports_external.string().min(1),
});

// ../shared/src/lens-store.ts
var StoreSchema = exports_external.object({
  lenses: exports_external.array(LensDefinitionSchema),
  facts: exports_external.array(LensFactSchema),
  reviews: exports_external.array(LensReviewRecordSchema),
});
var DefinitionsSchema = exports_external.object({
  lenses: exports_external.array(LensDefinitionSchema),
});
var WorkspaceSchema = exports_external.object({
  facts: exports_external.array(LensFactSchema).default([]),
  reviews: exports_external.array(LensReviewRecordSchema).default([]),
});
function lensStorePath(workspaceRoot, env = process.env) {
  return join3(workspacePrismDir(workspaceRoot, env), "lenses", "store.json");
}
function lensDefinitionsPath(env = process.env) {
  return join3(prismHomeDir(env), "lenses", "lenses.json");
}
async function readJson(path, schema, env) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { value: null };
    throw error;
  }
  let parsed = null;
  try {
    parsed = schema.safeParse(JSON.parse(text));
  } catch (error) {
    await quarantine(
      path,
      error instanceof Error ? error.message : String(error),
      env,
    );
    return { value: null };
  }
  if (!parsed.success) {
    await quarantine(path, parsed.error.message.slice(0, 200), env);
    return { value: null };
  }
  return { value: parsed.data };
}
async function quarantine(path, reason, env) {
  const aside = `${path}.corrupt-${Date.now()}`;
  await rename(path, aside);
  recordEvent(
    {
      event: "lens.store_corrupt",
      outcome: "degraded",
      reason,
      detail: { path, aside },
    },
    { env },
  );
}
async function readLensStore(workspaceRoot, env = process.env) {
  const [definitions, workspace] = await Promise.all([
    readJson(lensDefinitionsPath(env), DefinitionsSchema, env),
    readJson(
      lensStorePath(workspaceRoot, env),
      StoreSchema.partial().passthrough(),
      env,
    ),
  ]);
  const local = WorkspaceSchema.parse({
    facts: workspace.value?.facts ?? [],
    reviews: workspace.value?.reviews ?? [],
  });
  return {
    lenses: definitions.value?.lenses ?? [],
    facts: local.facts,
    reviews: local.reviews,
  };
}
var ARCHITECT_PROCEDURE = `You are the Architect lens: the senior pass on structure. Use it for a new feature, a plan, or a pull request. Read the repo's shape before you propose anything.

1. A recorded decision (an ADR or a package boundary) already covers this? Follow it, and cite it.
2. A package already owns this work? Put the change there. Do not open a new package or a parallel abstraction.
3. The change would add a dependency between packages, or a cycle? Do not, unless the task requires it. Name the edge if you must add one.
4. The smallest design that fits the layers this repo already has. No new framework.
5. On a pull request, read the code the change touches, not only the diff. Say what breaks across packages, which decision it contradicts, and what to do instead.
6. Then the lean pass the Dev lens writes by: flag code that should not exist (dead code, an option nobody sets, an abstraction with one use), a helper the repo already has (cite its path), and near-copies that must change together. Propose the fix that deletes code.

Never cut: an accepted decision, an off-limits path, or a boundary the repo already enforces.`;
var QA_PROCEDURE = `You are the QA lens. Find bugs. Do not redesign the feature.

1. Read the code the task names and the tests that reach it.
2. State a concrete failure: the input, what the code does, what goes wrong, and who it hits.
3. A bug with no test is still open. Name the test that should fail, or say that none reaches the file.
4. Check the edges the change did not touch but that depend on it: empty, duplicate, the wrong type.
5. Stop at findings. Each one cites a path. No new framework and no drive-by refactor.

A green command on the wrong files is not proof.`;
var DEV_PROCEDURE = `You are the Dev lens, for a daily fix. Finish the task with the smallest complete change.

1. Does this need to exist? Skip options and flexibility nobody asked for, and name what you skipped.
2. A helper, pattern, or type already in this codebase does it? Use that, the way the files beside it do.
3. Can one line say it? One line.
4. Otherwise the minimum that works, in the house style of the nearby files. No wrapper, config, or code for later.
5. A bug fix: fix it where it breaks. The cause is in shared code? Fix it there, once. Leave working code beside it as it is.
6. New logic — a branch, a loop, money, or security — leaves one small test. A typo or a comment does not.
7. Removing a safety check (a confirmation, a guard): a setting already controls it? Change the setting. Otherwise list the delete, kill or reset actions it leaves unguarded.

Never cut: validation, error handling, security, or anything the user asked for.`;
var SHIPPED_PROCEDURES = {
  architect: ["c2e2d07ca8d94bc8"],
  dev: ["a98537cbcd7a4d2b", "bded35890e81e4ed"],
};
function shippedProcedure(id, procedure) {
  const hash = createHash2("sha256")
    .update(procedure)
    .digest("hex")
    .slice(0, 16);
  return SHIPPED_PROCEDURES[id]?.includes(hash) ?? false;
}
var PREVIOUS_DEFAULTS = [
  {
    id: "architect",
    role: "Checks structure: package boundaries, import cycles, and decisions already recorded.",
    focus:
      "A change should not add a new dependency between packages, a new cycle, or contradict an accepted ADR.",
    checklist: [
      "The change adds no import edge into a package it did not already depend on.",
      "The change adds no import cycle.",
      "Generated and vendor paths are untouched.",
    ],
  },
  {
    id: "qa",
    role: "Checks proof: whether a test reaches the change and the repo's own checks pass.",
    focus: "A claim is true only if a test or a command shows it.",
    checklist: [
      "Every changed source file is reached by at least one test.",
      "The repo's typecheck and test commands pass on the change.",
    ],
  },
  {
    id: "dev",
    role: "Checks fit: reuse of existing code and the house style of nearby files.",
    focus: "Prefer the helper that already exists over a second copy.",
    checklist: [
      "The change does not duplicate a helper that already exists.",
      "New code follows the patterns of the files beside it.",
    ],
  },
];
var DEFAULT_LENSES = [
  {
    id: "architect",
    name: "Architect",
    role: "Senior structure review for a new feature, a plan, or a pull request.",
    focus:
      "A change should land in the package that already owns it, add no new cycle, and follow a decision the repo already recorded.",
    tone: "Direct. Cite a path or a decision.",
    checklist: [
      "The change adds no import edge into a package it did not already depend on.",
      "The change adds no import cycle.",
      "Generated and vendor paths are untouched.",
      "The change does not contradict an accepted ADR.",
    ],
    evidence: ["boundaries", "cycles", "rationale", "off-limits"],
    enabled: true,
    seededDefault: true,
    triggers: [],
    checks: ["new_cross_package_edge", "new_value_cycle", "off_limits_touched"],
    overrules: [],
    procedure: ARCHITECT_PROCEDURE,
  },
  {
    id: "qa",
    name: "QA",
    role: "Senior bug hunt: a concrete failure, the path, and the test that should catch it.",
    focus:
      "A bug is real when you can name the input, the wrong result, and whether a test reaches it.",
    tone: "Name the test file or say that none reaches it.",
    checklist: [
      "Every changed source file is reached by at least one test, or the gap is named.",
      "A finding cites a path and a concrete failure.",
      "The check named is one this repo already runs.",
    ],
    evidence: ["test-impact", "verify-plan", "test-layout", "blast"],
    enabled: true,
    seededDefault: true,
    triggers: [],
    checks: [
      "untested_changed_symbol",
      "dependents_not_in_diff",
      "test_reaches_but_not_run",
    ],
    overrules: [],
    procedure: QA_PROCEDURE,
  },
  {
    id: "dev",
    name: "Dev",
    role: "Daily changes: the smallest complete fix, using what the repo already has.",
    focus:
      "Prefer the helper that already exists. New logic leaves one small test; a typo does not.",
    tone: "Point to the existing symbol.",
    checklist: [
      "The change does not duplicate a helper that already exists.",
      "New code follows the patterns of the files beside it.",
      "New non-trivial logic has one test, or the change is trivial.",
    ],
    evidence: ["reuse", "house-style", "duplicates"],
    enabled: true,
    seededDefault: true,
    triggers: [],
    checks: ["reuse_missed", "new_dependency_added", "untested_new_branch"],
    overrules: [],
    procedure: DEV_PROCEDURE,
  },
];
function sameChecklist(left, right) {
  return (
    left.length === right.length && left.every((item, i) => item === right[i])
  );
}
function applyDefaultProcedures(lenses) {
  return lenses.map((lens) => {
    const fresh = DEFAULT_LENSES.find((row) => row.id === lens.id);
    if (!fresh || !lens.seededDefault) return lens;
    const previous = PREVIOUS_DEFAULTS.find((row) => row.id === lens.id);
    const untouched =
      (previous !== undefined &&
        lens.name === fresh.name &&
        lens.role === previous.role &&
        lens.focus === previous.focus &&
        sameChecklist(lens.checklist, previous.checklist)) ||
      (lens.name === fresh.name &&
        lens.role === fresh.role &&
        lens.focus === fresh.focus &&
        sameChecklist(lens.checklist, fresh.checklist) &&
        shippedProcedure(lens.id, lens.procedure));
    if (untouched) {
      return {
        ...fresh,
        enabled: lens.enabled,
        triggers: lens.triggers,
        overrules: lens.overrules,
      };
    }
    return {
      ...lens,
      procedure: lens.procedure.trim() ? lens.procedure : fresh.procedure,
      checks: lens.checks.length > 0 ? lens.checks : fresh.checks,
    };
  });
}
function lensProcedure(lens) {
  if (lens.procedure.trim()) return lens.procedure;
  return [
    lens.role,
    lens.focus,
    lens.tone,
    ...lens.checklist.map((item) => `- ${item}`),
  ]
    .map((line) => line.trim())
    .filter(Boolean).join(`
`);
}
var CustomLensDraftSchema = exports_external.object({
  name: exports_external.string().trim().min(1).max(60),
  role: exports_external.string().trim().min(1).max(200),
  focus: exports_external.string().trim().min(1).max(600),
  tone: exports_external.string().trim().max(200).optional(),
  checklist: exports_external
    .array(exports_external.string().trim().min(1).max(300))
    .min(1)
    .max(20),
  evidence: exports_external.array(exports_external.enum(LENS_EVIDENCE)).min(1),
  triggers: exports_external
    .array(exports_external.string().trim().min(1).max(80))
    .max(20)
    .optional(),
  checks: exports_external
    .array(exports_external.string().trim().min(1))
    .max(20)
    .optional(),
});

// ../shared/src/partial-index.ts
function partialIndexLine(partial) {
  const counts =
    partial.total > 0
      ? ` (${partial.analyzed} of ${partial.total} code files)`
      : "";
  return `Prism · the index is partial${counts}, so files outside it are missing. Run \`prism index\` to finish it.`;
}

// ../shared/src/tool-ids.ts
var PRISM_MCP_SERVER = "prism";
function claudeToolId(tool) {
  return `mcp__${PRISM_MCP_SERVER}__${tool}`;
}

// ../shared/src/prepare-context.ts
var PROMPT_PACK_FILES = 3;
var TEST_LIKE = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
var REUSE_MIN_SCORE = 0.6;
var PROMPT_PACK_SIGNATURES = 3;
var ANCHOR_WHY = new Set([
  "named in task",
  "seed file",
  "path matches task",
  "name matches task",
]);
var clip = (text, max) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
function confidentFile(file) {
  return file.why.includes("named in task") || file.lead === true;
}
var PREPARE_NUDGE = `Prism · no confident file pick. Call ${claudeToolId("prepare_change")} with the task before editing code you have not read.`;
var CHANGED = String.raw`\b(?:add|remove|skip|disable|bypass|drop|delete|turn (?:on|off)|enable|change|loosen|relax|weaken|flip|override|edit|update|set|without|no)\b[^.?!\n]{0,40}?\b`;
var SAFETY_WORDS = new RegExp(
  `${CHANGED}(?:confirm\\w*|guards?|safety|safeguards?|protect\\w*|permissions?)\\b`,
  "i",
);
var CONFIG_WORDS = new RegExp(
  `${CHANGED}(?:config\\w*|settings?|env|environment variables?|feature flags?)\\b(?!\\s+(?:page|screen|panel|tab|dialog|modal|view|button|icon|form|menu|ui|layout|link)s?\\b)`,
  "i",
);
var CONFIG_FILE =
  /(^|\/)(?:config|settings)(?:\.[\w-]+)*\.(?:json|jsonc|ya?ml|toml|ini|[cm]?[jt]s)$|(^|\/)\.env/;
var FIX_TASK = /\b(?:fix\w*|fail\w*|bug\w*|broken|regress\w*)\b/i;
function changeRisk(prompt, prep, files) {
  if (SAFETY_WORDS.test(prompt)) return "safety check";
  if (CONFIG_WORDS.test(prompt) || files.some((f) => CONFIG_FILE.test(f.path)))
    return "config or settings";
  if (FIX_TASK.test(prompt)) return null;
  const blast = new Set(prep.order?.needsSignOff ?? []);
  const hit = files.find((f) => blast.has(f.path));
  return hit ? `high blast: ${hit.path}` : null;
}
function riskLines(risk) {
  return [
    `Risky change (${risk}): plan first with the Architect lens. Name the files, the setting or guard involved, and what depends on them.`,
  ];
}
function widensScope(prompt) {
  return /\b(everything|everywhere|anything|anywhere|all|every|whole|entire|across)\b/i.test(
    prompt,
  );
}
var baseName = (path) => path.split("/").pop() ?? path;
function promptNames(prompt, path) {
  if (prompt.includes(path)) return true;
  const base = path.split("/").pop() ?? path;
  return new RegExp(
    `(^|[^\\w./-])${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\w-])`,
  ).test(prompt);
}
function nearby(a, b) {
  const da = a.split("/").slice(0, -1);
  const db = b.split("/").slice(0, -1);
  const need = Math.min(2, da.length, db.length);
  return da.slice(0, need).join("/") === db.slice(0, need).join("/");
}
function fileLines(file, top) {
  const why = file.why.filter((w) => w !== "stale index").slice(0, 2);
  const lines = [`- ${file.path}${why.length ? `: ${why.join(", ")}` : ""}`];
  if (!top) return lines;
  for (const sig of (file.signatures ?? []).slice(0, PROMPT_PACK_SIGNATURES)) {
    lines.push(`  ${sig.line}: ${clip(sig.signature || sig.name, 110)}`);
  }
  return lines;
}
function lensLines(lens) {
  const conflict =
    lens.conflict && lens.conflict.length > 1
      ? ` (lenses ${lens.conflict.join(", ")} all match; name one to choose)`
      : "";
  return [
    `Lens: ${lens.name}${conflict}`,
    ...(lens.procedure.trim() ? [clip(lens.procedure.trim(), 1400)] : []),
  ];
}
function buildPromptPack(input) {
  const surfaced = input.surfaced ?? new Set();
  const lens = input.lens ? lensLines(input.lens) : [];
  const prep = input.prep;
  const sure = prep
    ? prep.pack.files.filter(confidentFile).slice(0, PROMPT_PACK_FILES)
    : [];
  const risk = prep ? changeRisk(input.prompt, prep, sure) : null;
  const cue = risk ? riskLines(risk) : [];
  const cueSummary = risk ? [`plan cue (${risk})`] : [];
  const only = (reason, summary, extra = [], named2 = false) => {
    const lines2 = [...extra, ...cue, ...lens];
    return {
      text:
        lines2.length > 0
          ? lines2.join(`
`)
          : null,
      reason: lens.length > 0 ? `${reason}; lens ${input.lens.id}` : reason,
      shown: [],
      same: [],
      named: named2,
      summary: [...summary, ...cueSummary],
      cue,
    };
  };
  if (!prep) return only("no pack for this prompt", []);
  if (prep.partialIndex) {
    return only(
      "index is partial",
      ["partial index (asked for prism index)"],
      [partialIndexLine(prep.partialIndex)],
    );
  }
  if (sure.length === 0) {
    return input.fromTool
      ? only("not sure of any file", ["no sure file (read before editing)"])
      : only(
          "not sure of any file",
          ["no sure file (asked for prepare_change)"],
          [PREPARE_NUDGE],
        );
  }
  const named = sure.some((f) => promptNames(input.prompt, f.path));
  const same = sure.filter((f) => surfaced.has(f.path)).map((f) => f.path);
  const fresh = sure.filter(
    (f) => !surfaced.has(f.path) && !promptNames(input.prompt, f.path),
  );
  if (fresh.length === 0) {
    return same.length > 0
      ? only(
          "nothing new since earlier in the session",
          ["nothing new (same files as before)"],
          [],
          named,
        )
      : only(
          "the prompt names every file",
          ["nothing new (you named the files)"],
          [],
          named,
        );
  }
  const stale = prep.pack.files.some((f) => f.why.includes("stale index"));
  const lines = [
    `Prism · files for this task${input.fromTool ? "" : `, from ${claudeToolId("prepare_change")}; start with these`}${stale ? " (index updating; confirm line numbers)" : ""}:`,
    ...fresh.flatMap((file, i) => fileLines(file, i === 0)),
  ];
  if (same.length > 0) lines.push(`Same as before: ${same.join(", ")}`);
  const listed = new Set(sure.map((f) => f.path));
  const reuse = prep.reuse
    .filter(
      (r) =>
        !listed.has(r.path) &&
        r.score >= REUSE_MIN_SCORE &&
        !r.evidence.includes("already imported") &&
        fresh.some((f) => nearby(r.path, f.path)),
    )
    .slice(0, 2);
  if (reuse.length > 0) {
    lines.push(
      `Reuse: ${reuse.map((r) => `${r.symbol} (${r.path})`).join(", ")}`,
    );
  }
  const style =
    surfaced.size === 0
      ? prep.conventions?.find(
          (c) =>
            !TEST_LIKE.test(c.path) &&
            fresh.some((f) => nearby(c.path, f.path)),
        )
      : undefined;
  if (style) lines.push(`House style: ${style.path} (${style.symbol})`);
  const tests = prep.pack.tests
    .filter(
      (t) =>
        !promptNames(input.prompt, t) && sure.some((f) => nearby(t, f.path)),
    )
    .slice(0, 3);
  if (tests.length > 0) lines.push(`Tests: ${tests.join(", ")}`);
  for (const run of (prep.pack.run ?? []).slice(0, 1)) {
    lines.push(
      `Run: ${run.cwd && run.cwd !== "." ? `cd ${run.cwd} && ` : ""}${run.command}`,
    );
  }
  lines.push(...cue, ...lens);
  return {
    text: lines.join(`
`),
    reason: `${fresh.length} new file${fresh.length === 1 ? "" : "s"}${same.length ? `, ${same.length} same as before` : ""}${input.lens ? `; lens ${input.lens.id}` : ""}`,
    shown: fresh,
    same,
    named,
    summary: [
      `${fresh.length} file${fresh.length === 1 ? "" : "s"} (${fresh.map((f) => baseName(f.path)).join(", ")})`,
      ...(same.length > 0 ? ["same files as before"] : []),
      ...cueSummary,
    ],
    cue,
  };
}
function lensLabel(name) {
  return `${name.replace(/\s*lens$/i, "")} lens`;
}
function promptSummaryLine(parts, isChange) {
  if (parts.length > 0) return `Prism · ${parts.join(" + ")}`;
  return isChange ? "Prism · nothing to add" : null;
}

// ../shared/src/session-store.ts
import {
  existsSync as existsSync2,
  mkdirSync as mkdirSync3,
  readdirSync as readdirSync2,
  readFileSync,
  rmSync as rmSync3,
  statSync as statSync3,
  writeFileSync,
} from "node:fs";
import { join as join4 } from "node:path";
var SESSION_STORE_SCHEMA = 1;
var SESSION_TTL_MS = 24 * 60 * 60 * 1000;
function sessionsDir(env = process.env) {
  return join4(prismHomeDir(env), "sessions");
}
function sessionStorePath(sessionId, env = process.env) {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  return join4(sessionsDir(env), `${safe}.json`);
}
function emptySessionStore(sessionId, now = new Date()) {
  return {
    schemaVersion: SESSION_STORE_SCHEMA,
    sessionId,
    updatedAt: now.toISOString(),
    turn: 0,
    sent: {},
  };
}
function readSessionStore(sessionId, env = process.env, now = new Date()) {
  const path = sessionStorePath(sessionId, env);
  if (!existsSync2(path)) return emptySessionStore(sessionId, now);
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (
      raw.schemaVersion !== SESSION_STORE_SCHEMA ||
      raw.sessionId !== sessionId ||
      typeof raw.sent !== "object"
    ) {
      return emptySessionStore(sessionId, now);
    }
    const age = now.getTime() - Date.parse(raw.updatedAt);
    if (!Number.isFinite(age) || age > SESSION_TTL_MS) {
      return emptySessionStore(sessionId, now);
    }
    return raw;
  } catch {
    return emptySessionStore(sessionId, now);
  }
}
function writeSessionStore(store, env = process.env) {
  const dir = sessionsDir(env);
  mkdirSync3(dir, { recursive: true });
  writeFileSync(
    sessionStorePath(store.sessionId, env),
    `${JSON.stringify(store)}
`,
    "utf8",
  );
}
function recordSent(store, key, hash, kind, now = new Date()) {
  const turn = store.turn + 1;
  return {
    schemaVersion: SESSION_STORE_SCHEMA,
    sessionId: store.sessionId,
    updatedAt: now.toISOString(),
    turn,
    sent: {
      ...store.sent,
      [key]: { hash, turn, kind },
    },
  };
}

// ../shared/src/prompt-hook.ts
var AUTO_PREPARE_MS = 900;
var PROMPT_KINDS = ["change", "review", "question"];
var UNSUPPORTED_LANGUAGE_NOTE =
  "Prism: this repository's language is not supported in 2.0; no pack.";
function degraded(event, error, root, env) {
  recordEvent(
    {
      event,
      outcome: "degraded",
      reason: error instanceof Error ? error.message : String(error),
      workspace: root,
    },
    { env },
  );
}
function markSessionOnce(root, sessionId, what, env) {
  const key = createHash3("sha256")
    .update(sessionId)
    .digest("hex")
    .slice(0, 24);
  const path = join5(
    workspacePrismDir(root, env),
    "hooks",
    "once",
    `${key}.json`,
  );
  let marks = [];
  try {
    marks = JSON.parse(readFileSync2(path, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT")
      degraded("prompt.session_marks", error, root, env);
  }
  if (!Array.isArray(marks)) marks = [];
  if (marks.includes(what)) return false;
  mkdirSync4(dirname2(path), { recursive: true });
  writeFileSync2(path, JSON.stringify([...marks, what]));
  return true;
}
async function promptLens(root, prompt, kind, sessionId, env) {
  const store = await readLensStore(root, env);
  const lenses = applyDefaultProcedures(
    store.lenses.length > 0 ? store.lenses : DEFAULT_LENSES,
  );
  const choice = chooseLensDetailed(prompt, lenses);
  if (!choice) return;
  const applies =
    choice.by === "named" || choice.by === "trigger"
      ? true
      : choice.by === "default"
        ? kind === "change"
        : kind === "change" || kind === "review" || kind === "question";
  if (!applies) return;
  const first =
    !sessionId ||
    markSessionOnce(root, sessionId, `lens:${choice.lens.id}`, env);
  if (!first && !widensScope(prompt)) return;
  return {
    id: choice.lens.id,
    name: choice.lens.name,
    procedure: lensProcedure(choice.lens),
    ...(choice.conflict ? { conflict: choice.conflict } : {}),
  };
}
function rememberShown(sessionId, shown, env) {
  if (shown.length === 0) return;
  let store = readSessionStore(sessionId, env);
  for (const file of shown)
    store = recordSent(store, file.path, file.hash, "file");
  writeSessionStore(store, env);
}
function markLiteSession(root, sessionId, env) {
  const path = join5(workspacePrismDir(root, env), "hooks", "lite.json");
  let ids = [];
  try {
    ids = JSON.parse(readFileSync2(path, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT")
      degraded("prompt.lite_session", error, root, env);
  }
  const list = Array.isArray(ids) ? ids : [];
  if (list.includes(sessionId)) return;
  mkdirSync4(dirname2(path), { recursive: true });
  writeFileSync2(path, JSON.stringify([...list.slice(-50), sessionId]));
}
async function runPromptHook(input, options) {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const started = options.startedAt ?? now();
  const root = resolve2(options.root);
  const log =
    options.log ??
    ((line) =>
      process.stderr.write(`prism-mcp: ${line}
`));
  const say = (reason, event, outcome2 = "skipped") => {
    log(`auto-prepare ${reason}`);
    recordEvent(
      {
        event,
        outcome: outcome2,
        reason,
        workspace: root,
        durationMs: now() - started,
      },
      { env },
    );
  };
  const mode = env.PRISM_AUTOPREPARE;
  if (mode === "0" || mode === "off") {
    say("PRISM_AUTOPREPARE off", "prompt.skipped");
    return {};
  }
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const kind = classifyPrompt(prompt).kind;
  if (!PROMPT_KINDS.includes(kind)) {
    say(`not a change request (${kind})`, "prompt.skipped");
    return {};
  }
  const limitMs =
    options.limitMs ?? Number(env.PRISM_AUTOPREPARE_MS ?? AUTO_PREPARE_MS);
  const sessionId =
    typeof input.session_id === "string" && input.session_id
      ? input.session_id
      : undefined;
  let lensText = null;
  let lensReason = "";
  let lensName = null;
  const reply = (parts, reason, summary = []) => {
    const text = parts.filter(Boolean).join(`
`);
    const line = promptSummaryLine(
      lensName && lensText ? [lensName, ...summary] : summary,
      kind === "change",
    );
    const shown = line ? { systemMessage: line } : {};
    if (!text) {
      say(`said nothing (${reason})`, "prompt.quiet");
      return shown;
    }
    say(`injected in ${now() - started}ms: ${reason}`, "prompt.injected", "ok");
    return {
      ...shown,
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: text,
      },
    };
  };
  try {
    const lens = await promptLens(root, prompt, kind, sessionId, env);
    if (lens) {
      lensText = buildPromptPack({ prep: null, prompt, lens }).text;
      lensReason = `; lens ${lens.id}`;
      lensName = lensLabel(lens.name);
    }
  } catch (error) {
    say(
      `lens skipped (${error instanceof Error ? error.message : String(error)})`,
      "prompt.lens",
    );
  }
  if (kind !== "change") return reply([lensText], `${kind}${lensReason}`);
  const request = {
    prompt,
    ...(sessionId ? { sessionId } : {}),
  };
  const busy = (why) => {
    say(why, why.startsWith("no time") ? "prompt.deadline" : "prompt.daemon");
    return reply([lensText], `no file block (deadline)${lensReason}`, [
      "files skipped (index busy)",
    ]);
  };
  const budget = limitMs - (now() - started);
  if (options.files.via === "daemon" && budget < 50)
    return busy("no time left for the file block");
  const outcome = await options.files.call(request, budget);
  if (outcome.kind === "unavailable")
    return busy(`deadline (${outcome.reason})`);
  if (outcome.kind === "error") {
    const details = outcome.error.details;
    if (details?.reason === "language") {
      const note =
        !sessionId || markSessionOnce(root, sessionId, "language", env)
          ? UNSUPPORTED_LANGUAGE_NOTE
          : null;
      return reply([note], "unsupported language", ["language not supported"]);
    }
    say(`skipped (${outcome.error.message})`, "prompt.skipped");
    return reply([lensText], `no file block${lensReason}`);
  }
  const answer = outcome.value;
  const elapsed = now() - started;
  if (elapsed > limitMs) {
    say(`deadline (took ${elapsed}ms, over ${limitMs}ms)`, "prompt.deadline");
    return reply([lensText], `no file block (deadline)${lensReason}`, [
      "files skipped (index busy)",
    ]);
  }
  if (sessionId && answer.text) {
    try {
      rememberShown(sessionId, answer.shown ?? [], env);
      if (answer.named) markLiteSession(root, sessionId, env);
    } catch (error) {
      say(
        `session memory not saved (${error instanceof Error ? error.message : String(error)})`,
        "prompt.session_store",
      );
    }
  }
  return reply(
    [answer.text, lensText],
    `${answer.reason} (${options.files.via})${lensReason}`,
    answer.summary ?? [],
  );
}
export {
  runPromptHook,
  rememberShown,
  promptLens,
  markSessionOnce,
  markLiteSession,
  UNSUPPORTED_LANGUAGE_NOTE,
  PROMPT_KINDS,
  AUTO_PREPARE_MS,
};
