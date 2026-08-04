# M-029 — CLI Analysis Commands

| Field | Value |
|---|---|
| Status | **Not Started** |
| Branch | `milestone/M-029-cli-commands` (from latest `main`) |
| Depends on | M-028 |
| Unlocks | M-037 |
| Packages | `@prism/cli` |

## 1. Goal

Complete the `prism` command suite so Prism is usable from a terminal and from CI without an editor.
M-028 built the spine and three commands; this fills out the surface and makes the CLI genuinely
scriptable — which means exit codes and thresholds, not just pretty printing.

## 2. Command surface

Grouped by what a user is trying to do, not by which Core method backs them.

### Understand a repository

| Command | Core |
|---|---|
| `prism dna` | `getDna` (M-028) |
| `prism health` | `getHealth` |
| `prism map` | `getRepositoryMap` |
| `prism explain <path>` | `explainArea` |
| `prism explore <path>` | `exploreCode` |
| `prism stack` | `getStackProfile` |
| `prism features` | `listFeatures` |

### Assess a change

| Command | Core |
|---|---|
| `prism blast <path>` | `blastRadius` |
| `prism review` | `reviewChanges` — defaults to the working-tree diff |
| `prism safe-delete <path>` | `safeDelete` |
| `prism rename <from> <to>` | `renameImpact` |
| `prism test-impact <paths…>` | `testImpact` |

### Inspect structure

| Command | Core |
|---|---|
| `prism deps` | `getDependencyGraph` |
| `prism cycles` | `getCycles` |
| `prism refs <symbol>` | `findReferences` |
| `prism symbol <name>` | `findSymbol` |
| `prism route <from> <to>` | `findRoute` |

### Reports

| Command | Core |
|---|---|
| `prism engineering` | `getEngineeringHealth` |
| `prism testing` | `getTestingReport` |
| `prism security` | `getSecurityReport` |
| `prism backend` | `getBackendReport` |
| `prism bundle` | `getBundleWeightReport` |

## 3. What makes this scriptable

The commands are the easy part. These are the requirements that make the CLI useful in CI.

| Requirement | Detail |
|---|---|
| Thresholds | `--fail-on <band>` on every command that produces a risk or score. `prism blast src/x.ts --fail-on high` exits `1` when the band is High. This is the whole point of a CLI in CI |
| Bounded output | `--limit` on every list command, mirroring M-027's tool bounds |
| Human tables | Aligned, truncated to terminal width, colour-coded by band using the **shared** `riskToBand` from M-051 Phase 3 — the terminal must not invent a fourth threshold scheme |
| Machine output | `--json` everywhere, `{ ok, data }` / `{ ok, error }`, DTO verbatim |
| Path arguments | Workspace-relative, tab-completable, validated with a clear error |
| Quiet | `--quiet` suppresses everything but the result and the exit code |
| Shell completions | `prism completions <bash\|zsh\|fish>` if cheap after the suite lands |

## 4. Out of scope

- Watch mode
- Interactive TUI
- Any command whose Core method does not already exist
- npm publishing (M-039)

## 5. Definition of Done

- [ ] Only one milestone `In Progress`
- [ ] Every command above implemented against real Core methods
- [ ] `--json` valid on every command, stdout carrying nothing else
- [ ] `--fail-on` implemented on all score/risk commands, exiting `1` at or above the band
- [ ] Band colouring uses the shared `riskToBand`; no threshold literals in `@prism/cli`
- [ ] `--limit` on every list command
- [ ] Human output readable at 80 columns
- [ ] `@prism/cli` imports only `@prism/core` (contract test)
- [ ] `README.md` documents every command with an example and its exit codes
- [ ] `bun run verify:milestone --force` green
- [ ] Owner approval → commit → merge → Verified → snippet shared

## 6. Verification plan

| Kind | Check |
|---|---|
| Integration | Every command spawned against the fixture; exit 0; `--json` parses |
| Integration | `--fail-on high` exits 1 on a known-high path and 0 on a known-low one |
| Integration | Output at `COLUMNS=80` does not wrap mid-cell |
| Unit | Band colouring matches `riskToBand` at 19/20/59/60 |
| Contract | Command registry matches the README exactly |
| Regression | `prism blast` agrees with the extension's Blast Radius screen for the same path |
| Manual | Run the suite against this repository and read every output as a first-time user |

## 7. Risks

| Risk | Mitigation |
|---|---|
| Twenty commands is a lot of surface to keep correct | One shared command factory: declare name, args, Core call, renderer. Bodies stay thin |
| `--fail-on` semantics differ per command | One shared implementation over the band type; commands only declare which field to test |
| Human tables drift from the UI's numbers | Regression test comparing CLI and Core output for the same path |

## 8. References

- [M-028](./M-028_cli-foundation.md) · [M-051](./M-051_hardening.md) Phase 3 (`riskToBand`) · [ADR-0004](../adr/0004-core-only-integration-surface.md)
