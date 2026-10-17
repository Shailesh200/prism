# M-XXX — Title

| Field | Value |
|---|---|
| Status | **Planned** |
| Branch | `milestone/M-XXX-short-name` (from latest `main`) |
| Depends on | M-YYY Verified |
| Unlocks | M-ZZZ |
| Packages | `packages/...`, `plans/` |

## 1. Goal

One or two sentences. Say what is true for the user when this milestone is done, and which program section it serves.

## 2. In scope

| Item | Detail |
|---|---|
| Item name | What changes, where, and how a reviewer can see it |

## 3. Out of scope

- Work that looks related but belongs to another milestone (name it).

## 4. DoD

- [ ] Each In scope item done and covered by a test or a recorded check
- [ ] `verify:milestone` green
- [ ] `plans/PROGRESS.md` row updated
- [ ] Owner review → commit → merge → Verified → snippet

## 5. Verification

`bun run verify:milestone` · any manual check, with the command or steps to repeat it.

## 6. Risks

| Risk | Mitigation |
|---|---|
| What could go wrong | What we do about it, or how we notice early |
