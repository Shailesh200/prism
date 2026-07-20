# ADR-0006: Content hashing with SHA-256

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-07-20 |
| Decision makers | Owner, Architect |
| Related milestones | M-005, M-007, M-033, M-035 |
| Supersedes | — |
| Resolves | Q-006 |

## Context

Incremental indexing needs a stable content fingerprint per file. Candidates: BLAKE3 (faster, often native) vs SHA-256 (ubiquitous via Node `crypto`).

## Decision

**Use SHA-256 (hex digest) for v1 content hashes** via Node.js `crypto.createHash("sha256")`. No native hash addon.

Revisit BLAKE3 in M-035 only if hashing is a measured bottleneck.

## Options Considered

### Option A — SHA-256 via Node crypto (chosen)

- Pros: zero extra deps; portable; stable tooling; matches OPEN_QUESTIONS default.
- Cons: slower than BLAKE3 on large corpora.

### Option B — BLAKE3 native / WASM

- Pros: faster hashing.
- Cons: native binding or WASM complexity; another supply-chain surface before we need it.

## Consequences

- Positive: simple inventory API; hashes stable across runs/platforms for the same bytes.
- Negative: may need algorithm migration later (store algorithm id alongside hash when SQLite lands).
- Follow-ups: M-008 persist `hashAlgo: "sha256"` with digests; M-035 benchmark.

## Compliance

- [x] Updates OPEN_QUESTIONS — Q-006 resolved
- [x] Updates package README — `packages/indexer/README.md`
