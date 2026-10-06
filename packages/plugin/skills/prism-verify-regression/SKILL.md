---
name: prism-verify-regression
description: Verify a change did not regress anything, by checking the session and then running the tests that cover it. Use when asked to check for regressions, verify a fix, confirm nothing broke, or run the right tests after an edit. Prism names what is unproven; the editor's own test and browser tools run the suite.
---

# Verify the change, not the whole repository

"Run the tests" is either too slow to be useful or too narrow to be meaningful.
The useful version is: see what the change reaches, run the checks that cover
it, and say what is still unverified.

## The procedure

**1. See the change.** `guard_session` if the user did not name files. It ranks
the working-tree change and says which files have no test covering them.

**2. Report gaps out loud.** A changed path with no test covering it is the
single most valuable finding here — a green suite that never touches the change
manufactures confidence.

**3. Take blast radius where the change is wide.** `blast_radius` on a changed
component tells you which dependents to check — that is how you avoid testing
only the one page the user mentioned.

**4. Run the checks with your own tools.** Prism selects; it does not execute.
Use the editor's test runner, terminal, or task tools.

**5. Report honestly.** Three separate categories, never merged:

- what you ran and it passed
- what you ran and it failed
- what you did not run, and why

The third is the one that gets dropped, and it is the one that matters. Silence
in its place is a false all-clear.

## Boundaries

Prism has no test runner and no browser. It reads the repository and names what
is unproven. If the editor has no way to run the checks, say they were named
but not executed — do not report a selection as a result.

Never describe a test as passing unless you saw it pass in this session.
