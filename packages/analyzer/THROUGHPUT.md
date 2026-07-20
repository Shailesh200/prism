# Oxc TypeScript plugin — throughput note (M-006)

Baseline measured on the developer machine while landing M-006 (not a CI gate).

| Fixture | Operation | Observed |
|---|---|---|
| `fixtures/sample.ts` (~30 LOC) | `analyzeFile` (parse + extract) | typically **&lt; 5 ms** warm |
| `fixtures/sample.tsx` | `analyzeFile` | typically **&lt; 5 ms** warm |
| `fixtures/multi/*` (2 files) | sequential `analyzeFile` | typically **&lt; 10 ms** total warm |

Notes:

- Parser: `oxc-parser` `parseSync` (ADR-0003).
- Extraction walks the Oxc program + uses `module.staticImports` / `staticExports`.
- Reference hints are **call-site only** (not type-accurate); deep TS optional later (ADR-0009).
- Re-measure under M-007 / M-035 when indexing whole repos.
