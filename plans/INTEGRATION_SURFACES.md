# Prism — CLI & MCP Integration (how it looks)

Surfaces are thin adapters over `@repo-prism/core`. Same answers in Map UI, CLI, and MCP.

---

## CLI

Binary: `prism` (via `@repo-prism/cli`)

### Everyday commands

```bash
# Index current repo (cached in .prism/)
prism index

# Repository DNA
prism dna

# Health report (human)
prism health

# Machine-readable for scripts/CI
prism health --json

# Blast radius for a file or symbol
prism blast-radius src/billing/charge.ts
prism blast-radius --symbol chargeCustomer --depth 3 --json

# Safe delete check
prism safe-delete src/legacy/oldUtil.ts

# Feature graph summary
prism features

# Insights
prism insights hotspots
```

### Example human output

```text
Prism  ·  billing-service  ·  offline

Health  84/100
  architecture   stable
  debt           moderate (12 hotspots)
  test coupling  good

Blast radius  chargeCustomer  risk 72
  dependents   18 files · 4 features
  tests        6 likely affected
  route        billing → api → webhooks
```

### CI usage

```bash
prism index --quiet
prism health --json --fail-under 70
prism blast-radius "$CHANGED_FILE" --json > impact.json
```

---

## MCP server

Package: `@repo-prism/mcp-server`  
Transport: stdio (default)

### Cursor / Claude Code config (sketch)

```json
{
  "mcpServers": {
    "prism": {
      "command": "bun",
      "args": ["run", "--cwd", "/path/to/Prism", "packages/mcp-server/src/index.ts"],
      "env": {
        "PRISM_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

Published form later:

```json
{
  "mcpServers": {
    "prism": {
      "command": "prism-mcp",
      "args": ["--workspace", "${workspaceFolder}"]
    }
  }
}
```

### Tools agents call

| Tool | Typical agent question |
|---|---|
| `repository_dna` | What kind of project is this? |
| `repository_map` | Orient me / show structure |
| `repository_health` | How healthy is this repo? |
| `feature_graph` | What features exist? |
| `dependency_graph` | What depends on X? |
| `dependency_route` | How do A and B connect? |
| `blast_radius` | If I change this, what’s affected? |
| `safe_delete` | Can I delete this safely? |
| `rename_impact` | What breaks if I rename this? |
| `hotspots` / `technical_debt` | Where should I be careful? |

### Example agent turn

**User:** What’s the blast radius of `chargeCustomer`?

**Agent (via MCP):** calls `blast_radius` →  

```json
{
  "target": "chargeCustomer",
  "risk": 72,
  "dependents": [
    { "file": "src/api/webhooks.ts", "feature": "Billing" },
    { "file": "src/jobs/retryPayments.ts", "feature": "Billing" }
  ],
  "tests": ["billing.charge.test.ts", "webhooks.payment.test.ts"],
  "summary": "18 files · 4 features · 6 tests likely affected"
}
```

**Agent reply to user:** short explanation + file list (Prism data, not inventing structure).

### Coexistence

| Surface | Role |
|---|---|
| Extension Map | Human spatial navigation |
| MCP | Agent structured queries |
| CLI | Scripts, CI, terminal workflows |

All three call the same Core index — no second brain.

---

## Mockups

Visual concepts: [`mockups/`](./mockups/)
