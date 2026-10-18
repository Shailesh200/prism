# M-040 — Stack Detector SPI (early)

| Field | Value |
|---|---|
| Branch | `milestone/M-040-stack-detector-spi` |
| Status | Verified |
| Depends on | M-005 |
| Unlocks | M-006 (soft — AST may proceed in parallel after SPI lands), M-013 |
| Packages | `@repo-prism/intelligence` (SPI host), `@repo-prism/shared` (DTOs), `@repo-prism/core` (list/get stub) |

## Goal

Define a **pluggable stack-detection SPI** and shared profile contracts **before** indexer/graphs/UI specialize. Prism must understand **what kind of project this is** and **which kinds of developers it serves**, across many tech worlds — without Core hard-coding frameworks.

Real detector packs land in **M-013**; this milestone is the façade + registry + stub detectors (same pattern as M-004 LanguagePlugin SPI).

## Two axes (both first-class)

1. **Stack domains** — technology / product surface of the repo  
2. **Developer personas** — inferred audience / contributor shapes (heuristic; not user identity)

A monorepo can score on **many domains and many personas** at once.

### Stack domains

| Domain | Examples (non-exhaustive; grow via plugins) |
|---|---|
| **Frontend** | React, Next.js, Vite, Vue, Nuxt, Angular, Svelte/SvelteKit, Remix, Astro |
| **Backend** | Node/Express/Fastify/Nest, Go, Python (Django/FastAPI/Flask), Java/Spring, .NET, Ruby/Rails, Rust (Axum/Actix) |
| **Mobile** | React Native, Expo, Flutter, Swift/SwiftUI, Kotlin Multiplatform, Native Android/iOS |
| **Desktop** | Electron, Tauri, .NET MAUI, Qt markers |
| **Data / ML / AI** | Jupyter, pandas/numpy, PyTorch, TensorFlow, scikit-learn, Hugging Face, LangChain/LlamaIndex, vector DB clients, light MLOps (MLflow, …) |
| **Data engineering** | Airflow/Dagster/Prefect, Spark/dbt, warehouse SQL project layouts |
| **DevOps / platform** | Docker/K8s/Terraform/Pulumi/Helm, CI-as-code heavy repos |
| **Embedded / systems** | C/C++/Rust firmware markers, Zephyr/Arduino/ESP, RTOS hints |
| **Game** | Unity, Unreal, Godot, game-oriented asset layouts |
| **Tooling / workspace** | Bun/npm/pnpm/yarn, moon/turbo/nx, monorepo layout, linters/test runners |

### Developer personas (inferred)

| Persona | Typical evidence (examples) |
|---|---|
| **Frontend engineer** | UI frameworks, CSS/component libs, web app routers |
| **Backend engineer** | API servers, service frameworks, OpenAPI/gRPC |
| **Full-stack engineer** | Strong FE + BE signals in one workspace |
| **Mobile engineer** | RN/Expo/Flutter/native mobile projects |
| **Desktop engineer** | Electron/Tauri/native desktop toolchains |
| **Data scientist** | Notebooks, exploratory Python data stack |
| **ML engineer** | Training frameworks, experiment tracking, model dirs |
| **AI / LLM app engineer** | LangChain/LlamaIndex, prompt/eval dirs, vector stores |
| **Data engineer** | Pipelines, dbt/Spark/Airflow-style layouts |
| **DevOps / SRE** | Infra-as-code, cluster manifests, observability configs |
| **Platform engineer** | Internal developer platform, shared tooling monorepos |
| **Embedded / systems engineer** | Firmware/HAL/RTOS layouts |
| **Game developer** | Engine projects + content pipelines |
| **Security engineer** | Security tooling layouts, policy-as-code (presence) |
| **QA / test engineer** | Dominant e2e/automation harnesses, test-only packages |

Personas are **signals with confidence**, never a single forced label. Unknown → empty/partial list.

## In Scope

- `StackDetector` SPI: `id`, `domain?`, `personaHints?`, `spiVersion`, `detect(ctx) → StackSignal[]`
- Detector registry + SPI version negotiation
- Shared DTOs: `StackDomain`, `DeveloperPersona`, `StackSignal`, `StackProfile`
- Stub detectors: `unknown`, optional `nodejs-manifest`
- Core: `listStackDetectors()` / stub `getStackProfile()`
- ADR: plugin-based; local manifests only (no network)

## Out of Scope

- Full detector packs (M-013)
- Network registry / model-hub calls
- Identifying individual humans or committing “you are an X developer” UX copy in this milestone
- AST parsing (M-006 / M-034)

## Definition of Done

- [x] SPI + DTOs documented; sequence diagram in package README
- [x] Registry unit tests (register / list / version reject)
- [x] Core can list loaded stack detectors
- [x] Domain + persona enums documented (extensible string unions / registries)
- [x] ADR accepted
- [x] Verify + PROGRESS + owner approval

## Verification

Typecheck · Lint · Unit · Build · Manual SPI doc review

## Owner Approval Checklist

- [x] Domains cover FE / BE / Mobile / Desktop / Data-ML-AI / Data eng / DevOps / Embedded / Game / Tooling
- [x] Personas cover major developer types without forcing a single label
- [x] Multi-stack / multi-persona repos are first-class
- [x] No surface bypasses Core for stack/persona info
