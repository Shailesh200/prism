# M-063 — Agent orientation benchmarks

| Field | Value |
|---|---|
| Milestone | [M-063](../milestones/M-063_distribution.md) |
| Harness | [`scripts/bench/agent-orientation.ts`](../../scripts/bench/agent-orientation.ts) |
| Website | [/benchmarks](https://www.prismhq.in/benchmarks) |

## What we measure

Prism’s wedge is **structural intelligence before an edit**. This harness
compares two agent strategies on three fixture repos:

| Fixture | Edit target | Shape |
|---|---|---|
| `m012-features` | `packages/auth/src/index.ts` | Feature monorepo |
| `m013-mono` | `apps/api/main.ts` | Turbo monorepo |
| `m044-backend` | `express/auth.ts` | Multi-framework backend |

For each repo we run two standard questions:

1. **What is this repository?** — orientation / DNA
2. **Is this edit safe?** — blast radius on the edit target

### Without Prism (baseline)

Simulates a naive coding agent:

- Read `package.json`, `README`
- List `packages/`, `src/`, `apps/`
- Read a handful of source files
- For safe-edit: scan many files for import references

### With Prism

Calls the same Core SDK surface the MCP server exposes:

- **Orient:** `index` → `repository_dna` → `repository_overview`
- **Safe edit:** `index` → `blast_radius`

### Metrics

| Metric | Definition |
|---|---|
| `toolCalls` | Number of discrete read/scan operations |
| `bytesRead` | Bytes returned to the agent context |
| `estimatedTokens` | `bytesRead ÷ 4` (common LLM heuristic) |
| `elapsedMs` | Wall time for the scenario |

Real LLM runs also pay for reasoning tokens and retries. This harness measures
**deterministic proxy costs** you can re-run in CI or on a laptop.

## Re-run

```bash
bun run build
bun run bench:orientation
# optional: bun run bench:orientation -- --out plans/notes/benchmarks-sample.json
```

Latest JSON is written to `plans/notes/benchmarks-latest.json` by default.

## Sample run (2026-08-09)

Machine: darwin / arm64 / Node 22+. After `bun run build`:

```
Totals (6 scenarios, 3 fixtures)
  without Prism: 70 tool calls · 10,474 bytes · ~2,620 est. tokens · 12 ms
  with Prism:    15 tool calls · 35,474 bytes · ~8,870 est. tokens · 1,988 ms
  savings:       79% fewer tool calls
```

Per-scenario **tool call** savings range from **75–83%**. On these *small*
fixtures, estimated tokens can be *higher* with Prism because structured JSON
(DNA, overview, blast radius) is richer than skimming a few tiny files. That
inverts on real repositories: naive import-grep scales with file count; Prism
responses stay bounded.

| Fixture | Orient calls (without → with) | Safe-edit calls (without → with) |
|---|---|---|
| `m012-features` | 14 → 3 | 12 → 2 |
| `m013-mono` | 12 → 3 | 8 → 2 |
| `m044-backend` | 14 → 3 | 10 → 2 |

> **Note:** Prism pays an upfront index cost once per workspace (~0.5–1 s on
> these fixtures). Amortized over a real agent session (many questions), wall
> time favors Prism. The harness runs cold index per scenario for isolation.

Raw JSON: [`plans/notes/benchmarks-latest.json`](./benchmarks-latest.json)

## Limitations

- Does not invoke an LLM — no prompt or model variance
- Token estimate is bytes ÷ 4, not tokenizer-accurate
- Fixture repos are small; savings scale with repository size and coupling

See also: [M-035 performance baseline](./M-035-baseline.md) for indexing wall times.
