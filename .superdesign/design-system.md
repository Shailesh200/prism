# Prism Console — design system (inspector chrome)

Product: **Prism** local-first Software Intelligence. The Console is the Dispatch control plane (jobs, Attention, Iris/Spectrum). Instrument-grade, not chat. No avatars, no first-person Iris.

## Tokens (from `packages/ui/src/tokens.css`)

- Canvas `#0a0e1a` · panel `#131926` · tile `#1e2433` · line `#2a334a`
- Ink `#ffffff` / `#e6f0f2` / `#94a3b8`
- Brand teal `#00c2c2` on-brand white · accent sky `#38bdf8` · amber `#f59e0b` · rose `#f43f5e`
- Font: Inter; mono: JetBrains Mono
- Radius 6 / 8 / 12 / pill; space 4 / 8 / 16 / 24 / 32
- Button **md**: 8×16px, 13px type. Button **sm**: 5×10px, 12px type.

## Components

- **Badge** — status pill, nowrap, amber = Awaiting approval
- **Drawer** — right overlay; footer is a thin bar, actions `justify-content: flex-end`, not a three-column stretch
- **Attention card** — title + badge, one-line repo, question copy, then compact actions
- **Checks banner** — title on its own line; failing command in a mono block; aside note in muted type. Never one concatenated sentence.

## Known defects to reproduce (current UI)

1. `.attention-card__actions .prism-btn { flex: 1 1 auto; min-width: 7rem; }` makes Start anyway / Cancel / Open job huge equal-width bars.
2. Checks failed is `lastActivity — verificationDetail` as one wrapping rose paragraph.
3. Save brief is a tall primary in the inspector; it should be `sm`, hugging bottom-right, disabled until the brief is dirty.

## Constraints

Use ONLY these fonts, colors, spacing, and button styles. Do not introduce serif, purple gradients, or off-token radii.
