# Extension points

**Two places Prism is designed to be extended without touching the analysis
pipeline: language plugins and stack detectors.**

Both exist for the same reason. Adding support for a language or a framework is
a task someone should be able to do without understanding indexing, graph
construction or report derivation — and without being able to break them.

## Language plugins

A language plugin turns source text into the facts the index stores.

It receives a file's contents and returns symbols, imports and diagnostics. It
does not decide what is indexed, what is cached, or what any of it means.

**The contract is versioned.** A plugin declares which interface version it
implements, and the host refuses one it does not understand rather than calling
it and hoping. A plugin that throws is contained: the file is recorded as failed
to parse, and the rest of the index proceeds.

That containment is what makes parse health a useful health factor. A repository
where a third of files failed to parse is legible as exactly that, rather than
as a crash or as a repository that mysteriously has fewer files than it does.

**A plugin must never execute the code it parses**, and must never read outside
the workspace.

Today the shipped plugin covers TypeScript and JavaScript, via Oxc. Files in
other languages are indexed for structure without a plugin, which is why they
have size and churn but no symbols. See
[known limitations](../reference/known-limitations.md).

## Stack detectors

A stack detector decides whether a repository uses a particular framework, tool
or pattern.

It declares the evidence it looks for — dependency names, config filenames,
import patterns, directory conventions — and how much each piece counts. The
host gathers evidence once and scores every detector against it, which is why
adding a detector does not mean another pass over the repository.

**Detectors return confidence, not a boolean.** A detector that found a config
file and a hundred matching imports is on much firmer ground than one that found
a single dependency, and collapsing both to "yes" throws away the part a reader
needs. See [stack detection](../concepts/stack-detection.md).

Detection is descriptive. A framework Prism fails to detect does not degrade the
rest of the analysis, because the graphs are built from imports rather than from
detection.

## Where they live

Both interfaces are in the engine: language plugins in `@repo-prism/analyzer`, stack
detectors in `@repo-prism/intelligence`. Neither is part of the public Core API — they
are how Prism is extended internally, not a plugin system for end users.

If you want to add one, [CONTRIBUTING](https://github.com/Shailesh200/prism/blob/main/CONTRIBUTING.md)
covers the working agreement, and the existing detectors are the best
specification of the shape.

## Related

[Packages](./packages.md) · [Stack detection](../concepts/stack-detection.md) · [Data flow](./data-flow.md)
