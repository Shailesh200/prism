/**
 * `graph.html` (M-096). One offline file: packages and their files, with
 * measured imports beside the selection. No network. Search and copy-as-prompt.
 */

import type { GraphExport } from "./graph-export.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderGraphHtml(graph: GraphExport): string {
  const data = JSON.stringify(graph).replace(/</g, "\\u003c");
  const title = escapeHtml(graph.repository);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prism graph — ${title}</title>
<style>
  :root { color-scheme: dark; --bg: #0a0e1a; --panel: #131926; --panel-2: #0f1420; --fg: #ffffff; --ink: #c5ceda; --muted: #a3b0c0; --line: #2a334a; --brand: #00c2c2; --safe: #10b981; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--ink); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 56px; padding: 10px 20px; background: var(--panel-2); border-bottom: 1px solid var(--line); }
  h1 { margin: 0; font-size: 18px; line-height: 1.3; color: var(--fg); }
  .sub { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  main { min-height: 0; display: grid; grid-template-columns: 280px minmax(0, 1fr) 320px; }
  aside, section { min-width: 0; min-height: 0; overflow: auto; }
  .packages { background: var(--panel-2); border-right: 1px solid var(--line); }
  .inspector { background: var(--panel); border-left: 1px solid var(--line); }
  .kicker { display: flex; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--line); font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
  input { display: block; width: calc(100% - 24px); height: 32px; margin: 10px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); padding: 0 10px; font: inherit; }
  input:focus { outline: none; border-color: var(--brand); }
  .list { display: flex; flex-direction: column; gap: 2px; padding: 4px 8px 16px; }
  button.row, button.file, button.link { font: inherit; color: inherit; cursor: pointer; text-align: left; }
  button.row { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; border-radius: 8px; background: transparent; padding: 8px; }
  button.row:hover { background: rgba(0, 194, 194, 0.08); }
  button.row.on { background: rgba(0, 194, 194, 0.14); box-shadow: inset 2px 0 0 var(--brand); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg); }
  .count { font: 11px/1 ui-monospace, monospace; color: var(--muted); }
  .stage { padding: 20px 24px 32px; }
  .stage h2 { margin: 0; font-size: 20px; color: var(--fg); overflow-wrap: anywhere; }
  .meta { margin: 4px 0 16px; color: var(--muted); font-size: 13px; }
  button.file { display: flex; gap: 12px; align-items: flex-start; width: 100%; margin: 0 0 8px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); padding: 12px 14px; }
  button.file:hover { border-color: #1a8f8f; }
  button.file.on { border-color: var(--brand); background: rgba(0, 194, 194, 0.12); }
  .kind { flex-shrink: 0; height: 20px; display: inline-flex; align-items: center; padding: 0 6px; border-radius: 999px; border: 1px solid var(--line); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; color: var(--muted); }
  .kind.test { color: var(--safe); border-color: #14624a; }
  .file-name { display: block; font: 13px/1.4 ui-monospace, monospace; color: var(--fg); overflow-wrap: anywhere; }
  .file-path { display: block; margin-top: 2px; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
  .pad { padding: 16px; }
  .inspector h2 { margin: 0 0 8px; font-size: 16px; color: var(--fg); overflow-wrap: anywhere; }
  .path { margin: 0 0 12px; font: 12px/1.45 ui-monospace, monospace; color: var(--muted); overflow-wrap: anywhere; }
  button.copy { height: 32px; border: 0; border-radius: 8px; padding: 0 14px; background: var(--brand); color: #000; font-weight: 600; cursor: pointer; }
  h3 { margin: 16px 0 8px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
  button.link { display: block; width: 100%; border: 0; border-radius: 8px; background: transparent; padding: 6px 8px; font: 12px/1.4 ui-monospace, monospace; overflow-wrap: anywhere; }
  button.link:hover { background: var(--bg); color: var(--fg); }
  .empty { color: var(--muted); font-size: 13px; padding: 8px; }
  @media (max-width: 980px) {
    main { grid-template-columns: 1fr; grid-template-rows: minmax(180px, 32vh) minmax(280px, 1fr) minmax(200px, 36vh); }
    .packages, .inspector { border: 0; border-bottom: 1px solid var(--line); }
  }
</style>
</head>
<body>
<header>
  <div>
    <h1>Graph</h1>
    <p class="sub" id="sub">${title}</p>
  </div>
</header>
<main>
  <aside class="packages">
    <div class="kicker"><span>Packages</span><span id="pkg-count"></span></div>
    <input id="q" type="search" placeholder="Search packages and files" aria-label="Search packages and files">
    <div class="list" id="packages"></div>
  </aside>
  <section class="stage" id="stage"></section>
  <aside class="inspector"><div class="kicker">Inspector</div><div class="pad" id="inspector"></div></aside>
</main>
<script id="graph" type="application/json">${data}</script>
<script>
const graph = JSON.parse(document.getElementById("graph").textContent);
const nodes = graph.nodes;
const edges = graph.edges;
const byId = new Map(nodes.map((n) => [n.id, n]));
const stats = graph.stats || {};
document.getElementById("sub").textContent = graph.repository + " · " + (stats.packages || 0) + " packages · " + (stats.files || 0) + " files · " + (stats.tests || 0) + " tests";

function packageKey(node) {
  return node.id.indexOf("package:") === 0 ? node.id.slice("package:".length) : node.id;
}
function isFile(node) { return node.kind === "file" || node.kind === "test"; }
function filesOf(key) {
  return nodes.filter((n) => isFile(n) && n.package === key).slice().sort((a, b) => a.label.localeCompare(b.label));
}
function fileCount(pkg) { return filesOf(packageKey(pkg)).length; }
const packages = nodes.filter((n) => n.kind === "package").slice().sort((a, b) => fileCount(b) - fileCount(a) || a.label.localeCompare(b.label));
let focusKey = packages[0] ? packageKey(packages[0]) : null;
let selectedId = packages[0] ? packages[0].id : null;

function hay(node) { return (node.label + " " + (node.path || "") + " " + (node.package || "")).toLowerCase(); }
function query() { return document.getElementById("q").value.trim().toLowerCase(); }

function visiblePackages() {
  const needle = query();
  if (!needle) return packages;
  return packages.filter((pkg) => hay(pkg).includes(needle) || filesOf(packageKey(pkg)).some((file) => hay(file).includes(needle)));
}
function visibleFiles(key) {
  const files = filesOf(key);
  const needle = query();
  if (!needle) return files;
  const hits = files.filter((file) => hay(file).includes(needle));
  return hits.length ? hits : files;
}
function relations(id) {
  const out = { imports: [], importedBy: [], tests: [] };
  for (const edge of edges) {
    if (edge.from !== id && edge.to !== id) continue;
    const outbound = edge.from === id;
    const other = byId.get(outbound ? edge.to : edge.from);
    const row = { edge, other };
    if (edge.kind === "imports" && outbound) out.imports.push(row);
    else if (edge.kind === "imports") out.importedBy.push(row);
    else if (edge.kind === "tests") out.tests.push(row);
  }
  return out;
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function renderPackages() {
  const list = document.getElementById("packages");
  const shown = visiblePackages();
  document.getElementById("pkg-count").textContent = String(shown.length);
  list.replaceChildren();
  if (shown.length === 0) {
    list.append(el("p", "empty", "No packages match."));
    return;
  }
  for (const pkg of shown) {
    const button = el("button", "row" + (packageKey(pkg) === focusKey ? " on" : ""));
    button.type = "button";
    button.title = pkg.label;
    button.append(el("span", "name", pkg.label), el("span", "count", String(fileCount(pkg))));
    button.onclick = () => select(pkg);
    list.append(button);
  }
}
function linkList(title, rows, host) {
  if (!rows.length) return;
  host.append(el("h3", "", title));
  for (const row of rows.slice(0, 24)) {
    const label = row.other ? (row.other.path || row.other.label) : row.edge.to;
    const button = el("button", "link", label);
    button.type = "button";
    if (row.other) button.onclick = () => select(row.other);
    host.append(button);
  }
}
function renderStage() {
  const stage = document.getElementById("stage");
  const box = document.getElementById("inspector");
  stage.replaceChildren();
  box.replaceChildren();
  const pkg = nodes.find((n) => n.kind === "package" && packageKey(n) === focusKey);
  const selected = byId.get(selectedId) || pkg;
  if (!pkg) {
    stage.append(el("p", "empty", "This repository has no packages in the graph."));
    return;
  }
  const files = visibleFiles(focusKey);
  stage.append(el("h2", "", pkg.label));
  stage.append(el("p", "meta", fileCount(pkg) + " files in this package"));
  if (files.length === 0) stage.append(el("p", "empty", "No files in this package are in the graph."));
  for (const file of files) {
    const button = el("button", "file" + (selected && selected.id === file.id ? " on" : ""));
    button.type = "button";
    button.title = file.path || file.label;
    const kind = el("span", "kind" + (file.kind === "test" ? " test" : ""), file.kind === "test" ? "Test" : "File");
    const copy = el("span", "");
    copy.append(el("span", "file-name", file.label));
    if (file.path && file.path !== file.label) copy.append(el("span", "file-path", file.path));
    button.append(kind, copy);
    button.onclick = () => select(file);
    stage.append(button);
  }
  if (!selected) return;
  box.append(el("h2", "", selected.label));
  const bits = [selected.kind, selected.path, selected.package].filter(Boolean);
  box.append(el("p", "path", bits.join(" · ")));
  const copy = el("button", "copy", "Copy as prompt");
  copy.type = "button";
  copy.onclick = () => {
    const text = "In " + (selected.path || selected.label) + ", what depends on this and what should I read first?";
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    copy.textContent = "Copied";
  };
  box.append(copy);
  const rel = relations(selected.id);
  linkList("Imports", rel.imports, box);
  linkList("Imported by", rel.importedBy, box);
  linkList("Tests", rel.tests, box);
}
function select(node) {
  selectedId = node.id;
  if (node.kind === "package") focusKey = packageKey(node);
  else if (node.package) focusKey = node.package;
  renderPackages();
  renderStage();
}
document.getElementById("q").oninput = () => { renderPackages(); renderStage(); };
renderPackages();
renderStage();
</script>
</body>
</html>
`;
}
