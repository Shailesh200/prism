---
title: Quickstart
description: "Five minutes from an unfamiliar repository to knowing what is in it."
---

Use one of your own repositories — Prism is more interesting when you can check
whether it is right.

**Needs:** Node.js 26+, and either a global `prism` (`npm i -g @repo-prism/cli`)
or prefix every command with `npx -y @repo-prism/cli`.

## 1. Look before you index

```bash
cd your-repo
prism doctor
```

Confirms which directory Prism treats as the workspace (`git root` is normal).
Override with `--workspace` or `PRISM_WORKSPACE` if needed. A **warn** on Index
cache on first run is expected.

## 2. Build the index (optional)

```bash
prism index
```

`dna`, `health`, `blast`, and other analysis commands call `index` themselves on
first use. Running it now makes the first analysis feel snappy.

## 3. Ask what this project is

```bash
prism dna
```

Frameworks, domains, and confidence for each signal.

## 4. Ask where the risk is

```bash
prism health
prism health --verbose
```

A 0–100 score plus the factors behind it. Higher is better.

## 5. Ask what a change would break

```bash
prism blast src/some/file.ts
```

Add `--delete` for removal risk. Add `--fail-on high` in CI to exit `1` when
risk is high.

## 6. Ask what belongs together

```bash
prism explain src/some/directory
```

## 7. Optional — give an agent the same data

Follow [MCP install](/docs/start/install), then ask in plain language — you never
type tool names.

## Next

| You want | Go to |
|---|---|
| Task recipes | [Guides](/docs/guides/understand-a-repo) |
| Every command | [CLI reference](/docs/reference/cli-commands) |
| Something looks wrong | [Troubleshooting](/docs/help/troubleshooting) |
