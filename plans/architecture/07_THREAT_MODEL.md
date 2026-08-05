# 07 — Threat Model

> Companion to [01_HLD](./01_HLD.md) and [02_LLD](./02_LLD.md).
> Source: security & privacy audit 2026-08-05, hardened in M-036.

This document states plainly what Prism executes, what leaves the machine, and
what is stored — including the parts that are uncomfortable. A threat model that
only lists what we got right is marketing.

## 1. What Prism is, in security terms

A local process that reads a directory of source code and writes derived
analysis next to it. It has no server, no account, and no privileged
installation step. Its blast radius is the permissions of the user who ran it.

## 2. Trust boundaries

| # | Boundary | Crossed by | Trusted? |
|---|---|---|---|
| B1 | The opened repository → Prism's analysis | Reading and parsing files | **No.** File contents are untrusted input to the parsers |
| B2 | The opened repository → your shell | `npm run <script>` during bundle analysis and the frontend lab | **No**, and this is the sharpest edge — see §4 |
| B3 | Webview → extension host | Structured RPC messages, validated by `protocol-guards.ts` | **No.** Every message is shape-checked before dispatch |
| B4 | Agent (MCP client) → Core | Read-only tools over stdio | **No.** Path arguments are validated and clamped to the workspace |
| B5 | CLI argument → Core | Paths and symbol names | **No.** Paths outside the workspace are refused, not clamped |
| B6 | Prism → a remote host | Only through a granted consent purpose | Consent is the boundary |
| B7 | Prism → `.prism/` | Cache, history, consent, staged metadata | Trusted output; readable by anyone with filesystem access |

## 3. What leaves the machine

Nothing, until a specific purpose is granted. The full list is in
[PRIVACY.md](../../PRIVACY.md); the model is in
[ADR-0024](../adr/0024-opt-in-network-integrations.md).

Two properties matter more than the list:

1. **The decision lives in Core**, in `.prism/consent.json`. Before M-036 the
   authority was a browser `localStorage` flag, so a direct SDK, MCP or CLI
   caller was bound by nothing.
2. **No caller can assert consent.** The Core gate reads the record; it does not
   accept a "the user said yes" argument. It used to, and every host passed
   `true` unconditionally — which meant the gate recorded consent rather than
   requiring it.

Enforcement is `packages/core/src/no-network.integration.test.ts`, which runs
the analysis surface with the socket layer trapped and fails the build on any
attempt.

## 4. Prism executes code from the repository you open

This is the finding that deserves to be read rather than discovered.

Bundle analysis and the frontend lab run the target repository's own build
script:

- `packages/intelligence/src/utilities/bundle-analyze-runner.ts`
- `packages/intelligence/src/utilities/lab-server.ts`

Both the script *name* and its *body* come from the target repository's
`package.json`. So: **opening an untrusted repository in Prism and granting
`run.local-build` executes that repository's code with your permissions.**

This is inherent to the feature. Measuring a bundle requires producing one, and
a project's build is the only thing that knows how. The mitigations are honesty
and consent, not sandboxing:

- The capability is behind its own consent purpose, `run.local-build`, whose
  text says "That script is code from the repository you opened, and it runs
  with your permissions."
- Nothing on the *analysis* path — index, graphs, health, impact, every report
  except bundle weight — spawns anything from the repository. Opening and
  exploring a repository is safe; measuring its bundle is the step that is not.
- Real sandboxing (a container, a seccomp profile, a restricted user) is a
  substantial piece of work with its own milestone. It is not pretended here.

Treat granting `run.local-build` on an unfamiliar repository exactly as you
would treat cloning it and typing `npm run build`.

## 5. Untrusted input reaching a parser

Prism parses arbitrary TypeScript, JavaScript, JSON, YAML and lockfiles from the
repository under analysis (B1). A malicious file cannot execute anything — the
parsers are pure — but it can:

| Risk | Mitigation |
|---|---|
| Exhaust memory or time with a pathological file | Per-file size limit, configurable in Settings; the default skips files over 5 MB |
| Crash a parse and lose the whole index | Per-file failures are collected as warnings; indexing continues |
| Poison derived output with misleading names | Accepted. Prism reports what the repository says about itself; that is the job |

## 6. Path handling

| Surface | Rule |
|---|---|
| CLI | A path outside the workspace is **refused**, not clamped. Clamping would report "nothing depends on this" about a file Prism never looked at |
| MCP | Same rule, plus normalisation to workspace-relative POSIX form before Core sees it |
| Webview | Paths originate from Core output, and messages are shape-validated at the host boundary |

`prism review` reads the git working tree and scopes results to the workspace,
which matters when the workspace is nested inside a larger repository.

## 7. Secrets

Prism holds no secrets of its own. Tokens you enter for an integration are held
by the host surface, not by Core, and never reach `.prism/`.

A contract test asserts that no Core DTO declares a field named for a token,
key, secret, password or credential — so a future report cannot start carrying
one by accident.

## 8. What this model does not cover

- Supply-chain integrity of Prism's own dependencies. Standard lockfile and
  registry trust applies.
- Signing or provenance attestation for the published extension (M-039).
- Multi-user or shared-machine scenarios. `.prism/` inherits the repository's
  filesystem permissions and nothing more.
- Encrypting `.prism/`. It holds derived local data, not secrets, and
  encrypting it would imply a guarantee that a filesystem-readable cache cannot
  make.
