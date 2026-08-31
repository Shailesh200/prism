import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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

const uiDist = join(root, "../ui/dist");
const tokens = existsSync(join(uiDist, "tokens.css"))
  ? readFileSync(join(uiDist, "tokens.css"), "utf8")
  : "";
const primitives = existsSync(join(uiDist, "primitives.css"))
  ? readFileSync(join(uiDist, "primitives.css"), "utf8")
  : "";
const local = existsSync(join(out, "app.css"))
  ? readFileSync(join(out, "app.css"), "utf8")
  : "";
writeFileSync(join(out, "hub.css"), [tokens, primitives, local].join("\n"));

writeFileSync(
  join(out, "index.html"),
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Prism Jobs</title>
  <link rel="stylesheet" href="/assets/hub.css" />
</head>
<body class="prism-theme">
  <div id="root"></div>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
`,
);

console.log("dispatch-hub: dashboard bundled");
