---
description: Check what depends on a file or symbol before changing it
disable-model-invocation: true
---

Report what depends on whatever the user named after the command — a file, a
symbol, or the code currently in focus.

Follow the `prism` skill: `prepare_change`, then `blast_radius`.

Say plainly whether the change looks contained or far-reaching, and name the
dependents that have to move together. Do not make the edit unless the user
asked for it.
