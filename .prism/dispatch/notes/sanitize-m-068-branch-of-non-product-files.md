# Sanitize M-068 branch of non-product files

## Done

- `packages/host-session/package.json`: removed `@repo-prism/app-shell` from `dependencies`. It remains in `devDependencies` only (same layering as main; type-only imports).
- `bun.lock`: matching workspace entry for `packages/host-session` updated the same way.

No M-068 product files were edited.

## Not done (no shell)

This worker cannot run git. The tracked job notes under `.prism/dispatch/notes/` are still in the index until someone with git runs:

```
git rm --cached -- .prism/dispatch/notes/ask-dispatch-vs-inline-cursor-model-dashboard-re.md \
  .prism/dispatch/notes/ask-dispatch-vs-inline.md \
  .prism/dispatch/notes/attention-cards-inline-controls.md \
  .prism/dispatch/notes/audit-test-cases.md \
  .prism/dispatch/notes/collapsed-rail-and-job-tooltip.md \
  .prism/dispatch/notes/cursor-model-not-default.md \
  .prism/dispatch/notes/resume-button-and-copy-job-link.md \
  .prism/dispatch/notes/review-all-the-uncommitted-changes.md
```

Leave the files on disk. `.gitignore` already ignores `.prism/`. Do not add `.prism/` to the repo. Do not commit from this job.
