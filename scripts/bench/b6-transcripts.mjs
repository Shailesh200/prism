#!/usr/bin/env node
/**
 * B6 transcript pass (plan P14). Claude Code's `-p --output-format json`
 * `usage` is the last API turn only, so session totals come from the session
 * transcripts in the isolated HOME: every assistant message's usage, counted
 * once per message id, subagent transcripts included.
 *
 *   node scripts/bench/b6-transcripts.mjs enrich RUNS --projects DIR --out FILE
 *   node scripts/bench/b6-transcripts.mjs samples RUNS --projects DIR --out FILE.md
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const lines = (path) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return []; // a line cut by a killed session
      }
    });

/** Mask anything that looks like a credential before it is written out. */
export function redact(text) {
  return String(text)
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(
      /("?(?:token|apiKey|api_key|authorization|password|secret)"?\s*[:=]\s*"?)[^"\s,}]+/gi,
      "$1[redacted]",
    )
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, (m) =>
      /^[0-9a-f]{32,}$/.test(m) ? m : "[redacted]",
    );
}

function allTranscripts(projects) {
  const out = [];
  for (const dir of readdirSync(projects)) {
    const d = join(projects, dir);
    if (!statSync(d).isDirectory()) continue;
    for (const name of readdirSync(d))
      if (name.endsWith(".jsonl")) out.push(join(d, name));
  }
  return out;
}

/** The record's transcript: by session id, else same repo + inside the run's window. */
export function findTranscript(
  projects,
  record,
  all = allTranscripts(projects),
) {
  if (record.sessionId) {
    const hit = all.find((p) => basename(p) === `${record.sessionId}.jsonl`);
    if (hit) return hit;
  }
  const end = Date.parse(record.startedAt);
  const start = end - record.durationMs - 30_000;
  const repoDir = `-repos-${record.repo}`;
  const candidates = all
    .filter((p) => p.includes(repoDir))
    .flatMap((p) => {
      const first = lines(p).find((r) => r.timestamp);
      const at = first ? Date.parse(first.timestamp) : NaN;
      return at >= start && at <= end ? [{ p, at }] : [];
    });
  candidates.sort((a, b) => a.at - b.at);
  return candidates[0]?.p ?? null;
}

function subagentFiles(path) {
  const dir = path.replace(/\.jsonl$/, "");
  const sub = join(dir, "subagents");
  return existsSync(sub)
    ? readdirSync(sub)
        .filter((n) => n.endsWith(".jsonl"))
        .map((n) => join(sub, n))
    : [];
}

function summarizeTool(c) {
  const i = c.input ?? {};
  if (c.name.startsWith("mcp__"))
    return `${c.name.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "prism:")} ${redact(JSON.stringify(i)).slice(0, 80)}`;
  if (i.file_path)
    return `${c.name} ${i.file_path.replace(/^.*\/repos\/[^/]+\//, "")}`;
  if (i.pattern)
    return `${c.name} "${String(i.pattern).slice(0, 60)}"${i.path ? ` in ${String(i.path).replace(/^.*\/repos\/[^/]+\/?/, "") || "."}` : ""}`;
  if (i.command)
    return `${c.name}: ${redact(
      String(i.command)
        .split("\n")[0]
        .replace(/\/(private\/)?tmp\/prism-ab\/repos\/[^/ ]+\/?/g, ""),
    ).slice(0, 110)}`;
  return `${c.name} ${redact(JSON.stringify(i)).slice(0, 80)}`;
}

export function analyze(path) {
  const rows = [path, ...subagentFiles(path)].flatMap(lines);
  const byId = new Map();
  const tools = [];
  let finalText = "";
  let prompt = "";
  const injected = {
    promptHook: 0,
    sessionHook: 0,
    skills: 0,
    mcpInstructions: 0,
  };
  for (const r of rows) {
    if (r.type === "assistant" && r.message) {
      const m = r.message;
      if (m.usage) byId.set(m.id ?? r.uuid, m.usage);
      for (const c of m.content ?? []) {
        if (c.type === "tool_use" && !r.isSidechain)
          tools.push(summarizeTool(c));
        if (c.type === "text" && !r.isSidechain && c.text.trim())
          finalText = c.text;
      }
    }
    if (r.type === "user" && !prompt && typeof r.message?.content === "string")
      prompt = r.message.content;
    if (r.type === "attachment" && r.attachment) {
      const a = r.attachment;
      const size = JSON.stringify(a).length;
      if (
        a.type === "hook_additional_context" &&
        a.hookEvent === "UserPromptSubmit"
      )
        injected.promptHook += size;
      else if (
        a.type === "hook_additional_context" &&
        a.hookEvent === "SessionStart"
      )
        injected.sessionHook += size;
      else if (a.type === "skill_listing") injected.skills += size;
      else if (a.type === "mcp_instructions_delta")
        injected.mcpInstructions += size;
    }
  }
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const u of byId.values()) {
    usage.input += u.input_tokens ?? 0;
    usage.output += u.output_tokens ?? 0;
    usage.cacheRead += u.cache_read_input_tokens ?? 0;
    usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
  }
  return {
    apiCalls: byId.size,
    usage,
    tools,
    prismCalls: tools.filter((t) => t.startsWith("prism:")).length,
    reads: tools.filter((t) =>
      /^(Read|Grep|Glob)\b|^Bash: (cat|sed|head|grep|rg|ls|find)\b/.test(t),
    ).length,
    injected,
    prompt,
    finalText,
  };
}

export function enrich(records, projects) {
  const all = allTranscripts(projects);
  return records.map((r) => {
    const path = findTranscript(projects, r, all);
    if (!path) return { ...r, transcript: null };
    const a = analyze(path);
    return {
      ...r,
      usageLastTurn: r.usageLastTurn ?? { ...r.usage },
      usage: { ...a.usage, costUsd: r.usage.costUsd },
      transcript: {
        apiCalls: a.apiCalls,
        toolCalls: a.tools.length,
        prismCalls: a.prismCalls,
        reads: a.reads,
        injectedChars: a.injected,
      },
    };
  });
}

const total = (u) => u.input + u.output + u.cacheRead + u.cacheWrite;
const fmt = (n) => Math.round(n).toLocaleString("en-US");

function sampleBlock(label, r, a) {
  const text = redact(a.finalText).split("\n").slice(0, 15).join("\n");
  return [
    `### ${label}`,
    "",
    `Tokens ${fmt(total(r.usage))} (input ${fmt(r.usage.input)}, cache read ${fmt(r.usage.cacheRead)}, cache write ${fmt(r.usage.cacheWrite)}, output ${fmt(r.usage.output)}) · cost $${(r.usage.costUsd ?? 0).toFixed(3)} · ${Math.round(r.durationMs / 1000)} s · ${a.apiCalls} API calls · success ${r.success ? "yes" : "no"}`,
    "",
    `Injected context (chars; arm A has only the host's own skills): prompt hook ${fmt(a.injected.promptHook)}, session hook ${fmt(a.injected.sessionHook)}, skill listing ${fmt(a.injected.skills)}, MCP instructions ${fmt(a.injected.mcpInstructions)}.`,
    "",
    "Tool calls, in order:",
    "",
    ...(a.tools.length
      ? a.tools.map((t, i) => `${i + 1}. \`${t.replace(/`/g, "'")}\``)
      : ["(none)"]),
    "",
    "Final response (first 15 lines):",
    "",
    "```text",
    text,
    "```",
    "",
  ];
}

export function samples(records, projects, picks) {
  const all = allTranscripts(projects);
  const out = [
    "# B6 sample transcripts: same task with and without Prism",
    "",
    "Claude Code, isolated HOME, local Prism 2.0 build. Arm A: host alone. Arm B: host + Prism pack (MCP, hooks, skills).",
    "Tokens are session totals from the transcripts (every API call), not the last-turn figure `-p` reports. Credentials are redacted.",
    "",
  ];
  for (const pick of picks) {
    const a = records.find(
      (r) => r.task === pick.task && r.arm === "A" && r.run === pick.runA,
    );
    const b = records.find(
      (r) => r.task === pick.task && r.arm === "B" && r.run === pick.runB,
    );
    const pa = a && findTranscript(projects, a, all);
    const pb = b && findTranscript(projects, b, all);
    if (!pa || !pb) continue;
    const ta = analyze(pa);
    const tb = analyze(pb);
    out.push(
      `## ${pick.task}: ${pick.why}`,
      "",
      "Task prompt (same for both arms):",
      "",
      "```text",
      redact(ta.prompt || tb.prompt),
      "```",
      "",
    );
    out.push(
      ...sampleBlock(
        "Without Prism (arm A)",
        { ...a, usage: { ...ta.usage, costUsd: a.usage.costUsd } },
        ta,
      ),
    );
    out.push(
      ...sampleBlock(
        "With Prism (arm B)",
        { ...b, usage: { ...tb.usage, costUsd: b.usage.costUsd } },
        tb,
      ),
    );
    if (pick.note) out.push(`**Why the difference:** ${pick.note}`, "");
  }
  return out.join("\n");
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const [cmd, runsFile] = process.argv.slice(2);
  const opt = (n) => {
    const i = process.argv.indexOf(`--${n}`);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const records = lines(resolve(runsFile));
  const projects = resolve(opt("projects"));
  if (cmd === "enrich") {
    const out = enrich(records, projects);
    writeFileSync(
      resolve(opt("out")),
      out.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
    console.log(
      `enriched ${out.filter((r) => r.transcript).length}/${out.length}`,
    );
  } else if (cmd === "samples") {
    const picks = JSON.parse(opt("picks") ?? "[]");
    writeFileSync(resolve(opt("out")), samples(records, projects, picks));
    console.log(`wrote ${opt("out")}`);
  } else {
    console.error(
      "usage: b6-transcripts.mjs enrich|samples RUNS --projects DIR --out FILE",
    );
    process.exit(1);
  }
}
