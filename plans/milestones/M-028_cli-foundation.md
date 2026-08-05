# M-028 — CLI Foundation

| Field | Value |
|---|---|
| Status | **In Review** |
| Branch | `milestone/M-028-cli-foundation` (from latest `main`) |
| Depends on | M-025, M-051, M-052 |
| Unlocks | M-029 |
| Packages | `@repo-prism/cli` |

> **Rewritten 2026-08-05.** The original 36-line version predates the Core SDK freeze.

## 1. Goal

Ship the `prism` binary's spine: argument parsing, workspace resolution, output rendering in both
human and JSON form, exit-code discipline, and three commands that prove the path end to end.
Breadth is M-029.

## 2. Current state

`@repo-prism/cli` is an empty stub. `package.json` declares **no dependencies at all** — not `@repo-prism/core`,
not a CLI framework. `src/index.ts` is 2 lines. There is no `bin` entry.

## 3. Design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | **Commander** | Named in the original milestone; mature, small, good help output |
| Workspace resolution | `--workspace` → `PRISM_WORKSPACE` → nearest ancestor containing `.git` → cwd | Git-root discovery is what users expect from a repo tool |
| Output | Human by default, `--json` for machines | A CLI that only prints JSON is a bad CLI; one that cannot is unscriptable |
| JSON shape | The `@repo-prism/shared` DTO verbatim, wrapped in `{ ok, data }` or `{ ok, error }` | Same contract as Core and MCP; three surfaces, one shape |
| Colour | Auto-detect TTY; `--no-color`; honour `NO_COLOR` | Piped output must be clean |
| Exit codes | `0` ok · `1` analysis found a problem the user asked about · `2` usage error · `3` internal error | Distinguishing "worked, found issues" from "failed" is what makes it usable in CI |
| Consent | Consent-gated paths refuse unless `--yes` is passed explicitly | Unlike an agent, a human at a terminal *can* consent — but never by default |
| Progress | stderr only, suppressed when not a TTY or when `--json` | stdout carries data, nothing else |

## 4. In scope

| Task | Detail |
|---|---|
| 1 | Add `@repo-prism/core` and `commander`; `bin: { prism: "./dist/cli.js" }`; shebang; executable bit |
| 2 | Global options: `--workspace`, `--json`, `--no-color`, `--quiet`, `--verbose`, `--yes`, `--version`, `--help` |
| 3 | Workspace resolution with the precedence above, including git-root discovery |
| 4 | Output layer: `renderHuman(dto)` / `renderJson(dto)` split so no command formats inline |
| 5 | Exit-code discipline enforced in one place |
| 6 | `prism doctor` — environment, workspace, index freshness, capabilities, cache health |
| 7 | `prism index` — build or refresh the index, with progress on stderr |
| 8 | `prism dna` — first real report command, both output modes |
| 9 | Help text: every command with a description, an example, and its exit codes |
| 10 | Integration tests that spawn the real binary and assert stdout, stderr and exit code separately |

## 5. Out of scope

- The full command suite (M-029)
- Shell completions (M-029 if cheap, else M-039)
- npm publishing (M-039)
- Watch mode / long-running processes
- Interactive prompts — `--yes` or refuse; a CLI that blocks on stdin breaks CI

## 6. Definition of Done

- [x] Only one milestone `In Progress`
- [x] `prism --version` prints the Core version and API level
- [x] `prism doctor` succeeds in this repository and on the fixture
- [x] `prism index` and `prism dna` return real Core data
- [x] `--json` output is valid JSON on stdout with nothing else on stdout
- [x] Exit codes behave as documented, including `2` for a bad flag, an unknown command and a bare invocation
- [x] `NO_COLOR` and non-TTY produce unstyled output
- [x] `@repo-prism/cli` imports only `@repo-prism/core` and `@repo-prism/shared` (boundary test over imports and the manifest)
- [x] `bun run verify:milestone` green
- [ ] Manual: read `prism --help` and each subcommand help as a first-time user (**owner**)
- [ ] Owner approval → merge → Verified → snippet shared

### Decisions and findings

**Two bugs the integration tests caught, both invisible in-process.**

1. `prism` with no command printed help and exited **0**. Commander treats a
   bare invocation as success, which means a CI job that typo'd its command line
   would pass silently. It now exits 2.
2. Pointing `--workspace` at a directory that does not exist exited **3**
   (Prism failed) rather than **2** (you asked wrongly). The workspace is now
   checked before Core opens it, so the user error is reported as one.

**Structural choices that make the DoD testable rather than aspirational.**
Commands return data plus a rendering function; they never touch a stream, never
call `process.exit` and never choose their own exit code. A command therefore
*cannot* print a stray line into stdout while `--json` is on. Two boundary tests
enforce it: one asserts stdout is written in a single module, the other that
`process.exit` appears nowhere — `process.exitCode` is used instead, because
`process.exit` truncates pending writes and that is exactly how a JSON payload
arrives half-written.

**Errors go to stdout under `--json`.** In human mode failures go to stderr and
stdout stays empty. In JSON mode the failure envelope goes to stdout, so a
script reading one stream gets the whole story rather than silently seeing
nothing on success-shaped output.

## 7. Verification plan

| Kind | Check |
|---|---|
| Unit | Workspace resolution precedence, including git-root discovery from a nested cwd |
| Unit | Exit-code mapping per outcome class |
| Integration | Spawn `prism doctor`; assert exit 0 and stdout shape |
| Integration | Spawn `prism dna --json`; `JSON.parse(stdout)` succeeds |
| Integration | Spawn with an invalid flag; assert exit 2 and usage on stderr |
| Integration | Spawn with `NO_COLOR=1`; assert no ANSI escapes |
| Contract | No import outside `@repo-prism/core` and its types |
| Manual | Read `prism --help` and every subcommand help as a first-time user |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Bun-built binary misbehaves under Node | Integration tests spawn through the documented entry point; `engines` pinned |
| Progress output corrupts piped JSON | Structural: progress is stderr-only and a test asserts stdout purity |
| Git-root discovery surprises users in nested repos | `doctor` prints the resolved workspace and why it was chosen |

## 9. References

- [ADR-0004](../adr/0004-core-only-integration-surface.md) · [M-029](./M-029_cli-commands.md)
