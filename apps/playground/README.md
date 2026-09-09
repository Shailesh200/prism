# @repo-prism/playground

Interactive Repository Map playground (M-018). Consumes `@repo-prism/core` via a Vite middleware; shared UI lives in `@repo-prism/ui`.

## Run

```bash
bun --filter @repo-prism/playground dev
# or: bun run playground
```

Opens at http://prismhq.localhost:17331 (not Vite’s default 5173). Override with `PRISM_PLAYGROUND_PORT`.

## Open a repository

Top bar presets:

- **Demo fixture** — small `m012-features` sample (default)
- **Prism (this repo)** — index the Prism monorepo

Or paste any absolute local path and click **Go**.

Optional default via env:

```bash
PRISM_PLAYGROUND_ROOT=/path/to/repo bun run playground
```

## Notes

- Dev: `/api/map?zoom=…&root=…` indexes through Core (cached per path).
- Production build embeds `public/fixture-maps.json` for static preview of the fixture only.
