# M-027 — MCP Intelligence Tools Pack

| Field | Value |
|---|---|
| Status | **Not Started** |
| Branch | `milestone/M-027-mcp-tools-pack` (from latest `main`) |
| Depends on | M-026 |
| Unlocks | M-037 |
| Packages | `@prism/mcp-server` |

## 1. Goal

Expose Prism's full intelligence surface to coding agents as MCP tools. M-026 built the spine and
four tools; this milestone fills it out and makes the pack coherent — consistent naming, consistent
shapes, useful descriptions, and bounded outputs.

## 2. Tool inventory

The Master Plan named fifteen tools. Four shipped in M-026. Prism has since grown capabilities that
postdate that list, so the pack is organised by Core capability rather than by the original table.

### Shipped in M-026

`repository_dna` · `repository_health` · `repository_map` · `blast_radius`

### Graphs and navigation

| Tool | Core method |
|---|---|
| `dependency_graph` | `getDependencyGraph` |
| `dependency_cycles` | `getCycles` |
| `feature_graph` | `getFeatureGraph` / `listFeatures` |
| `knowledge_graph` | `getKnowledgeGraph` |
| `find_symbol` | `findSymbol` |
| `find_references` | `findReferences` |
| `dependency_route` | `findRoute` |
| `landmarks` | `listLandmarks` |

### Impact

| Tool | Core method |
|---|---|
| `safe_delete` | `safeDelete` |
| `rename_impact` | `renameImpact` |
| `test_impact` | `testImpact` |
| `breaking_change_hints` | `breakingChangeHints` |
| `review_changes` | `reviewChanges` |

### Health and explanation

| Tool | Core method |
|---|---|
| `engineering_health` | `getEngineeringHealth` — covers the plan's `engineering_entropy`, `technical_debt`, `hotspots` and `knowledge_decay` as one report rather than four thin slices of the same computation |
| `health_history` | `getHealthHistory` |
| `explore_code` | `exploreCode` — covers `similar_component` |
| `explain_area` | `explainArea` |

### Domain reports

| Tool | Core method |
|---|---|
| `backend_report` | `getBackendReport` |
| `testing_report` | `getTestingReport` |
| `security_report` | `getSecurityReport` |
| `bundle_weight` | `getBundleWeightReport` |
| `stack_profile` | `getStackProfile` |
| `domain_report` | `getDomainReport` (added in M-052) |

### Dropped

**`architecture_rules`** is listed in the Master Plan §MCP table and in `PRD.md`, but no such
capability exists in the codebase — there is no rules engine, no rule configuration format and no
Core method. It is dropped from this pack. Building an architecture-rules feature is a product
milestone, not an adapter task. `plans/00_MASTER_DEVELOPMENT_PLAN.md` and `PRD.md` are corrected in
this milestone to stop implying it exists.

## 3. Cross-cutting requirements

These are what make a pack rather than a pile of adapters.

| Requirement | Detail |
|---|---|
| Naming | `snake_case`, noun-first, no `prism_` prefix — the server is already namespaced by the client |
| Descriptions | Written for an agent deciding *whether to call*: what it answers, what it costs, when not to use it |
| Output bounds | Every list-returning tool takes `limit` (default 50, max 500) and reports `truncated` + `totalCount`. An agent context window is a real constraint |
| Path inputs | Accept workspace-relative paths; reject absolute paths outside the workspace with a clear error |
| Errors | Same `PrismError` mapping as M-026; no tool throws raw |
| Consent | Tools reaching consent-gated paths refuse with an explanatory error (M-026 §3) |
| Determinism | Same repository state and same input yields the same output; no timestamps in payloads except where the DTO already carries them |

## 4. Out of scope

- New Core capabilities. If a tool needs something Core lacks, the tool is dropped, not faked
- MCP resources and prompts
- Streaming or partial results
- Tool-level caching beyond the workspace reuse from M-026

## 5. Definition of Done

- [ ] Only one milestone `In Progress`
- [ ] Every tool above registered, with Zod input schema and agent-oriented description
- [ ] Every tool returns real Core data on the fixture repository
- [ ] Every list tool honours `limit` and reports `truncated` / `totalCount`
- [ ] No tool bypasses Core; no engine package imported (contract test)
- [ ] `architecture_rules` removed from Master Plan and PRD with a note
- [ ] `README.md` documents every tool: purpose, inputs, example call, example output
- [ ] `bun run verify:milestone --force` green
- [ ] Manual: connect from Cursor, run an agent task that uses at least four tools together
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 6. Verification plan

| Kind | Check |
|---|---|
| Contract | `tools/list` matches the documented inventory exactly — no undocumented tool, no documented-but-missing tool |
| Contract | Each tool's schema round-trips its fixture input |
| Unit | `limit` clamping at 0, 1, 500, 501 |
| Unit | Absolute path outside the workspace is rejected |
| Integration | Every tool called in sequence against the fixture; all succeed; index built once |
| Integration | Output of each tool is JSON-serializable with no `undefined` and no cycles |
| Manual | A real agent session in Cursor answering "what breaks if I delete X" using the pack |

## 7. Risks

| Risk | Mitigation |
|---|---|
| Twenty-plus tools overwhelm an agent's selection | Descriptions state when *not* to use; overlapping thin tools consolidated into one report tool |
| Large repositories blow the context window | `limit` is mandatory on every list tool, defaulted conservatively |
| Tool surface drifts from Core as Core evolves | Contract test asserts the registry matches the documented list; adding a Core method does not silently add a tool |

## 8. References

- [M-026](./M-026_mcp-server.md) · Master Plan §MCP tool table · [ADR-0004](../adr/0004-core-only-integration-surface.md)
