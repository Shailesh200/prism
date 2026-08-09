# M-035 — Performance baseline pointer

| Field | Value |
|---|---|
| Milestone | [M-035](../milestones/M-035_perf-hardening.md) |
| Status | Verified (2026-08-05) |

M-035 Phase 1.3 called for a committed baseline note. Numbers live in the
benchmark outputs below — not here — so they stay aligned with CI.

## Source of truth

1. **Measured baselines** — [`plans/architecture/08_PERFORMANCE.md`](../architecture/08_PERFORMANCE.md)
   (median wall times and peak RSS at 1k / 10k / 50k files; Apple Silicon
   laptop, Node 26.5.0, 2026-08-05).
2. **Budget ceilings** — [`scripts/bench/budgets.json`](../../scripts/bench/budgets.json)
   (~2× headroom over baseline; `bun run bench:check` compares medians to these).

## Reconciling M-035 §8 vs `08_PERFORMANCE.md`

[M-035 §8](../milestones/M-035_perf-hardening.md) “before / after” captures the
optimization delta at milestone close (e.g. repository map 66.9 s → 5.8 s at
50k). The post-verification **absolute** timings in `08_PERFORMANCE.md` (e.g.
repository map **4.2 s** at 50k) supersede §8 for current baseline reference.
Budget enforcement uses `budgets.json`, not either prose table.

## Regenerate

```bash
bun run bench -- --scale small    # ~1k files
bun run bench -- --scale medium   # ~10k files
bun run bench -- --scale large    # ~50k files
bun run bench:check
```

Fixture generation: [`fixtures/README.md`](../../fixtures/README.md).
