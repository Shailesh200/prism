# Core Web Vitals

**Measured loading and responsiveness for a URL you choose, tied back to the
code responsible.**

Core Web Vitals are Google's three headline user-experience metrics: how quickly
the main content appears, how quickly the page responds to input, and how much
the layout jumps around while loading.

Unlike everything else in Prism, this cannot be derived from source. Performance
is a property of a running page, so something has to run one.

## The two ways

**Locally, with Lighthouse.** Prism runs Lighthouse against a URL you give it —
usually your dev server. The measurement is local; installing Lighthouse is the
part that touches the network, and it is separately consented under
`network.package-install` because it writes to `node_modules` and your lockfile.

**Remotely, via PageSpeed Insights.** Prism sends a URL you choose to Google's
API and reads back what it measured. This needs `network.pagespeed` consent.
Only the URL is sent — no source code — but a URL is not nothing, which is why it
is a decision rather than a default.

Both are off until you turn them on. See
[consent and privacy](../concepts/consent-and-privacy.md).

## What you get

Each metric with its measured value and how it rates, plus:

**Attributions.** Which resources contributed to a metric — the element that was
the largest contentful paint, the scripts that blocked the main thread.

**Insights.** Opportunities derived from the audit, never invented. If Lighthouse
did not report something, Prism does not infer it.

**Total Blocking Time**, as a lab stand-in for responsiveness when interaction
data is not available. Lab conditions cannot measure real interactions, because
there is no real user; the honest substitute is to report how long the main
thread was blocked and say that is what it is.

Every report records its source — local Lighthouse, the remote API, or an
ingested artifact — so a number is never separated from how it was obtained.

## Lab, not field

These are lab measurements: one machine, one network profile, one moment. They
are excellent for comparing a change against its predecessor and poor for
predicting what your users on real devices experience.

Use them as a regression signal. A build that moved a metric noticeably in the
wrong direction is worth investigating regardless of the absolute number.

## Together with bundle weight

The pair is more useful than either alone.
[Bundle weight](./bundle-weight.md) tells you what you are shipping; vitals tell
you what shipping it costs. A heavy initial chunk and a slow largest contentful
paint are usually the same finding seen twice, and fixing one moves the other.

## Related

[Bundle weight](./bundle-weight.md) · [Domain screens](./domains.md) · [Consent and privacy](../concepts/consent-and-privacy.md)
