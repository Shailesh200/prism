# Timeline one-line status, vertical menu, Resume (M-068)

## 1) Timeline row is one line

Restored `.fleet-timeline__row` grid in `styles.css`:
`minmax(0, 10rem) minmax(0, 1fr) auto auto`. Track + live/wait + status + menu stay on one row at desktop. `.fleet-timeline` gets `overflow-x: hidden` so the page does not scroll sideways. Narrow breakpoint still stacks to `1fr`.

## 2) Vertical three-dots

`JobActions` uses `MoreVertical` (Timeline and List share it).

## 3) Only the latest status

Timeline stats: one Badge — live → Running; else verify (Success / Failure / NA). HoverTip can still mention both.

Board tiles: `repoStatusTag` — live → live; else workspace error; else verify. No dual pills.

## 4) Resume / Cancel color

- Resume: `job-card__button--primary` (brand).
- Cancel: `job-card__button--danger` always rose (not grey until hover) in `jobs-extra.css`.

## 5) Resume nudges stalled jobs

**Bug:** resume returned `alreadyRunningSpeak` whenever the worker pid was alive. Stall detection leaves the pid alive, so Focus Resume was a silent no-op.

**Fix** (`runtime.ts`): on resume of a stalled / `waiting_on_you` job with a live pid, cancel that silent worker, then fall through to spawn/`resumeWorker.resume`. Upsert clears `waitingOn`. Non-stalled live jobs still get already-running; `attach_context` with extra still stores `pendingContext`.

Tests: `runtime.test.ts` stalled resume + non-stalled already-running.
