# ADR-0051: One motion vocabulary, two motion engines

| | |
|---|---|
| Status | Accepted |
| Date | 2026-09-03 |
| Milestone | M-067 (P-S6) |
| Amends | [ADR-0032](./0032-website-gsap-motion.md) |

## Context

[ADR-0032](./0032-website-gsap-motion.md) put GSAP on the marketing site: a
central `ensureGsap()`, `Reveal`, `PageEnter`, and a hero timeline. It said
nothing about the IDE, because at the time the IDE had no motion question.

M-067 raises three at once.

**The website is missing its chrome.** No custom cursor, no themed scrollbar,
no route loader, no anchor scrolling — `ScrollToPlugin` has been registered
and unused since M-055. `/admin` has no motion at all, and it is the page
that is nothing but numbers.

**Reveal delays are unbounded.** `/features` and `/products` use `delay={i *
0.04}` per row. Eight rows is fine. P-S5 added a ninth product, and the
pattern has no ceiling: the last item of a long list arrives after the reader
has already scrolled past it.

**The IDE has no motion vocabulary.** `packages/ui` animates `MapNode` with
`motion/react` and everything else with hand-written CSS keyframes, using
`--prism-dur-*` tokens in some files and hardcoded milliseconds in others.

The tempting answer is "put GSAP in `packages/ui` and share it". That is
wrong, and the reason is the build: `packages/vscode-extension` bundles its
webview with a single `Bun.build` call that does not set `splitting: true`. A
dynamic `import()` there does not produce a lazy chunk — it inlines. So
"shared motion primitives in `ui`" means every editor panel pays for a tween
engine at open, to do work the platform already does.

## Decision

### 1. Share the vocabulary, not the engine

`packages/ui/src/motion.ts` exports durations, easings, `staggerStep`,
`prefersReducedMotion` and `motionDuration`. It imports nothing. It animates
nothing.

The four durations and three easings mirror the custom properties in
`tokens.css`. They exist twice because JS cannot read a custom property before
paint without forcing layout; `motion.test.ts` fails when the two copies
disagree, which is the only thing that makes two copies acceptable.

### 2. The website animates with GSAP. The IDE animates with CSS.

Not a compromise — the right tool in each place.

The website needs scroll triggers, timelines, split text, and pointer-tracked
transforms at 60fps. That is what GSAP is for, and the site already ships it.

The IDE needs three things: a view fading in when you switch screens, a row
appearing on the board, a status pill changing colour. CSS transitions do all
three natively, cost nothing, cannot break under the webview's CSP, and read
the reduced-motion token zeroing in `tokens.css` without a second decision in
JS.

**This deviates from the plan**, which asked for GSAP in the webview behind a
dynamic `import()` held to a bundle budget. The budget it would have to meet
is ~70 kB for behaviour CSS gives away, and the dynamic import would not have
split. The cheapest way to hold a bundle budget is not to add the bundle.

If the webview later needs something CSS genuinely cannot express — a
FLIP-based map transition is the plausible candidate — that is the point to
revisit, and the first step will be `splitting: true` plus a verified chunk
load under the webview CSP, not a bare `import()`.

### 3. Stagger spends a budget, not a delay per item

`staggerStep(count)` divides a fixed 240ms across the items and caps the step
at 60ms. A four-row list and a forty-row list both finish in about a quarter
of a second. `StaggerGrid` uses it on the website; the IDE's CSS caps at the
eighth child for the same reason.

One `ScrollTrigger` on the container, not one per card: per-item triggers on a
long list mean dozens of scroll listeners, firing in scroll order rather than
reading order once the grid wraps.

### 4. Chrome is website-only, and mounted once

`MotionChrome` in the root layout holds the cursor, the route loader, and the
delegated hash-scroll handler. The IDE renders `@repo-prism/app-shell`, never
this tree, so none of it can reach an editor panel — where a custom cursor
would be actively wrong.

- **Cursor** renders `null` on touch and under reduced motion, rather than
  rendering hidden. Position is written with `gsap.quickTo`, not React state:
  a `setState` per `pointermove` re-renders the tree on every mouse movement.
- **Scrollbar** is the native one, themed with `scrollbar-color` and
  `::-webkit-scrollbar`. Keyboard scrolling, `Cmd+F` match marks and OS
  overlay behaviour all keep working. It stays under reduced motion, because
  it is colour rather than movement.
- **Route loader** keys off `usePathname` and completes on the next paint,
  when the new route is already committed. It skips the first render, which
  is not a navigation. A timer-driven bar running a fixed 800ms would be
  lying half the time.

### 5. Counters render the real number server-side

`Counter` server-renders the final value and animates from zero only on the
client. The number is content: it has to be right with JavaScript disabled,
right for a crawler, and right for a screen reader. Markup that starts at "0"
and depends on a tween to become true fails all three.

### 6. Smooth scrolling is a preference, not a default

`scrollToId` jumps instantly under reduced motion. A long page glide is one of
the specific things `prefers-reduced-motion` exists to prevent, not decoration
to be restored when it is safe. Hash links are intercepted by one delegated
document listener — anchors inside MDX come and go with routes — and modified
clicks are left alone.

### 7. Reduced motion is watched, not sampled

`prefersReducedMotion()` reads the query once, which is correct for "should
this tween run" at the moment a tween starts. It is wrong for chrome that
lives for the whole session: a visitor who turns the setting on mid-visit
would keep the cursor and the loader until they reloaded. `useReducedMotion`
subscribes to `matchMedia` change events, and the cursor and route loader use
it. Everything with a start and an end keeps the cheaper one-shot read.

### 8. A registered plugin is a bundled plugin

`ensureGsap()` registered six plugins; two of them — MotionPath and Flip — had
no caller anywhere on the site, left over from ADR-0032's registry. They are
removed. What stays is what something tweens: ScrollTrigger for reveals,
SplitText for the hero, DrawSVG for the hero chart, ScrollTo for docs anchors.
ScrambleText was considered and not added; the plan cut it and nothing on
prismhq.in wants text that resolves out of noise.

### 9. Docs prose stays still, and keeps fumadocs' own table of contents

Docs get the same section reveals and the same anchor scrolling as everything
else, because both come from chrome mounted in the root layout. They do not
get a hand-built scroll-spy: fumadocs already ships a working, accessible
table of contents with active tracking, and `ActiveSectionTracker` exists for
pages that have no such component rather than to displace one that works.
Body copy is not animated at all — long-form reading is the one place where
motion is purely a tax on the reader.

### 10. The job rail is information first

`jobStages` turns the four lifecycle stamps (ADR-0047) into rungs. The detail
pane used to show them as a flat definition list, which says when each thing
happened but not where the job *is*. Three rules keep it honest, and they are
the same rules P-S1 applied to durations:

- A stage with no stamp is drawn unreached, never given a plausible time.
- The last rung is named for the outcome. "Finished" over a job that crashed
  is exactly the cheerful inaccuracy this milestone exists to remove.
- A record with a terminal status and no `finishedAt` — every job written
  before P-S1 split the stamps — is settled, not perpetually current. This is
  `endOfLifeFor`'s rule applied to the rail.

Only the rung the job is currently on animates, reusing the board's existing
pulse so "this is live" looks the same in both places it is claimed.

## Consequences

- One place to change a duration; `motion.test.ts` catches CSS/TS drift.
- The webview gains motion at zero bundle cost and cannot regress under CSP.
- `packages/ui` still has no GSAP dependency, so app-shell does not either.
- Two engines is two idioms to learn. The vocabulary module is what keeps them
  saying the same thing.
- `Magnetic` is for one CTA per page. Applied broadly it moves click targets
  out from under the pointer aiming at them.

## Alternatives rejected

**GSAP in `packages/ui`, shared everywhere.** The stated goal, and the reason
the plan asked for it. Rejected on the build: no `splitting: true` in the
webview bundle means the dynamic import inlines, so "only pay when motion is
on" is not achievable without first restructuring the webview build.

**CSS everywhere, drop GSAP.** Would lose ScrollTrigger, SplitText and the
hero timeline that ADR-0032 already shipped and M-055 verified. Rewriting
working motion to satisfy symmetry is not a reason.

**`motion/react` everywhere**, since `packages/ui` already has it. It is in
`MapNode` alone and pulls React into the animation path; the website's scroll
work is exactly what GSAP does better.
