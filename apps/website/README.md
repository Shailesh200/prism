# @repo-prism/website

Public Prism site: marketing pages, Fumadocs docs (lanes + guides), and a
protected `/admin` dashboard.

```bash
bun run dev      # from this package, or `bun run docs:dev` from repo root
bun run build
```

Content lives in repo-root [`docs/`](../../docs/). Architecture docs are served
only under `/admin/docs`.

See [OWNER_HANDOFF.md](./OWNER_HANDOFF.md) for Vercel / domain steps.
