# M-060 — CI and PR Integration

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-060-ci-pr` (from latest `main`) |
| Depends on | M-059 |
| Unlocks | M-061 |
| Packages | `@repo-prism/cli`, `.github/workflows`, `action/` |
| Amends | — |

## 1. Goal

The gate — and the top-of-funnel. Ship an official GitHub Action that runs `prism review` on every
PR, emits SARIF for code scanning, posts a sticky review comment, and documents cold-start
mitigations so teams can adopt Prism in CI without friction.

## 2. Scope

| ID | Problem | Fix |
|---|---|---|
| **P-F1** | No official GitHub Action. | Ship `action/action.yml` (composite) in this repo — setup, cache `.prism`, enforce `fetch-depth: 0`, run `prism review --json --fail-on`, upload the JSON artifact; dogfood it in `.github/workflows/prism-review.yml` on this repo; docs page. Usable as `uses: Shailesh200/prism/action@v1` once the owner tags `v1` (owner action, noted in the milestone). |
| **P-F2** | No SARIF output for code scanning. | `--format sarif` on `review` and `cycles`; validated against the SARIF 2.1.0 schema in tests; documented `codeql-action/upload-sarif` wiring. |
| **P-F3** | No PR comment from review results. | The action renders a sticky markdown comment from the review JSON (risk band, per-file blast, tests to run) via `actions/github-script`; documented and dogfooded. |
| **P-F4** | `npx` cold start is slow. | Docs + action cache `~/.npm` and `.prism`; document the global-install alternative. |

## 3. Out of scope

| Deferred work | Destination |
|---|---|
| Team CI intelligence aggregation | Next planning cycle |
| GitHub App forge overlays | Roadmap pills only (M-062) |
| MCP install registry submission | M-063 Distribution (owner action) |
| Live Argo/Jenkins connectors | Roadmap |

## 4. Definition of Done

- [ ] M-059 Verified and merged; this branch cut from updated `main`
- [ ] Only one milestone `In Progress`
- [x] P-F1 through P-F4 implemented (on `milestone/M-053-presentation-consolidation` per owner)
- [ ] The action runs on this repo's own PRs (dogfood workflow green)
- [x] SARIF output validates against SARIF 2.1.0 schema in tests
- [x] Docs page covers action setup, SARIF upload, and cold-start caching
- [ ] `bun run verify:milestone` green
- [ ] Owner tags `v1` when ready (separate owner action)
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 5. References

- Prism Completion Program (owner plan, 2026-08-08) — Phase 5
- [M-028 CLI Foundation](./M-028_cli-foundation.md) · [M-029 CLI Commands](./M-029_cli-commands.md) — `prism review`, `--fail-on`, `--json`
