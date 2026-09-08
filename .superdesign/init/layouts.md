# Shared layouts

Console Attention cards and Focus inspector chrome.

## AttentionPanel (console-app.tsx)
- Path: `packages/dispatch-hub/src/dashboard/console-app.tsx`
- Description: Attention inbox card with Start anyway / Cancel / Open job.

```tsx
  return (
    <section className="console__panel">
      <h1 className="console__title">Attention</h1>
      {rows.length === 0 ? (
        <EmptyState
          variant="page"
          icon={Inbox}
          title="Nothing is waiting on you"
        >
          Dirty-tree gates and questions from a teammate show up here.
        </EmptyState>
      ) : (
        <p className="console__lede">{rows.length} need you</p>
      )}
      {props.loading ? <div className="fleet-scan" aria-hidden /> : null}
      <ul className="attention-list">
        {rows.map((job, index) => {
          const stalled = job.status === "waiting_on_you";
          const paused = job.status === "paused";
          const gated = job.status === "needs_confirm";
          const busy = busyId === job.id;
          return (
            <li
              key={`${job.workspacePath}:${job.id}`}
              className={
                index === cursor
                  ? "attention-card attention-card--on"
                  : "attention-card"
              }
              tabIndex={0}
              aria-current={index === cursor ? "true" : undefined}
            >
              <div className="attention-card__head">
                <strong>{job.title}</strong>
                <Badge
                  tone={jobBadgeTone(job.status, job.nextStep)}
                  pulse={jobBadgePulse(job.status)}
                >
                  {jobDisplayLabel(job)}
                </Badge>
              </div>
              <span>{job.workspaceLabel}</span>
              <p>
                {job.confirm?.question ??
                  (stalled
                    ? "No recent output. Resume to nudge it, or cancel."
                    : paused
                      ? "Paused — resume when you want it to continue."
                      : "The teammate asked a question.")}
              </p>
              <div className="attention-card__actions">
                {gated ? (
                  <Button
                    variant="primary"
                    disabled={busy || !props.port.control}
                    onClick={() => void run("confirm", job)}
                  >
                    Start anyway
                  </Button>
                ) : null}
                {paused || stalled ? (
                  <Button
                    variant="primary"
                    disabled={busy || !props.port.control}
                    onClick={() => void run("resume", job)}
                  >
                    Resume
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  disabled={busy || !props.port.control}
                  onClick={() => void run("cancel", job)}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => props.onOpen(job)}
                >
                  Open job
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

## JobBrief (JobsScreen.tsx)
- Path: `packages/app-shell/src/JobsScreen.tsx`
- Description: Focus inspector brief editor and Save brief.

```tsx
function JobBrief(props: {
  readonly job: JobSummary;
  readonly onSave?: (prd: string) => Promise<void>;
}): ReactElement | null {
  const [value, setValue] = useState(props.job.prd ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(props.job.prd ?? "");
  }, [props.job.id, props.job.prd]);

  if (!props.onSave && !(props.job.prd ?? "").trim()) return null;

  const dirty = value !== (props.job.prd ?? "");
  const save = async (): Promise<void> => {
    if (!props.onSave || !dirty) return;
    setBusy(true);
    setError(undefined);
    try {
      await props.onSave(value);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="job-brief">
      <Textarea
        id="job-brief"
        label="Brief"
        placeholder="Write prompt here"
        {...(props.onSave
          ? { hint: "Esc to close · ⌘↵ to save" }
          : {})}
        rows={6}
        value={value}
        readOnly={!props.onSave}
        onChange={(event) => {
          setValue(event.target.value);
          setSaved(false);
        }}
        onKeyDown={(event) => {
          if (isPrimaryActionKey(event)) {
            event.preventDefault();
            void save();
          }
        }}
      />
      {error ? (
        <p className="job-brief__error" role="alert">
          {error}
        </p>
      ) : null}
      {props.onSave ? (
        <div className="job-brief__actions">
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !dirty}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            onClick={() => void save()}
          >
            {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save brief"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

## Checks banner (JobsScreen.tsx)
- Path: `packages/app-shell/src/JobsScreen.tsx`
- Description: Concatenates lastActivity and verificationDetail into one string.

```tsx
            ? (job.resultSummary ?? "Finished — review the changes.")
            : (job.errorMessage ??
              (job.lastActivity && job.verificationDetail
                ? `${job.lastActivity} — ${job.verificationDetail}`
                : job.lastActivity) ??
              job.resultSummary ??
              "");

                    <p className={`job-verify job-verify--${job.verification}`}>
                      <strong>Checks {job.verification}</strong>
                      {job.verificationDetail
                        ? ` — ${job.verificationDetail}`
                        : ""}
                    </p>
                  ) : null}
```

## Attention card CSS
- Path: `packages/dispatch-hub/src/dashboard/styles.css`

```css
.attention-card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--prism-line);
  border-radius: 12px;
  background: var(--prism-surface-2);
}

.attention-card--on,
.attention-card:focus-visible {
  border-color: color-mix(in oklab, var(--prism-brand) 50%, var(--prism-line));
  outline: none;
}

.attention-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.attention-card__head strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attention-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attention-card__actions .prism-btn {
  flex: 1 1 auto;
  min-width: 7rem;
}

```

## Job brief + verify CSS
- Path: `packages/app-shell/src/jobs-extra.css`

```css
.job-brief {
  display: grid;
  gap: 10px;
}

.job-brief__actions {
  display: flex;
  justify-content: flex-end;
}

.job-brief__error {
  margin: 0;
  color: var(--prism-rose);
  font-size: 13px;
}

/* Truncation disclosure. Styled quietly — it is a caveat, not a warning. */
.job-console__note {
  margin: 0;
  padding: 6px 12px;
  border-top: 1px solid var(--prism-line, #2a334a);
  font-size: 11px;
  color: var(--prism-ink-muted, #94a3b8);
}

/* ---- Verification ---- */

.job-verify {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--prism-line, #2a334a);
  font-size: 13px;
}

.job-verify--passed {
  border-color: color-mix(in oklab, var(--prism-emerald) 40%, transparent);
  color: var(--prism-emerald);
}

.job-verify--failed {
  border-color: color-mix(in oklab, var(--prism-rose) 45%, transparent);
  color: var(--prism-rose);
}

.job-verify--skipped {
  color: var(--prism-ink-muted, #94a3b8);
}
```

## Button + drawer footer CSS
- Path: `packages/ui/src/primitives.css`

```css
/* —— Buttons —— */
.prism-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 0;
  border: 1px solid transparent;
  border-radius: var(--prism-radius-md);
  font-family: var(--prism-font);
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  transition:
    background var(--prism-dur-1) var(--prism-ease),
    color var(--prism-dur-1) var(--prism-ease),
    border-color var(--prism-dur-1) var(--prism-ease);
}

.prism-btn--md {
  padding: var(--prism-space-sm) var(--prism-space-md);
  font-size: var(--prism-type-body-sm);
}

.prism-btn--sm {
  padding: 5px 10px;
  font-size: var(--prism-type-label);
}

.prism-btn--primary {
  background: var(--prism-brand);
  color: var(--prism-on-brand, var(--prism-canvas));
}

.prism-btn--primary:hover:not(:disabled) {
  background: var(--prism-brand-strong);
}

.prism-btn--secondary {
  background: var(--prism-panel);
  color: var(--prism-ink);
  border-color: var(--prism-line);
}

.prism-btn--secondary:hover:not(:disabled) {
  border-color: var(--prism-brand);
}

.prism-btn--ghost {
  background: transparent;
  color: var(--prism-ink-muted);
}

.prism-btn--ghost:hover:not(:disabled) {
  color: var(--prism-ink);
  background: color-mix(in srgb, var(--prism-ink) 6%, transparent);
}

.prism-btn--warning {
  background: transparent;
  color: var(--prism-amber);
  border-color: var(--prism-amber);
}

.prism-btn--warning:hover:not(:disabled) {
  background: color-mix(in srgb, var(--prism-amber) 12%, transparent);
  border-color: var(--prism-amber);
}

.prism-btn--danger {
  background: transparent;
  color: var(--prism-rose);
  border-color: var(--prism-rose);
}

.prism-btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--prism-rose) 12%, transparent);
  border-color: var(--prism-rose);
}

.prism-btn--icon {
  width: 32px;
  height: 32px;
  padding: 0;
}

.prism-btn:focus-visible {
  outline: none;
  box-shadow: var(--prism-ring);
}

.prism-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

  position: fixed;
  inset: 0;
  z-index: 39;
  margin: 0;
  padding: 0;
  border: 0;
  background: color-mix(in oklab, var(--prism-canvas) 42%, transparent);
  cursor: default;
}

.prism-drawer-scrim--md {
  z-index: 41;
}

.prism-drawer--md ~ .prism-drawer-scrim--lg {
  z-index: 45;
}

.prism-drawer,
.prism-drawer *,
.prism-drawer-scrim {
  box-sizing: border-box;
}

/* Portaled to document.body — stretch with top/bottom, never height: 100%
   of a clipped console ancestor. */
.prism-drawer {
  position: fixed;
  top: 0;
  bottom: 0;
  height: auto;
  max-height: 100dvh;
  z-index: 40;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--prism-surface-2);
  box-shadow: var(--prism-shadow-3);
}

.prism-drawer--right {
  right: 0;
  border-left: 1px solid var(--prism-line);
}

.prism-drawer--left {
  left: 0;
  border-right: 1px solid var(--prism-line);
}

.prism-drawer--lg {
  width: 50%;
  max-width: 100%;
}

.prism-drawer--md {
  width: min(360px, 90vw);
  z-index: 42;
}

.prism-drawer--lg + .prism-drawer--lg,
.prism-drawer--md ~ .prism-drawer--lg {
  z-index: 46;
}

.prism-drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--prism-space-sm);
  padding: 12px 14px;
  border-bottom: 1px solid var(--prism-line);
}

.prism-drawer__title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--prism-type-body);
  font-weight: 650;
}

.prism-drawer__body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px 14px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.prism-drawer__body::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.prism-drawer__foot {
  display: flex;
  justify-content: flex-end;
  padding: 12px 14px;
  border-top: 1px solid var(--prism-line);
}

```
