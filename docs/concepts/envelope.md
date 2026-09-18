---
title: Envelope
description: "A local receipt for every Intelligence call — counts and bytes, never source."
---

The Envelope is a **ledger**, not a product you log into.

Each successful Intelligence MCP call appends one JSON line under
`~/.prism/envelope-ledger.jsonl`. The line records the tool name, item
counts, whether the list was truncated, the limit, and the JSON byte size.

It does **not** record prompts, paths, or file bodies. It is never uploaded.
See [consent and privacy](/docs/concepts/consent-and-privacy).

The Console Iris screen (`#/iris`) reads that file for the selected
repository and shows bytes kept vs a full dump. A missing file is “no
sessions,” not `0%`.

Lists elsewhere in Prism follow the same honesty: `items`, `totalCount`,
`truncated`. A search that matched sixty names and returned fifty must say
so.

## Related

[Envelope and Iris](/docs/guides/envelope-and-iris) ·
[Signal provenance](/docs/concepts/signal-provenance)
