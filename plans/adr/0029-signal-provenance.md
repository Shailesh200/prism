# ADR-0029: Signal Provenance (measured / heuristic / estimated / unavailable)

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-08-05 (accepted at GA readiness, M-039, once M-051 had implemented it) |
| Decision makers | Owner, Architect |
| Related milestones | **M-051** (implementation), M-017, M-019, M-042, M-046 |
| Supersedes | — (constrains ADR-0013 layer signals and ADR-0023 trends history) |
| Related | [M-051](../milestones/M-051_hardening.md), ADR-0004, ADR-0013, ADR-0023, ADR-0027 |

## Context

Prism's credibility rests on one promise: what it shows you about your repository is true.
Today several numeric signals reach the UI through the same DTO fields whether they were
measured, inferred, or invented — and the surface cannot tell the difference.

Concrete cases found in the 2026-08-05 audit:

| Signal | Reality |
|---|---|
| Map `performance` layer heat | Entirely synthetic — `stableUnit(path)`, an FNV hash of the file path, scaled into 0–1 ([`layer-signals.ts:123-125`](../../packages/repository-map/src/layer-signals.ts)) |
| Map `ownership` layer heat | Hash of the top git author's name; distinct per author but meaningless as a magnitude |
| Map `coverage` layer heat | Real when a matching test file exists; hash-derived when it does not |
| Health history backfill | Historical commit `at` / `commitSha` stamped onto **current-index** health and region scores |
| Overview health ring | Renders `health?.score ?? 0` — a missing score displays as a failing 0/100 |
| Extension `gitStatus` | Set to `"error"` whenever `gitActivity` is null, conflating "not loaded" with "failed" |

Because hashing is deterministic, a synthetic value looks *stable* across runs, which reads as
measurement rather than noise. The source comments call these "honest stubs"; they are honest in
the source and dishonest on screen.

This is not a rendering bug to patch case by case. The DTOs have no way to express *how a number
came to exist*, so every surface — and every future surface (MCP, CLI) — is forced to treat all
numbers as equally trustworthy.

## Decision

**Option B — Provenance is part of the contract.**

1. **Every quantitative signal that crosses `@repo-prism/core` carries provenance.** A new shared type:

   ```ts
   type SignalProvenance =
     | "measured"    // computed from real repository data (git, diagnostics, coverage, build stats)
     | "heuristic"   // computed from real data via an inference rule (fan-in risk, feature guesses)
     | "estimated"   // real computation, but attributed to a subject it was not computed for
     | "unavailable" // no data exists
   ```

2. **The load-bearing invariant:** when provenance is `"unavailable"`, the numeric field **must be
   absent or null**. It is a contract violation to emit a number alongside `"unavailable"`. This is
   what makes fabricated data structurally impossible rather than merely discouraged — there is no
   field to put the fake number in.

3. **No synthetic substitution.** A signal that cannot be measured or inferred from real data is
   `"unavailable"`. Hash-derived, seeded, or placeholder values are removed rather than relabelled.

4. **Surfaces must render absence as absence.** `"unavailable"` renders as an explicit no-data state
   (neutral tone, "No data" legend entry, disabled layer toggle) — never as zero, never as a colour
   on the same scale as real values. `"estimated"` renders visibly distinct from `"measured"`.

5. **Provenance is per signal, not per report.** A `LayerSignalScores` object may be `measured` for
   `debt`, `heuristic` for `risk`, and `unavailable` for `performance` simultaneously.

6. **Additive and optional.** New fields default such that existing consumers keep parsing
   (ADR-0019 frozen-SDK policy). Absent provenance is read as `"heuristic"` for backward
   compatibility, since that is what most existing signals actually are.

## Options Considered

### Option A — Delete the stub layers

- Pros: Immediate, tiny, zero contract change; nothing false can render.
- Cons: Loses the layer toggles entirely, including for repositories where the data *is*
  available (ownership is real when git is present). Does not prevent the next stub from
  being introduced, and does nothing for health history or the 0/100 ring.

### Option B — Provenance in the contract (this ADR)

- Pros: Fixes the whole class rather than the instances; MCP and CLI inherit it for free; makes
  the honest thing the easy thing; gives the UI a principled no-data state.
- Cons: Touches many DTOs; requires a UI pass; `"unavailable"` states will make the product look
  emptier on repositories without git, which is accurate but less impressive.

### Option C — Confidence number only (0–1) on every signal

- Pros: Single numeric field, no enum; composes with ADR-0027's soft-signal confidence.
- Cons: Confidence and provenance are different questions — a hash has no confidence, it has no
  *source*. Low confidence still invites rendering the value, which is the exact failure we are
  fixing.

**Chosen:** Option B. Option A is acceptable as an emergency stopgap for the `performance` layer
only, and is subsumed by B.

## Consequences

- **Positive:** The map, trends, and overview stop overstating what Prism knows. Agent surfaces
  (M-026/M-027) inherit provenance without extra work, which matters more for agents than humans
  because agents cannot apply human scepticism to a number.
- **Positive:** Gives a principled home for ADR-0027's soft-signal confidence to sit beside.
- **Negative:** A git-less repository will show several layers as unavailable where it previously
  showed colour. This is a deliberate reduction in apparent capability in exchange for truth.
- **Negative:** DTO surface grows on a frozen SDK; must be strictly additive.
- **Follow-ups:** M-035 may add a `computedAt` / cost hint alongside provenance; the health history
  backfill should graduate from `"estimated"` to `"measured"` by computing at each sampled commit.

## Compliance

- [ ] Updates Master Plan / PROGRESS (M-051)
- [ ] Updates `plans/guides/CORE_SDK.md` with the provenance contract
- [ ] Linked from milestone doc (M-051)
- [ ] ADR-0013 and ADR-0023 annotated as constrained by this decision

## Notes

Rule of thumb for reviewers: *if you cannot name the file, command, or commit a number came from,
it is not `measured`.* If you cannot name the inference rule either, it is not `heuristic` — it is
`unavailable` and the field should be empty.
