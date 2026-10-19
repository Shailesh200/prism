// Generates the public synthetic classifier subset (B7). Deterministic, no randomness.
const ents = [
  ["hono", "the etag middleware", "src/middleware/etag/index.ts", "compress"],
  ["hono", "the JSX renderer", "src/jsx/components.ts", "jsxRenderer"],
  ["preact", "the hooks module", "hooks/src/index.js", "useEffect"],
  ["preact", "the diff algorithm", "src/diff/index.js", "diffChildren"],
  ["es-toolkit", "the debounce helper", "src/function/debounce.ts", "debounce"],
  [
    "es-toolkit",
    "the compat lastIndexOf",
    "src/compat/array/lastIndexOf.ts",
    "toArray",
  ],
  ["portpilot", "the port killer", "src/main/os/shell.ts", "execFileSafe"],
  [
    "portpilot",
    "the next-free-port finder",
    "src/shared/next-free-port.ts",
    "nextFreePort",
  ],
  ["tenant-app", "the tenant dashboard", "the due date widget", "nextDueDate"],
  [
    "prism",
    "the receipt builder",
    "packages/mcp-server/src/receipt.ts",
    "buildChangeReceipt",
  ],
];
const change = [
  "add a retry option to {a}",
  "refactor {a} so it is easier to test",
  "rename {s} to {s}V2 everywhere",
  "implement caching in {a}",
  "remove the deprecated path from {a}",
  "update {f} to use async/await",
  "make {a} configurable via an env var",
  "extract the parsing logic out of {f} into its own module",
  "support a timeout in {a}",
  "write tests for {s}",
  "can you add logging around {s}",
  "we need {a} to handle empty input",
  "move {s} into a shared util",
  "replace the hand-rolled loop in {f} with a map",
  "let's add a feature flag for {a}",
  "{a} should accept an options object",
  "change the default in {a} to false",
  "please wire {s} into the settings screen",
  "convert {f} to TypeScript",
  "split {f} into two files",
  "introduce a type for the return value of {s}",
  "drop support for the old format in {a}",
  "port {a} to the new API",
  "clean up {f}, it's a mess",
  "can we show a loading spinner while {a} runs",
  "bump the limit in {a} from 10 to 50",
  "{s} needs a jsdoc comment and a unit test",
  "tweak {a} so it returns early when disabled",
];
const bug = [
  "{a} crashes when the input is null",
  "{s} returns the wrong value on leap years",
  "tests in {f} are failing after my last change, fix them",
  "there's an off-by-one in {s}",
  "{a} hangs forever on Windows",
  "TypeError: cannot read properties of undefined in {f}",
  "why does {s} throw sometimes? fix it",
  "{a} silently swallows errors",
  "memory leak in {a} after many calls",
  "{a} is broken since yesterday's merge",
];
const review = [
  "review my changes before I open a PR",
  "can you review the diff in {f}",
  "look over what I changed in {a} and tell me if anything is risky",
  "is this change to {s} safe to merge?",
  "give me a code review of {f}",
  "double-check my edits to {s} before I push",
  "any concerns with how I refactored {a}?",
  "does my change to {f} need more tests?",
  "sanity check the work on {a}",
  "review the PR that touches {s}",
  "what did I break in {a}, if anything?",
  "audit my changes around {s}",
];
const question = [
  "what does {s} do?",
  "where is {a} defined?",
  "how does {a} work?",
  "who calls {s}?",
  "explain {f} to me",
  "what tests cover {s}?",
  "what would break if I changed {s}?",
  "is {a} used anywhere else?",
  "how is the project structured?",
  "which files are the entry points?",
  "what's the difference between {s} and the old version?",
  "why is {a} written this way?",
];
const chit = [
  "hi",
  "thanks!",
  "ok",
  "sounds good",
  "great work",
  "hello there",
  "cool",
  "nice, thank you",
  "good morning",
  "got it",
];
const nonEnglish = [
  "{s} में एक retry विकल्प जोड़ो",
  "{a} को ठीक करो, यह क्रैश हो रहा है",
  "{s} の名前を {s}V2 に変更してください",
  "{a} にタイムアウトを追加して",
  "ajoute une option de délai à {s}",
  "corrige le bug dans {f}",
  "füge {s} einen Test hinzu",
  "behebe den Fehler in {a}",
  "añade registro a {s}",
  "arregla {a}, falla en Windows",
  "给 {s} 添加重试选项",
  "修复 {f} 中的错误",
  "{s}에 타임아웃을 추가해 주세요",
  "adicione cache em {a}",
  "{s} için bir test yaz",
  "исправь ошибку в {f}",
  "aggiungi un'opzione a {s}",
  "{a} ko theek karo, kaam nahi kar raha",
  "{s} ka naam badal do",
  "refactoriza {f}",
];
const fill = (t, e) =>
  t.replaceAll("{a}", e[1]).replaceAll("{f}", e[2]).replaceAll("{s}", e[3]);
const out = [];
const push = (arr, label, n, lang = "en") => {
  let k = 0;
  for (
    let i = 0;
    out.filter((x) => x.label === label && x.lang === lang).length < n;
    i++
  ) {
    const t = arr[i % arr.length],
      e = ents[(i + Math.floor(i / arr.length)) % ents.length];
    const text = fill(t, e);
    if (out.some((x) => x.text === text)) {
      if (++k > 500) break;
      continue;
    }
    out.push({ text, label, lang, source: "synthetic", repo: e[0] });
  }
};
const [c, b, r, q, h] = process.argv.slice(2).map(Number);
push(change, "change", c);
push(bug, "bug", b);
push(review, "review", r);
push(question, "question", q);
push(chit, "chitchat", h);
push(nonEnglish, "change", 40, "other");
process.stdout.write(out.map((x) => JSON.stringify(x)).join("\n") + "\n");
