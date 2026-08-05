# ADR-0011: Feature inference principles (v1)

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-07-20 |
| Decision makers | Owner (via M-012) |
| Related milestones | M-012, M-016, M-019 |
| Related | [ADR-0004](./0004-core-only-integration-surface.md) (Core façade) |

## Context

Prism’s Map and navigation need a **feature-first** view of the repository. Perfect product-domain understanding is out of scope; v1 must still produce explainable clusters from local signals only (no ML, no network).

## Decision

1. **Explainable:** every inferred feature carries `evidence` strings (heuristic id + path/name cue). No opaque scores without reasons.
2. **Tunable:** heuristics are pure functions over `IndexSnapshot` + optional workspace files (`package.json`, `README.md`). Confidence is a documented 0–1 blend; later milestones may weight/config without changing Core shapes.
3. **Merge by slug:** multiple heuristics that name the same feature (`auth`, `@acme/auth` → `auth`) merge members and keep **max** confidence with **union** evidence.
4. **v1 signals (ordered by typical confidence):**
   - Directory packs: `features|modules|domains/<name>/` (~0.85)
   - Local packages (non-root `package.json`) (~0.80)
   - Route/page folders: `routes|pages/<name>/` (~0.75)
   - `src/<name>/` directory boundaries (≥2 files, non-noise) (~0.55)
   - README `## Features` / `## Capabilities` bullets (~0.60; attach files when a matching folder exists)
5. **Graph:** feature nodes + `contains` → member files; `related` when a member file imports a file owned by another feature (best-effort relative resolve).
6. **Surfaces:** only `@repo-prism/core` exposes `getFeatureGraph()` / `listFeatures()`; builder lives in `@repo-prism/intelligence`.

## Options Considered

### Option A — ML clustering on embeddings

- Pros: May discover non-obvious clusters.
- Cons: Opaque; needs models/network or large assets; out of milestone scope.

### Option B — Heuristic + confidence + evidence (chosen)

- Pros: Local-first, testable golden fixtures, tunable.
- Cons: Misses features that lack folder/package/README cues.

## Consequences

- Positive: Map/nav can ship on deterministic features; DoD fixtures are reviewable.
- Negative: Flat or poorly named repos yield sparse graphs until DNA/config improves (M-013+).
- Follow-ups: optional user overrides / ignore lists; richer route frameworks (Next app router groups).

## Compliance

- [x] Linked from M-012 milestone
- [ ] Master Plan unchanged (roadmap already lists M-012)
