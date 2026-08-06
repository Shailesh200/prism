---
title: Install the CLI
description: "Run Prism from a terminal with npx or a global install."
---

## Steps

1. Open a terminal **inside your project**:

```bash
cd /path/to/your/project
```

2. Check the environment (no `--workspace` needed — Prism uses the git root):

```bash
npx -y @repo-prism/cli doctor
```

3. Read the doctor output:
   - **Workspace** — which folder was chosen (`git root` is normal).
   - **Index cache** — `warn` on first run is expected.

4. Run your first analyses:

```bash
npx -y @repo-prism/cli dna
npx -y @repo-prism/cli health
npx -y @repo-prism/cli blast src/index.ts --fail-on high
```

5. (Optional) Install globally:

```bash
npm install -g @repo-prism/cli
prism doctor
prism health --verbose
```

## Requirements

Node.js 26+. You do not need to clone the Prism repository.

## Next

[Usage](/docs/cli/usage) · [Quickstart](/docs/start/quickstart) ·
[Command reference](/docs/reference/cli-commands)
