---
name: prism-safe-change
description: Check what depends on code before editing, renaming or deleting it. Use before modifying unfamiliar code, before renaming an exported symbol, before deleting a file or function, or whenever asked whether a change is safe. Answers "what breaks if I touch this" from a local index instead of by grep.
---

# Look before you edit

The failure this prevents is specific: an agent reads two or three open files,
concludes a symbol is used in one place, changes it, and breaks four call sites
it never opened. Grep does not reliably find them — re-exports, aliased imports,
and dynamic references all hide from a text search. A resolved dependency graph
does find them.

## Before editing unfamiliar code

Call `prepare_change` with the task, then `blast_radius` on the file or symbol.
`prepare_change` names the files, the tests, and the house style, and it does
not return file bodies. `blast_radius` returns what depends on the target and
how far the effect reaches.

Read the result before deciding scope. A small radius means edit freely. A large
one means the change needs care, and possibly a smaller first step. Say which
you found — the user cannot see the tool output, and "this is used in 31 places
across 4 packages" changes how they want to proceed.

Skip this for code you have already read in full this session, and for genuinely
local edits: a comment, a string literal, a function body with no signature
change. The habit is worth having, not worth performing.

## Before renaming or deleting

`blast_radius` on the symbol or file. It returns the dependents that have to
move together. A half-applied rename that typechecks is worse than one that
does not, because it means two names now refer to the same thing. If something
still depends on a file you meant to delete, either the deletion is wrong or
the dependents go first; say which and let the user choose.

## After the edit

`guard_session` ranks the dirty session and says which changed files have no
test covering them. Run those checks rather than guessing the whole suite.

## A note on job workers

If you are a Prism job worker, your intelligence tools answer against the **host
checkout**, not your worktree. Structural facts — who imports this, what depends
on it — are the same either way and are exactly what to ask for. Questions about
code you just wrote are not; read your own files for those.
