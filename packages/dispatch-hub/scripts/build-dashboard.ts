import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "dashboard");
mkdirSync(out, { recursive: true });

const web = await Bun.build({
  entrypoints: [join(root, "src/dashboard/app.tsx")],
  outdir: out,
  target: "browser",
  format: "esm",
  sourcemap: "external",
  naming: "[name].[ext]",
  minify: true,
});

if (!web.success) {
  console.error(web.logs);
  process.exit(1);
}

function readIfPresent(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const uiDist = join(root, "../ui/dist");
const tokens = readIfPresent(join(uiDist, "tokens.css"));
const primitives = readIfPresent(join(uiDist, "primitives.css"));
// The Console mounts `JobsScreen` from app-shell (ADR-0048), so it needs
// app-shell's stylesheet — the job card, console and review rules live there,
// not here. Without it the board renders as unstyled markup.
const appShell = readIfPresent(join(root, "../app-shell/dist/styles.css"));
const local = readIfPresent(join(out, "app.css"));
writeFileSync(
  join(out, "hub.css"),
  [tokens, primitives, appShell, local].join("\n"),
);

writeFileSync(
  join(out, "index.html"),
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Prism Dispatch</title>
  <link rel="icon" href="/assets/prism-mark.png" />
  <link rel="stylesheet" href="/assets/hub.css" />
</head>
<body class="prism-theme">
  <div id="root"></div>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
`,
);

const mark = join(root, "../ui/assets/prism-mark-teal-128.png");
if (existsSync(mark)) {
  copyFileSync(mark, join(out, "prism-mark.png"));
}

console.log("dispatch-hub: dashboard bundled");
