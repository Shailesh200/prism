# The Core SDK

**`@repo-prism/core` is the public API. Open a repository, ask it questions. Every
other surface is a presentation layer over this.**

```ts
import { Prism } from "@repo-prism/core";

const opened = Prism.create().openRepository("/absolute/path/to/repo");
if (!opened.ok) throw new Error(opened.error.message);

const workspace = opened.value;
await workspace.index();

const blast = await workspace.blastRadius({ kind: "file", id: "src/index.ts" });
if (blast.ok) {
  console.log(blast.value.band, blast.value.testsLikelyAffected.length);
} else {
  console.error(blast.error.code, blast.error.message);
}
```

`openRepository` takes an **absolute** path. A relative one is refused rather
than resolved against whatever the process happens to have as its working
directory.

## Results, not exceptions

Every method returns `Result<T, PrismError>`:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

An exception is easy to not catch. A discriminated union is not — TypeScript
will not let you reach `.value` without narrowing first, so the failure case
cannot be skipped by accident.

`PrismError` carries a stable `code` from `PrismErrorCode`, a human-readable
message, and optional detail. Branch on the code; display the message.

```ts
import { PrismErrorCode } from "@repo-prism/core";

if (!blast.ok && blast.error.code === PrismErrorCode.NotFound) {
  // the path is not in the index
}
```

## Indexing

Most methods need an index and say so in their error if there is not one.

```ts
await workspace.index();     // build it
await workspace.reindex();   // rebuild after external changes
workspace.getIndexFreshness(); // how stale it is
```

To keep it fresh while files change:

```ts
workspace.startWatch();
// …
workspace.stopWatch();
```

Watch mode debounces, coalesces and retries with backoff. A file that changes
during a reindex is picked up by the next pass rather than dropped.

## What you can ask

| Area | Methods |
|---|---|
| **Orientation** | `getDna`, `getStackProfile`, `getOverviewModel`, `explainArea`, `exploreCode` |
| **Structure** | `getDependencyGraph`, `getKnowledgeGraph`, `getCycles`, `findSymbol`, `findReferences`, `findRoute` |
| **Map** | `getRepositoryMap`, `listLandmarks`, `listPackages`, `saveBookmark`, `listBookmarks`, `removeBookmark` |
| **Impact** | `blastRadius`, `safeDelete`, `renameImpact`, `testImpact`, `breakingChangeHints`, `reviewChanges` |
| **Health** | `getHealth`, `getHealthHistory`, `getEngineeringHealth`, `getTestingReport`, `getSecurityReport` |
| **Domains** | `getBackendReport`, `getBundleWeightReport`, `discoverFrontendRoutes`, `getCwvReport` |
| **Features** | `listFeatures`, `getFeatureGraph`, `navigateFeature` |
| **Tests** | `runWorkspaceTests`, `listWorkspaceTests` |
| **Git** | `getChangedPaths`, `getGitActivity` |
| **Consent** | `listConsent`, `getConsent`, `setConsent` |

The authoritative list is
[`plans/guides/CORE_SDK.md`](https://github.com/Shailesh200/prism/blob/main/plans/guides/CORE_SDK.md),
and a contract test asserts the real surface matches it — so it cannot quietly
drift.

## Change targets

Everything in the impact family takes the same shape, because "what breaks if I
change this" is one question whether the thing is a file or a symbol:

```ts
{ kind: "file",   id: "src/features/cart.ts" }
{ kind: "symbol", id: "useCart", path: "src/features/cart.ts" }
```

`path` disambiguates when several symbols share a name.

## Types

Every DTO is exported from `@repo-prism/shared` with a matching Zod schema. Import
the type for compile-time use, and the schema when validating something that
crossed a process boundary:

```ts
import { BlastRadiusReportSchema, type BlastRadiusReport } from "@repo-prism/shared";
```

Core re-exports the DTO types it returns, so a consumer usually needs only
`@repo-prism/core`.

## Consent

Network-capable operations refuse unless consent is recorded in
`.prism/consent.json`:

```ts
const purposes = workspace.listConsent();
await workspace.setConsent("network.github", true);
```

You cannot pass consent into a call. The engine reads its own store, which is the
point — see [consent and privacy](../concepts/consent-and-privacy.md).

## Stability

`PRISM_API_LEVEL` is exported and printed by `prism --version`. Within an API
level, methods are not removed and result shapes only gain optional fields.

## Related

[Architecture overview](./overview.md) · [Consent and privacy](../concepts/consent-and-privacy.md)
