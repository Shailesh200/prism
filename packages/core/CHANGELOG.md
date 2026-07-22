# @prism/core changelog

## 0.1.0 — 2026-07-23 (M-025 v0 freeze)

### Stable for surfaces

- Documented public SDK surface in [`plans/guides/CORE_SDK.md`](../../plans/guides/CORE_SDK.md)
- Versioning / deprecation policy: [ADR-0019](../../plans/adr/0019-core-sdk-versioning.md)
- `PRISM_CORE_VERSION` → `0.1.0`; `PRISM_API_LEVEL` remains `1`
- Capability flags: `map` and `navigation` enabled when default indexer is wired
- Contract tests lock `PrismClient` / `PrismWorkspace` method names and exports
- Primary DTOs re-exported from `@prism/core` (still defined in `@prism/shared`)

### Experimental (included in freeze inventory; may still evolve)

- `getEngineeringHealth`, `exploreCode`, `getBackendReport`
- Utility jobs, overlays, CWV ingest, mono package selection, consent

### Notes

- Pre-1.0: breaking changes to **stable** APIs require an ADR + `PRISM_API_LEVEL` bump
- Engine packages remain internal; surfaces must not import them
