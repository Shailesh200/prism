/**
 * Lenses (ADR-0059). The list says what each lens is and how a review works.
 * Facts, sources, and past verdicts stay in the side drawer.
 */

import { Checkbox, Drawer, Input, Text, Textarea } from "@repo-prism/ui";
import type {
  LensEvidence,
  LensFact,
  LensFactOrigin,
  LensReviewRecord,
  LensView,
} from "@repo-prism/shared";
import { Plus, RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactElement,
} from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { useAppShellClient } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";

export type LensesScreenProps = {
  readonly repoLabel: string;
  readonly branch?: string | undefined;
  readonly user?: AppSidebarUser | null;
  readonly onNavigate: (view: AppView) => void;
};

const EVIDENCE_LABEL: Record<LensEvidence, string> = {
  boundaries: "Package boundaries",
  cycles: "Import cycles",
  rationale: "ADRs and WHY notes",
  "off-limits": "Off-limits paths",
  blast: "Blast radius",
  "test-impact": "Tests that reach the change",
  "verify-plan": "Repo check commands",
  "test-layout": "Test runners",
  reuse: "Existing helpers",
  "house-style": "House style",
  duplicates: "Duplicate code",
};

const EVIDENCE_ORDER = Object.keys(EVIDENCE_LABEL) as LensEvidence[];

const ORIGIN_LABEL: Record<LensFactOrigin, string> = {
  seeded: "Read from this repo",
  learned: "Learned from your overrides",
  user: "Added by you",
};

const VERDICT_LABEL: Record<LensReviewRecord["verdict"], string> = {
  pass: "Pass",
  concern: "Concern",
  fail: "Fail",
};

type Status = "loading" | "ready" | "error";
type DrawerMode = { kind: "details"; lens: LensView } | { kind: "create" };

type Draft = {
  name: string;
  role: string;
  focus: string;
  tone: string;
  checklist: string;
  evidence: LensEvidence[];
};

const EMPTY_DRAFT: Draft = {
  name: "",
  role: "",
  focus: "",
  tone: "",
  checklist: "",
  evidence: [],
};

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function joinAnd(items: readonly string[]): string {
  if (items.length === 0) return "nothing from this repository yet";
  if (items.length === 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function howItWorks(evidence: readonly LensEvidence[]): string {
  const reads = joinAnd(evidence.map((kind) => EVIDENCE_LABEL[kind]));
  return `On a review, Prism gives this lens ${reads}. Your editor's model writes the verdict from that evidence. Prism stores the verdict.`;
}

function isInherited(lens: LensView): boolean {
  return lens.definition.seededDefault;
}

function whenUsed(definition: LensView["definition"]): string {
  if (definition.id === "architect") {
    return "Prism uses this for a new feature, a plan, or a pull request review.";
  }
  if (definition.id === "dev") return "Prism uses this for a daily fix.";
  if (definition.id === "qa") {
    return "Prism uses this when the task is to find bugs.";
  }
  return "Prism uses this when you name it in the task.";
}

function draftFrom(lens: LensView): Draft {
  const definition = lens.definition;
  return {
    name: definition.name,
    role: definition.role,
    focus: definition.focus,
    tone: definition.tone,
    checklist: definition.checklist.join("\n"),
    evidence: [...definition.evidence],
  };
}

function draftPayload(draft: Draft) {
  return {
    name: draft.name.trim(),
    role: draft.role.trim(),
    focus: draft.focus.trim(),
    ...(draft.tone.trim() ? { tone: draft.tone.trim() } : {}),
    checklist: draft.checklist
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    evidence: draft.evidence,
  };
}

function FactGroups(props: {
  readonly facts: readonly LensFact[];
}): ReactElement {
  if (props.facts.length === 0) {
    return <p className="lens-card__none">Nothing stored yet.</p>;
  }
  const order: LensFactOrigin[] = ["seeded", "learned", "user"];
  return (
    <>
      {order.map((origin) => {
        const rows = props.facts.filter((fact) => fact.origin === origin);
        if (rows.length === 0) return null;
        return (
          <div key={origin} className="lens-card__group">
            <p className="lens-card__group-label">{ORIGIN_LABEL[origin]}</p>
            <ul className="lens-card__list">
              {rows.map((fact) => (
                <li key={fact.id}>
                  {fact.text}
                  {fact.source ? (
                    <span className="lens-card__source ov-mono">
                      {fact.source}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function Review(props: { readonly review: LensReviewRecord }): ReactElement {
  const { review } = props;
  return (
    <div className="lens-review" data-verdict={review.verdict}>
      <div className="lens-review__head">
        <span className="lens-review__verdict" data-verdict={review.verdict}>
          {VERDICT_LABEL[review.verdict]}
        </span>
        <span className="lens-review__subject">{review.subject}</span>
        <span className="lens-review__when">{when(review.at)}</span>
      </div>
      {review.reasoning ? (
        <p className="lens-review__reasoning">{review.reasoning}</p>
      ) : null}
      {review.failedChecks.length > 0 ? (
        <ul className="lens-card__list">
          {review.failedChecks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {review.evidence.length > 0 ? (
        <details className="lens-review__evidence">
          <summary>Evidence it was given ({review.evidence.length})</summary>
          <ul className="lens-card__list ov-mono">
            {review.evidence.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {review.sequential ? (
        <p className="lens-card__none">
          Ran in the same context as the other lenses, not as its own subagent.
        </p>
      ) : null}
      {review.override ? (
        <p className="lens-review__override">
          You overruled this: {review.override.note}
        </p>
      ) : null}
    </div>
  );
}

function LensRow(props: {
  readonly lens: LensView;
  readonly onOpen: () => void;
}): ReactElement {
  const { definition } = props.lens;
  const kind = isInherited(props.lens) ? "inherited" : "custom";
  return (
    <article className="ov-card lens-row" aria-label={definition.name}>
      <div className="lens-row__head">
        <Text variant="card" as="h2" className="ov-card__title">
          {definition.name}
        </Text>
        <span className="lens-kind" data-kind={kind}>
          {kind === "inherited" ? "Inherited" : "Custom"}
        </span>
        {definition.enabled ? null : (
          <span className="lens-kind" data-kind="off">
            Off
          </span>
        )}
      </div>
      <p className="lens-row__lead">{definition.role}</p>
      <p className="lens-row__character">{whenUsed(definition)}</p>
      <p className="lens-row__character">{definition.focus}</p>

      <section className="lens-row__block">
        <h3>What it checks</h3>
        <ul className="lens-card__list">
          {definition.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="lens-row__block">
        <h3>How it works</h3>
        <p className="lens-card__none">{howItWorks(definition.evidence)}</p>
      </section>

      <div className="lens-row__foot">
        <button
          type="button"
          className="ov-btn ov-btn--ghost"
          onClick={props.onOpen}
        >
          Details for {definition.name}
        </button>
      </div>
    </article>
  );
}

function LensDetails(props: {
  readonly lens: LensView;
  readonly editing: boolean;
  readonly draft: Draft;
  readonly error: string | null;
  readonly saving: boolean;
  readonly onEdit: () => void;
  readonly onDraft: (next: Draft) => void;
  readonly onSave: () => void;
  readonly onRemove: () => void;
  readonly onOverride: (reviewId: string, note: string) => void;
}): ReactElement {
  const { definition, facts, history } = props.lens;
  const kind = isInherited(props.lens) ? "Inherited" : "Custom";
  const [note, setNote] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  return (
    <div className="lens-drawer">
      <p className="lens-drawer__kicker">
        {kind}
        {definition.enabled ? "" : " · Off"}
        {" · "}
        {facts.length} stored facts · {history.length} reviews
      </p>
      <section className="lens-card__section">
        <Text variant="section">What it is</Text>
        <p className="lens-row__lead">{definition.role}</p>
      </section>
      <section className="lens-card__section">
        <Text variant="section">How it judges</Text>
        <p className="lens-row__character">{definition.focus}</p>
      </section>
      {definition.tone ? (
        <section className="lens-card__section">
          <Text variant="section">How it speaks</Text>
          <p className="lens-row__character">{definition.tone}</p>
        </section>
      ) : null}
      <section className="lens-card__section">
        <Text variant="section">What it checks</Text>
        <ol className="lens-card__list lens-card__list--numbered">
          {definition.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
      <section className="lens-card__section">
        <Text variant="section">What it reads</Text>
        <div className="lens-card__chips">
          {definition.evidence.map((kindId) => (
            <span key={kindId} className="lens-card__chip">
              {EVIDENCE_LABEL[kindId]}
            </span>
          ))}
        </div>
        <p className="lens-card__none">{howItWorks(definition.evidence)}</p>
      </section>
      <section className="lens-card__section">
        <Text variant="section">Memory</Text>
        <FactGroups facts={facts} />
      </section>
      <div className="lens-row__foot">
        <button
          type="button"
          className="ov-btn ov-btn--ghost"
          onClick={props.onEdit}
        >
          {props.editing ? "Close editor" : "Edit"}
        </button>
        {isInherited(props.lens) ? null : (
          <button
            type="button"
            className="ov-btn ov-btn--ghost"
            onClick={props.onRemove}
          >
            Remove
          </button>
        )}
      </div>
      {props.editing ? (
        <CreateLensForm
          draft={props.draft}
          error={props.error}
          saving={props.saving}
          onChange={props.onDraft}
          onSubmit={props.onSave}
          submitLabel="Save lens"
        />
      ) : null}
      <section className="lens-card__section">
        <Text variant="section">Reviews</Text>
        <p className="lens-card__none">
          The reasoning below is what the editor wrote back, with the evidence
          it was given. It is not hidden model thinking.
        </p>
        {history.length === 0 ? (
          <p className="lens-card__none">
            No reviews yet. In chat, ask to review a change with the{" "}
            {definition.name} lens.
          </p>
        ) : (
          <ul className="lens-reviews">
            {history.map((review) => (
              <li key={review.id}>
                <Review review={review} />
                {review.override ? null : reviewId === review.id ? (
                  <form
                    className="lens-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      props.onOverride(review.id, note);
                    }}
                  >
                    <Input
                      label="What you decided instead"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <button type="submit" className="ov-btn ov-btn--primary">
                      Remember this
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="ov-btn ov-btn--ghost"
                    onClick={() => {
                      setReviewId(review.id);
                      setNote("");
                    }}
                  >
                    Overrule
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CreateLensForm(props: {
  readonly draft: Draft;
  readonly error: string | null;
  readonly saving: boolean;
  readonly onChange: (next: Draft) => void;
  readonly onSubmit: () => void;
  readonly submitLabel?: string;
}): ReactElement {
  const base = useId();
  return (
    <form
      className="lens-form"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <p className="lens-card__none">
        A custom lens stays on this machine. Prism still does not call a model —
        your editor writes the verdict.
      </p>
      <Input
        id={`${base}-name`}
        label="Name"
        value={props.draft.name}
        onChange={(event) =>
          props.onChange({ ...props.draft, name: event.target.value })
        }
      />
      <Textarea
        id={`${base}-role`}
        label="What it is"
        hint="One sentence. What question this lens answers."
        rows={3}
        value={props.draft.role}
        onChange={(event) =>
          props.onChange({ ...props.draft, role: event.target.value })
        }
      />
      <Textarea
        id={`${base}-focus`}
        label="How it judges"
        hint="The rule it applies when a change is on the table."
        rows={3}
        value={props.draft.focus}
        onChange={(event) =>
          props.onChange({ ...props.draft, focus: event.target.value })
        }
      />
      <Textarea
        id={`${base}-tone`}
        label="How it speaks"
        hint="Optional. How the verdict should be written."
        rows={2}
        value={props.draft.tone}
        onChange={(event) =>
          props.onChange({ ...props.draft, tone: event.target.value })
        }
      />
      <Textarea
        id={`${base}-checks`}
        label="What it checks"
        hint="One check per line. Each check should be something a file or a command can prove."
        rows={5}
        value={props.draft.checklist}
        onChange={(event) =>
          props.onChange({ ...props.draft, checklist: event.target.value })
        }
      />
      <fieldset className="lens-form__reads">
        <legend>What it reads</legend>
        <div className="lens-form__checks">
          {EVIDENCE_ORDER.map((kind) => (
            <Checkbox
              key={kind}
              checked={props.draft.evidence.includes(kind)}
              onChange={(next) =>
                props.onChange({
                  ...props.draft,
                  evidence: next
                    ? [...props.draft.evidence, kind]
                    : props.draft.evidence.filter((item) => item !== kind),
                })
              }
            >
              {EVIDENCE_LABEL[kind]}
            </Checkbox>
          ))}
        </div>
      </fieldset>
      {props.error ? (
        <p className="cr-error" role="alert">
          {props.error}
        </p>
      ) : null}
      <button
        type="submit"
        className="ov-btn ov-btn--primary"
        disabled={props.saving}
      >
        {props.saving ? "Saving…" : (props.submitLabel ?? "Add lens")}
      </button>
    </form>
  );
}

function LensGroup(props: {
  readonly title: string;
  readonly hint: string;
  readonly lenses: readonly LensView[];
  readonly empty: string;
  readonly onOpen: (lens: LensView) => void;
}): ReactElement {
  return (
    <section className="lens-group" aria-label={props.title}>
      <header className="lens-group__head">
        <h2>{props.title}</h2>
        <p>{props.hint}</p>
      </header>
      {props.lenses.length === 0 ? (
        <p className="ov-empty">{props.empty}</p>
      ) : (
        <div className="lens-list">
          {props.lenses.map((lens) => (
            <LensRow
              key={lens.definition.id}
              lens={lens}
              onOpen={() => props.onOpen(lens)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function LensesScreen(props: LensesScreenProps): ReactElement {
  const client = useAppShellClient();
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [lenses, setLenses] = useState<readonly LensView[]>([]);
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!client.fetchLenses) {
      setStatus("error");
      setError("This host cannot read lenses.");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      setLenses(await client.fetchLenses());
      setStatus("ready");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    const saveCustomLens: AppShellClient["saveCustomLens"] =
      client.saveCustomLens;
    if (!saveCustomLens) {
      setSaveError("This host cannot save a lens.");
      return;
    }
    const checklist = draft.checklist
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (
      !draft.name.trim() ||
      !draft.role.trim() ||
      !draft.focus.trim() ||
      checklist.length === 0 ||
      draft.evidence.length === 0
    ) {
      setSaveError(
        "Add a name, what it is, how it judges, at least one check, and at least one thing it reads.",
      );
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      setLenses(
        await saveCustomLens({
          name: draft.name.trim(),
          role: draft.role.trim(),
          focus: draft.focus.trim(),
          ...(draft.tone.trim() ? { tone: draft.tone.trim() } : {}),
          checklist,
          evidence: draft.evidence,
        }),
      );
      setDraft(EMPTY_DRAFT);
      setDrawer(null);
      setStatus("ready");
    } catch (cause: unknown) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }, [client.saveCustomLens, draft]);

  const openLens = (lens: LensView) => {
    setEditing(false);
    setSaveError(null);
    setDraft(draftFrom(lens));
    setDrawer({ kind: "details", lens });
  };

  const saveEdit = async (id: string) => {
    if (!client.updateLens) {
      setSaveError("This host cannot edit a lens.");
      return;
    }
    const payload = draftPayload(draft);
    if (
      !payload.name ||
      !payload.role ||
      !payload.focus ||
      payload.checklist.length === 0 ||
      payload.evidence.length === 0
    ) {
      setSaveError(
        "Add a name, what it is, how it judges, at least one check, and at least one thing it reads.",
      );
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const next = await client.updateLens(id, payload);
      setLenses(next);
      const updated = next.find((row) => row.definition.id === id);
      if (updated) setDrawer({ kind: "details", lens: updated });
      setEditing(false);
    } catch (cause: unknown) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!client.removeLens) {
      setSaveError("This host cannot remove a lens.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      setLenses(await client.removeLens(id));
      setDrawer(null);
    } catch (cause: unknown) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const overrule = async (reviewId: string, note: string) => {
    if (!client.overrideLensReview) {
      setSaveError("This host cannot overrule a review.");
      return;
    }
    if (!note.trim()) {
      setSaveError("Say what you decided instead.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const next = await client.overrideLensReview(reviewId, note.trim());
      setLenses(next);
      const lensId =
        drawer?.kind === "details" ? drawer.lens.definition.id : "";
      const updated = next.find((row) => row.definition.id === lensId);
      if (updated) setDrawer({ kind: "details", lens: updated });
    } catch (cause: unknown) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const inherited = lenses.filter(isInherited);
  const custom = lenses.filter((lens) => !isInherited(lens));

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
        active="lenses"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />
      <div className="ov-main">
        <header className="ov-top">
          <div>
            <Text variant="page" as="div" className="ov-top__title">
              Lenses
            </Text>
            <Text variant="caption" as="div" className="ov-top__sub">
              {[props.repoLabel, props.branch].filter(Boolean).join(" · ")}
              {props.repoLabel || props.branch ? " · " : ""}
              Prism picks one from the task. A plan or a pull request uses
              Architect, a daily fix uses Dev, and finding bugs uses QA. Name
              a lens, including one you add, to use that instead.
            </Text>
          </div>
          <div className="lens-top__actions">
            <button
              type="button"
              className="ov-btn ov-btn--ghost"
              disabled={status === "loading"}
              onClick={() => void load()}
            >
              <RefreshCw
                size={14}
                aria-hidden
                className={status === "loading" ? "cr-spin" : undefined}
              />
              {status === "loading" ? "Loading…" : "Refresh"}
            </button>
            <button
              type="button"
              className="ov-btn ov-btn--primary"
              onClick={() => {
                setSaveError(null);
                setDrawer({ kind: "create" });
              }}
            >
              <Plus size={14} aria-hidden />
              Add a lens
            </button>
          </div>
        </header>

        <div className="ov-scroll lens-scroll">
          {status === "error" && error ? (
            <div className="ov-card cr-error" role="alert">
              {error}
            </div>
          ) : null}
          {status === "loading" && lenses.length === 0 ? (
            <p className="ov-empty">Loading lenses…</p>
          ) : null}
          {status === "ready" || lenses.length > 0 ? (
            <div className="lens-groups">
              <LensGroup
                title="Inherited"
                hint="Came with Prism. Their facts are re-read from this repository."
                lenses={inherited}
                empty="No inherited lenses."
                onOpen={openLens}
              />
              <LensGroup
                title="Custom"
                hint="Added for this repository. They stay on this machine, not in the repo."
                lenses={custom}
                empty="No custom lenses yet."
                onOpen={openLens}
              />
            </div>
          ) : null}
        </div>
      </div>

      {drawer?.kind === "details" ? (
        <Drawer
          title={drawer.lens.definition.name}
          size="lg"
          onClose={() => setDrawer(null)}
        >
          <LensDetails
            lens={drawer.lens}
            editing={editing}
            draft={draft}
            error={saveError}
            saving={saving}
            onEdit={() => {
              setSaveError(null);
              setDraft(draftFrom(drawer.lens));
              setEditing((on) => !on);
            }}
            onDraft={setDraft}
            onSave={() => void saveEdit(drawer.lens.definition.id)}
            onRemove={() => void remove(drawer.lens.definition.id)}
            onOverride={(reviewId, note) => void overrule(reviewId, note)}
          />
        </Drawer>
      ) : null}
      {drawer?.kind === "create" ? (
        <Drawer
          title="New lens"
          size="lg"
          onClose={() => setDrawer(null)}
          onPrimaryAction={() => void save()}
        >
          <CreateLensForm
            draft={draft}
            error={saveError}
            saving={saving}
            onChange={setDraft}
            onSubmit={() => void save()}
          />
        </Drawer>
      ) : null}
    </div>
  );
}
