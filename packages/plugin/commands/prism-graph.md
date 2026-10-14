---
description: Export Prism's graph of this repository and summarise its report
---

Run `prism graph export` in the workspace. It writes `graph.json` and
`GRAPH_REPORT.md` and prints where.

Read `GRAPH_REPORT.md` and give the user its findings in a few lines: the most
connected files, any import cycles, heavily imported files no test reaches,
and orphans. Every entry in the report is measured, so quote it rather than
paraphrasing it into something stronger.

If the user named a file or symbol after the command, also call the `graph`
tool on it (`neighbors`, or `path` for "how does A reach B") and add that.
