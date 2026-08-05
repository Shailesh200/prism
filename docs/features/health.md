# Engineering health

**Where the maintenance cost is concentrated, and whether it is getting worse.**

```bash
prism health         # the score and its factors
prism engineering    # the detailed report
prism testing        # test structure and coverage
prism security       # left-shift tooling checklist
```

## The score

One number, 0–100, higher is better. Its value is not the number — it is the
factors underneath, which say *where* the cost is. See
[health score](../concepts/health-score.md) for how it is computed and what it
deliberately does not measure.

## Engineering report

| Signal | What it measures |
|---|---|
| **Entropy** | Structural disorder — files that do too many unrelated things |
| **Drift** | Divergence from the patterns the repository itself established |
| **Debt** | Accumulated shortcuts, weighted by where they sit |
| **Churn** | How much each area changes, from git history |
| **Hotspots** | High churn crossed with high complexity |

Hotspots are the finding to act on. Complex code that nobody touches is not
urgent. Simple code that changes constantly is fine. The intersection — complex
code under constant change — is where incidents come from, and it is the one
combination that neither metric alone identifies.

## Testing report

Structure and coverage. Coverage is read from what your test run produced, and
is [marked measured](../concepts/signal-provenance.md); where there is no
coverage output, Prism says so rather than showing zero. A repository with no
coverage report and a repository with genuinely zero coverage are not the same
repository.

It also reports test-to-source ratio and which areas have no tests at all — that
second one is often more actionable than a percentage.

## Security report

A configuration checklist: whether left-shift tooling exists and is wired up —
dependency scanning, secret scanning, linting rules, CI enforcement.

It is not a vulnerability scanner. It reports whether the tools that would find
vulnerabilities are present, which is a genuinely different claim. A green
security report means you have the equipment.

Only detected tools are listed. An empty list means Prism found nothing, not
that nothing exists.

## Trends

Health is recorded over time, so the interesting question — is this getting
better — is answerable. The Trends screen in the extension plots it, and the
`health_history` MCP tool returns it.

Points recorded before Prism was installed are backfilled from git history and
marked **estimated**. They are directionally useful and should not be read to
the decimal. Points measured since are marked **measured**.

## Using it

The failure mode of a health score is treating it as a target. A team that
optimises the number produces a repository that scores well and is no easier to
work in.

The useful loop is: read the factors, find the hotspot, fix the specific thing,
and let the number move on its own.

```bash
prism engineering --fail-on high
```

as a CI gate stops things getting worse, which is a more achievable goal than
making them better.

## Related

[Health score](../concepts/health-score.md) · [Signal provenance](../concepts/signal-provenance.md) · [Risk bands](../concepts/risk-bands.md)
