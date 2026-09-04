# M-063 — Agent orientation benchmarks

| Field | Value |
|---|---|
| Milestone | [M-063](../milestones/M-063_distribution.md) |
| Harness | [`scripts/bench/agent-orientation.ts`](../../scripts/bench/agent-orientation.ts) |
| Website | [/benchmarks](https://www.prismhq.in/benchmarks) |

## What we measure

Prism’s wedge is **structural intelligence before an edit**. This harness
compares two agent strategies on five fixture repos:

| Fixture | Edit target | Shape |
|---|---|---|
| `m012-features` | `packages/auth/src/index.ts` | Feature monorepo |
| `m013-mono` | `apps/api/main.ts` | Turbo monorepo |
| `m044-backend` | `express/auth.ts` | Multi-framework backend |
| `m049-soft` | `src/util.ts` | Soft-signal / test-heavy workspace |
| `m010-cycles` | `b.ts` | Three-file import cycle |

For each repo we run six questions:

1. **What is this repository?** — orientation / DNA
2. **Is this edit safe?** — blast radius on the edit target
3. **Is this codebase healthy?** — health + engineering health
4. **Where does this symbol live?** — `find_symbol`
5. **Which tests should I run?** — `test_impact`
6. **Are there import cycles?** — `dependency_cycles`

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
- **Health:** `index` → `repository_health` → `engineering_health`
- **Find:** `index` → `find_symbol`
- **Tests:** `index` → `test_impact`
- **Cycles:** `index` → `dependency_cycles`

### Metrics

| Metric | Definition |
|---|---|
| `toolCalls` | Number of discrete read/scan operations |
| `bytesRead` | Bytes returned to the agent context |
| `estimatedTokens` | `bytesRead ÷ 4` (common LLM heuristic) |
| `bytesPerCall` / `tokensPerCall` | Context dumped into the window per hop |
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

## Sample run (2026-09-04)

Machine: darwin / arm64 / Node 24. After `bun run build`:

```
Totals (30 scenarios, 5 fixtures)
  without Prism: 325 tool calls · 39,766 bytes · ~9,945 est. tokens (31 / call)
  with Prism:     70 tool calls · 176,572 bytes · ~44,149 est. tokens (631 / call)
  savings:        78% fewer tool calls
  context / question: ~332 → ~1,472 est. tokens
```

Per-scenario **tool call** savings range from **50–91%**. On these *small*
fixtures, estimated tokens per call are *higher* with Prism because structured
JSON is richer than skimming a few tiny files. That is more structure in one
hop, not a token win. The inversion (naive grep growing with file count;
Prism answers staying bounded) shows up on real repositories.

The website `/benchmarks` page publishes this run. Re-run
`bun run bench:orientation` to refresh both
`plans/notes/benchmarks-latest.json` and
`apps/website/data/benchmarks-sample.json`.

> **Note:** Prism pays an upfront index cost once per workspace (~0.5–1 s on
> these fixtures). Amortized over a real agent session (many questions), wall
> time favors Prism. The harness runs cold index per scenario for isolation.

Raw JSON: [`plans/notes/benchmarks-latest.json`](./benchmarks-latest.json)

## Limitations

- Does not invoke an LLM — no prompt or model variance
- Token estimate is bytes ÷ 4, not tokenizer-accurate
- Fixture repos are small; savings scale with repository size and coupling

See also: [M-035 performance baseline](./M-035-baseline.md) for indexing wall times.
