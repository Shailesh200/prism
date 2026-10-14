/**
 * Daemon freshness and warm-answer latency (M-095).
 *
 * Starts the daemon in this process on a generated fixture, then edits one
 * file at a time and measures how long until the new symbol is answerable
 * through the daemon. Also times warm `prepare_change` calls, which is the
 * auto-Prepare path.
 *
 *   bun run build && node scripts/bench/daemon-freshness.mjs [--scale medium] [--edits 20]
 *
 * Not part of `verify:milestone`: the medium fixture takes a minute to index.
 */

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fixturePath, generate, SCALES } from "./generate-fixture.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const scale = arg("scale", "medium");
const edits = Number(arg("edits", "20"));
const prepares = Number(arg("prepares", "20"));

if (!SCALES[scale]) {
  console.error(`daemon-freshness: unknown scale "${scale}"`);
  process.exit(1);
}

const load = (rel) =>
  import(pathToFileURL(join(repoRoot, "packages", rel)).href);

function quantile(values, q) {
  const sorted = [...values].toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

async function sourceFiles(root) {
  const out = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".ts")) out.push(path);
    }
  };
  await walk(root);
  return out.toSorted();
}

const home = await mkdtemp(join(tmpdir(), "prism-daemon-bench-"));
const env = { ...process.env, PRISM_HOME: home, PRISM_DAEMON: "1" };
process.env.PRISM_HOME = home;

await generate(scale, { quiet: true });
const root = fixturePath(scale);
const files = await sourceFiles(root);

const { startDaemon } = await load("daemon/dist/server.js");
const { callDaemonTool } = await load("daemon/dist/index.js");
const { daemonOnIndexed, daemonTools } = await load(
  "mcp-server/dist/daemon.js",
);
const { daemonBuildId } = await load("mcp-server/dist/daemon-attach.js");

const started = await startDaemon({
  buildId: daemonBuildId(),
  tools: daemonTools(),
  onIndexed: await daemonOnIndexed(),
  env,
  timers: false,
  log: () => undefined,
});
if (started.kind !== "started") throw new Error("daemon did not start");

const call = (tool, args) =>
  callDaemonTool({ root, tool, args, env, buildId: daemonBuildId() });

const coldStart = performance.now();
const first = await call("find_symbol", { name: "nothingHere" });
if (first.kind !== "ok") throw new Error(JSON.stringify(first));
const coldMs = performance.now() - coldStart;

const indexedAt = () =>
  started.pool.status().find((row) => row.root === root)?.lastIndexedAt;

const freshness = [];
const indexed = [];
for (let i = 0; i < edits; i += 1) {
  const file = files[(i * 7919) % files.length];
  const name = `benchEdit${i}x${Date.now().toString(36)}`;
  const before = await readFile(file, "utf8");
  const previous = indexedAt();
  const editedAt = performance.now();
  await writeFile(
    file,
    `${before}\nexport function ${name}(): number {\n  return ${i};\n}\n`,
  );
  while (indexedAt() === previous) {
    if (performance.now() - editedAt > 30_000)
      throw new Error("never reindexed");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  indexed.push(performance.now() - editedAt);
  for (;;) {
    const found = await call("find_symbol", { name });
    if (found.kind === "ok" && found.value.items.length > 0) break;
    if (performance.now() - editedAt > 30_000) {
      throw new Error(
        `edit ${i} (${relative(root, file)}) never became visible`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  freshness.push(performance.now() - editedAt);
  await writeFile(file, before);
  await new Promise((resolve) => setTimeout(resolve, 400));
}

// A prompt follows a save by seconds, not milliseconds: let the post-index
// pre-warm finish, as it would before a person types the next request.
await new Promise((resolve) => setTimeout(resolve, 4_000));
const prepareMs = [];
const pick = (i) => relative(root, files[(i * 104729) % files.length]);
for (let i = 0; i < prepares; i += 1) {
  const t = performance.now();
  const answer = await call("prepare_change", {
    task: `fix the export in ${pick(i)}`,
    budget: 800,
  });
  if (answer.kind !== "ok") throw new Error(JSON.stringify(answer));
  prepareMs.push(performance.now() - t);
}

await started.close();
await rm(home, { recursive: true, force: true });

const report = {
  scale,
  files: files.length,
  node: process.version,
  coldIndexMs: Math.round(coldMs),
  editToIndexed: {
    p50: Math.round(quantile(indexed, 0.5)),
    p95: Math.round(quantile(indexed, 0.95)),
    samples: indexed.length,
  },
  editToVisible: {
    p50: Math.round(quantile(freshness, 0.5)),
    p95: Math.round(quantile(freshness, 0.95)),
    max: Math.round(Math.max(...freshness)),
    samples: freshness.length,
  },
  warmPrepare800: {
    p50: Math.round(quantile(prepareMs, 0.5)),
    p95: Math.round(quantile(prepareMs, 0.95)),
    samples: prepareMs.length,
  },
};
console.log(JSON.stringify(report, null, 2));
