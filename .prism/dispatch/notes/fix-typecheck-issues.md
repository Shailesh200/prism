# Fix typecheck issues

Recent verify failures named `cli:typecheck` with `exited with code 1` and no
source `error TSxxxx` line. Sibling tasks then died with SIGTERM. `cli` (and
`ui`) typecheck ran without `^:build` while their tsconfigs use project
references, so `tsc --noEmit` could start before `shared`/`core` declarations
existed.

## Changed

- `packages/cli/moon.yml` — depend on shared/core; typecheck and build wait
  on `^:build`, same as dispatch / app-shell / mcp-server.
- `packages/ui/moon.yml` — typecheck waits on `^:build` (it already did for
  build).
- `packages/dispatch/src/worker-models.ts` — type the spawned CLI child as
  `ChildProcess` (strict `let child` was implicit).
- `packages/ui/src/RadioGroup.test.ts` — fixture is `readonly RadioOption[]`
  instead of `as const`, so it matches `RadioGroup` / `selectedRadioHint`.

No commit. Host should run typecheck after this.
