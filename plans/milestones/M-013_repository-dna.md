# M-013 — Repository DNA & Detection

| Field | Value |
|---|---|
| Branch | `milestone/M-013-repository-dna` |
| Status | Verified |
| Depends on | M-012, M-040 |
| Unlocks | M-014 |
| Packages | `@repo-prism/intelligence`, `@repo-prism/core` |

## Goal

Produce a compact **Repository DNA** profile from the Stack Detector SPI:

- languages & package managers  
- **multi-domain** stacks (frontend, backend, mobile, desktop, data/ML/AI, data eng, DevOps, embedded, game, tooling)  
- **inferred developer personas** (who this repo is “for”)  
- architecture style signals, test runners, structural fingerprints  

## In Scope

### Detector packs (local manifests / paths only)

Ship v1 packs across domains (extend via plugins afterward):

| Domain | Priority detectors |
|---|---|
| **Frontend** | React, Next.js, Vite, Vue/Nuxt, Angular, Svelte/SvelteKit, Remix, Astro |
| **Backend** | Node (Express/Fastify/Nest), Go, Python (Django/FastAPI/Flask), Java/Spring, .NET, Ruby/Rails |
| **Mobile** | React Native, Expo, Flutter, Swift/SwiftUI, Kotlin/Android |
| **Desktop** | Electron, Tauri |
| **Data / ML / AI** | Jupyter, pandas/numpy, PyTorch, TensorFlow, scikit-learn, Hugging Face, LangChain/LlamaIndex, light MLOps |
| **Data engineering** | dbt, Airflow/Dagster/Prefect (presence), Spark project markers |
| **DevOps / platform** | Docker, K8s, Terraform/Pulumi, heavy CI-as-code |
| **Embedded / game** | Best-effort markers (expand post-GA as needed) |
| **Tooling** | Bun/npm/pnpm/yarn, moon/turbo/nx, test runners, linters |

### Personas

Derive `DeveloperPersona[]` with confidence from stack signals (see M-040 table). Examples of customized later support:

| Persona lens | Later product use |
|---|---|
| Frontend | Component/route-oriented map layers |
| Backend | Service/API blast-radius defaults |
| Mobile | App entrypoints, native module caution |
| Data scientist | Notebook-aware navigation |
| ML / AI engineer | Training vs serving / prompt-eval regions |
| DevOps / SRE | Infra path isolation, change-risk weighting |
| QA | Test-graph emphasis |

- Architecture hints: layered, modular monolith, package-based, client/server split, notebook-heavy, infra-heavy, etc.
- Enriched `DnaReport` / `StackProfile` + Core `getDna()` / `getStackProfile()`
- Partial DNA when unknown; **multi-domain + multi-persona** always allowed

## Out of Scope

- Network CVE / registry / model-hub calls  
- Running notebooks or training models inside Prism  
- Full language grammars (M-034)  
- HR/org “role” assignment — personas are **repo-shaped heuristics** only  

## Definition of Done

- [x] Fixtures for at least: FE, BE, Mobile, Data-ML-AI, and one persona-rich multi-domain monorepo (`packages/intelligence/fixtures/m013-*`)
- [x] Unknown stack → partial DNA (no throw)
- [x] Multi-domain + multi-persona fixture reports multiple entries
- [x] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Integration · Build · Manual DNA JSON review

## See also

- [M-040 Stack Detector SPI](./M-040_stack-detector-spi.md)
- [ADR-0007](../adr/0007-stack-detector-spi.md)
