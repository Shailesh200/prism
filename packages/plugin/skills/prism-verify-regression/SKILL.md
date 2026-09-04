---
name: prism-verify-regression
description: Verify a change did not regress anything, by selecting the tests that actually cover it and then running them. Use when asked to check for regressions, verify a fix, confirm nothing broke, or run the right tests after an edit. Prism picks the suite; the editor's own test and browser tools run it.
---

# Verify the change, not the whole repository

"Run the tests" is either too slow to be useful or too narrow to be meaningful.
The useful version is: work out which tests cover what changed, run those, and
say what is still unverified.

## The procedure

**1. Find what changed.** `changed_paths` if the user did not say. It reports
the working-tree and branch diff.

**2. Select the suite.** `test_impact` on those paths returns the tests that
cover them.

Report gaps out loud. If a changed path has no test covering it, that is the
single most valuable finding here — running a green suite that never touches
the change is worse than not running it, because it manufactures confidence.

**3. Run them with your own tools.** Prism selects; it does not execute. Use the
editor's test runner, terminal, or task tools.

**4. For anything user-facing, drive the browser.** If the change touches routes,
components or interaction, use your Playwright or browser tools to exercise the
affected flow. `blast_radius` on a changed component tells you which screens to
check — that is how you avoid testing only the one page the user mentioned.

**5. Report honestly.** Three separate categories, never merged:

- what you ran and it passed
- what you ran and it failed
- what you did not run, and why

The third is the one that gets dropped, and it is the one that matters. "No
Playwright configured, so the checkout flow is unverified" is a useful sentence.
Silence in its place is a false all-clear.

## Boundaries

Prism has no test runner and no browser. It reads the repository and names the
tests. If the editor has no way to run them, say the suite was selected but not
executed — do not report a selection as a result.

Never describe a test as passing unless you saw it pass in this session.
