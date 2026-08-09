# Prism Review Action

Composite GitHub Action that runs `prism review` on pull requests.

See [Wire into CI](https://www.prismhq.in/docs/guides/wire-into-ci) for setup,
SARIF upload, sticky comments, and cold-start caching.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: Shailesh200/prism/action@v1
  with:
    fail-on: high
```

Until `v1` is tagged, reference a commit SHA or use `./action` from this repo
(see `.github/workflows/prism-review.yml` for the dogfood workflow).
