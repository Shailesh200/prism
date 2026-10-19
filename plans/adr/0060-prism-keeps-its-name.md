# ADR-0060: Prism keeps its name; the hero is developer speed

| | |
|---|---|
| Status | **Accepted** (owner, 2026-10-10) |
| Date | 2026-10-10 |
| Milestone | [M-088 Prism identity + hero copy](../milestones/M-088_identity-hero-copy.md) |
| Supersedes | [ADR-0057](./0057-prism-intelligence-unified-product.md) identity and copy parts; [PROGRAM_prism-2.0](../archive/milestones/PROGRAM_prism-2.0.md) §0 "Public identity" and §0.1; Q-026; Q-027 |
| Program | [PROGRAM_focus-reset.md](../milestones/PROGRAM_focus-reset.md) |

## Context

M-077 locked a rename to Prismate (`prismate.io`, `@prismate/*`, GitHub `prismate`) and a hero, "A teammate meant for you.", to be cut over in M-081 and M-086. None of it shipped, but "Prismate" has leaked into nine UI source files. The teammate framing contradicts ADR-0058 (Prism does not run agents) and says nothing a developer can evaluate.

## Decision

1. **The product is Prism.** The rename is cancelled, not deferred. The identity stays: npm `@repo-prism/*`, Marketplace `prismhq.repo-prism`, site `prismhq.in`, GitHub `Shailesh200/prism`.
2. **The hero speaks to developer speed and output quality.** Locked: "Faster agent sessions. Fewer broken builds." The sub-line and kicker follow program §1.1. The category line is "Local context and change checks for coding agents."
3. **Claim rule.** No numbers in public copy until the M-098 real-agent benchmark supports them with intervals that exclude zero. If it does not support the hero, the hero changes.
4. **Banned in shipped copy:** Prismate, teammate, assistant, AI-powered, intelligent, magic, he/him. Enforced by a copy test.

## Consequences

- M-081 (Marketplace publisher rename) and the identity half of M-086 are cancelled.
- PRD, HLD, README, website and package descriptions are updated in M-088.
- Iris (ADR-0052) stays as the internal name for accumulated knowledge. It is not a public product noun in the hero.

## Amendment (owner, 2026-10-17): hero line

Decision 2's hero line is replaced. The text above is kept as history.

- **Headline:** "Your agent's second pair of eyes." Smaller line: "Know before you ship."
- **Intro:** "Local software intelligence that catches what the agent missed. Prism gives your agent the right files before it edits, then flags the code it skipped and the code no test covers."
- **Hero features:** Prepare and Lens Review. SHIP / NO-SHIP is not a hero feature.
- **Public copy makes no TypeScript/JavaScript-only claim and states no Node minimum.**
- Decisions 1, 3 and 4 are unchanged. The name, the identity, the claim rule and the banned words all stand. The phrase "software intelligence" is allowed; "intelligent" stays banned.
- Applied to the website (`apps/website/lib/seo.ts`), `README.md` and the package descriptions. The MCP server's own description (`packages/mcp-server/src/branding.ts`) still uses the category line.
