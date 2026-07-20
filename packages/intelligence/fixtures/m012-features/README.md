# m012-features

Golden fixture for M-012 Feature Graph.

## Expected features (DoD)

**N = 4** — inference must yield at least these slugs (member files non-empty):

| Slug | Typical signals |
|---|---|
| `auth` | package `packages/auth` |
| `billing` | package `packages/billing` |
| `checkout` | route folder `src/routes/checkout` |
| `dashboard` | directory pack `src/features/dashboard` + README |

## Features

- Auth
- Billing
- Checkout
- Dashboard

## Notes

Heuristics are explainable (ADR-0011). Extra merged evidence is fine; missing any of the four fails the golden test.
