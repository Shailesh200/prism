---
title: Using the IDE extension
description: "Screens, reading provenance and risk colour, and day-to-day workflows."
---

The visual surface. Same engine as the CLI, same numbers, arranged for reading.

## First open

Prism indexes the workspace. Until the index exists, screens that need it say so
rather than showing zeroes — an empty chart and an unbuilt index look identical
otherwise and mean different things.

## Screens

| Screen | For |
|---|---|
| **Overview** | Health, DNA, activity, most-connected files |
| **Map** | Structure laid out spatially, with layers |
| **Domains** | Frontend / backend / data / infrastructure when DNA detects them |
| **Impact** | Blast radius, safe delete, rename impact |
| **Trends** | Health over time |
| **Integrations** | Optional connectors, each consented |
| **Settings** | Indexing, appearance, privacy |

## Reading the interface

- **Provenance markers** — estimated vs unavailable; see
  [signal provenance](/docs/concepts/signal-provenance).
- **Risk colour** — green → amber → red maps to
  [risk bands](/docs/concepts/risk-bands).
- **Confidence** — on features and stack signals; low means look before you act.

## Working in it

- Impact → enter a path → blast radius, tests, features.
- Change review reads the working tree for aggregate risk.
- **Review All Changes** (SCM title bar, or `Cmd/Ctrl+Alt+R`) reviews every
  dirty path from git.
- **Blast Quick Pick** (`Cmd/Ctrl+Alt+B`) shows risk + top dependents without
  opening the full panel.
- Map zoom: repository → package → feature → file → symbol; layers overlay
  coupling, churn, tests, risk.
- Right-click: Blast Radius, Safe Delete, Explain, Reveal on Map.

## Multi-root workspaces

Prism indexes every workspace folder on activation (the first folder is active;
others are warm-indexed in the background). Use the status-bar menu →
**Switch workspace folder…** to change which root Impact, Map, and Review use.

## Cursor: extension + agent

Keep the same project open. Add [MCP](/docs/mcp/install), then ask structural
questions in chat while using the map visually. If the agent guesses instead of
calling tools, say once: "Use Prism for that."

## Related

[Settings](/docs/ide/settings) · [Before you edit](/docs/guides/before-you-edit) ·
[Playground](/docs/start/playground)
