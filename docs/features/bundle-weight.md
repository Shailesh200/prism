# Bundle weight

**What your users actually download, broken down by chunk and by package.**

The question this answers is "why is the bundle 900 KB", and the answer is
almost always a small number of dependencies you did not realise were in the
initial chunk.

## Where the numbers come from

Prism reads a bundler's own stats output. It does not estimate sizes from source,
because a bundle is the product of tree-shaking, minification and code-splitting,
and a number derived from source before all three would be fiction.

| Bundler | Artifact |
|---|---|
| **Webpack** | `stats.json` from `webpack --json` or webpack-bundle-analyzer |
| **Vite / Rollup** | rollup-plugin-visualizer JSON (`template: "raw-data"`) |
| **esbuild** | metafile JSON |
| **Next.js** | analyze output under `.next/analyze/` |

## Three ways to get one

**You already have an artifact.** Point Prism at it. No consent needed, because
nothing runs — this is just reading a file you produced.

**Prism finds one.** If a stats file is already sitting in your build output,
Prism can pick it up.

**Prism runs your build.** This needs
[`run.local-build` consent](../concepts/consent-and-privacy.md), because
producing a bundle means executing your repository's own build script and only
that script knows how. On an unfamiliar repository this is equivalent to cloning
it and typing `npm run build`, and the consent prompt says so.

Every report records which of these it came from, so a number is never
detached from how it was obtained.

## What you get

| | |
|---|---|
| **Overview** | Total size, chunk count, and the split between initial and async |
| **Chunks** | Each chunk, its size, and whether it loads up front |
| **Packages** | Every dependency rolled up, with its share of the total |
| **Highlights** | Chunks and modules over the heavy thresholds |

Sizes are reported raw, and gzipped or brotli-compressed where the bundler
provides them. Compressed size is the one your users experience; raw size is the
one your parser experiences. Both matter, for different reasons.

The **initial versus async** split is usually the most actionable number on the
screen. A large total is tolerable if most of it loads on demand. A large
initial chunk is not.

## The package rollup

Module-level output tells you `node_modules/lodash/lodash.js` is 71 KB. The
package rollup tells you lodash is 71 KB, which is the form in which you can act
on it.

Sorting by share of total, and looking for something you would not have guessed
was there, finds the win most of the time.

## When it cannot

If stats could not be produced, the report says why. It does not fall back to an
estimate, because a plausible fabricated size is worse than no size — you would
act on it. See [signal provenance](../concepts/signal-provenance.md).

## From the terminal

```bash
prism bundle --artifact <id>
```

Reports on a stats artifact you have already ingested.

## Related

[Domain screens](./domains.md) · [Core Web Vitals](./core-web-vitals.md) · [Consent and privacy](../concepts/consent-and-privacy.md)
