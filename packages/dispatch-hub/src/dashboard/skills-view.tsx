import {
  MarkdownDoc,
  heartbeatAge,
  jobDisplayLabel,
  jobMessage,
  type JobSummary,
  type JobWorkspaceChip,
} from "@repo-prism/app-shell";
import {
  Button,
  EmptyState,
  HoverTip,
  IconButton,
  Input,
  ListTile,
  ScreenSkeleton,
  Tabs,
  Textarea,
} from "@repo-prism/ui";
import {
  Copy,
  Eye,
  History,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { SKILL_PLAYBOOK } from "./fleet.js";
import { LabeledJobBar, type JobActionHandlers } from "./job-actions.js";
import { showConsoleToast } from "./console-toast.js";
import {
  APPLIED_GENERATE,
  formatElapsed,
  generateElapsedFrom,
  isPendingSkillGenerate,
  isSkillGenerateJob,
  latestFinishedSkillJob,
  PENDING_GENERATE,
  shouldCancelArrivingSkillJob,
  skillGenerateStage,
  skillJobCoversPending,
  skillJobTitle,
} from "./skill-generate.js";
import { GenerateFlow } from "./generate-line.js";
import { SkillHistoryDrawer } from "./skill-history.js";
import { getJson, postJson } from "./session.js";

type SkillStatus = "draft" | "published";

type PrismSkill = {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly status: SkillStatus;
  readonly inherited: boolean;
};

const emptyBody = "Describe the workflow and knowledge this skill provides.";
const APPLY_DELAYS_MS = [0, 400, 1200, 2500] as const;
const APPLIED_GENERATE_IDS_KEY = "prism.console.skill-generate.applied";

function loadAppliedGenerateIds(): Set<string> {
  if (typeof sessionStorage === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(APPLIED_GENERATE_IDS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter(
        (id): id is string => typeof id === "string" && id.trim() !== "",
      ),
    );
  } catch {
    return new Set();
  }
}

function rememberAppliedGenerateId(id: string): void {
  const ids = loadAppliedGenerateIds();
  ids.add(id);
  try {
    sessionStorage.setItem(APPLIED_GENERATE_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    // Quota or private mode — the in-memory set still covers this mount.
  }
}

function snapshotOf(form: {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly status: SkillStatus;
}): string {
  return JSON.stringify({
    name: form.name,
    description: form.description,
    body: form.body,
    status: form.status,
  });
}

function editorBadge(skill: {
  readonly inherited: boolean;
  readonly status: SkillStatus;
}): {
  readonly label: string;
  readonly tone: "draft" | "published" | "readonly";
} {
  if (skill.inherited) return { label: "Read-only", tone: "readonly" };
  if (skill.status === "published") {
    return { label: "Published", tone: "published" };
  }
  return { label: "Draft", tone: "draft" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function SkillsView(props: {
  readonly token: string;
  readonly repos: readonly JobWorkspaceChip[];
  readonly jobs?: readonly JobSummary[];
  readonly pendingGenerateTitle?: string;
  readonly pendingGenerateQueuedAt?: string;
  readonly jobActions?: JobActionHandlers;
  readonly onCloseCompose?: () => void;
  readonly onPendingGenerateConsumed?: () => void;
  readonly onGenerate: (input: {
    readonly title: string;
    readonly prd?: string;
    readonly workspace?: string;
    readonly playbook?: string;
    readonly skillName?: string;
    readonly skillUpdate?: boolean;
    readonly skillDraft?: {
      readonly name: string;
      readonly description: string;
      readonly body: string;
    };
  }) => void;
  readonly onWatchJob?: (jobId: string) => void;
}): ReactElement {
  const [skills, setSkills] = useState<readonly PrismSkill[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState(emptyBody);
  const [status, setStatus] = useState<SkillStatus>("draft");
  const [inherited, setInherited] = useState(false);
  const [tab, setTab] = useState<"yours" | "inherited">("yours");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingPublished, setEditingPublished] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<"edit" | "preview">(
    "preview",
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pendingSince, setPendingSince] = useState<string | undefined>();
  const [armedName, setArmedName] = useState<string | undefined>();
  const [applying, setApplying] = useState(false);
  const [dismissedGenerateIds, setDismissedGenerateIds] = useState(
    () => new Set<string>(),
  );
  const [cancelPending, setCancelPending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const watchedGenerateIds = useRef(new Set<string>());
  const appliedGenerateIds = useRef(loadAppliedGenerateIds());
  const autoConfirmedIds = useRef(new Set<string>());
  const cancelledGenerateName = useRef<string | undefined>(undefined);
  const pendingConsumedRef = useRef(props.onPendingGenerateConsumed);
  pendingConsumedRef.current = props.onPendingGenerateConsumed;
  const snapshotRef = useRef("");
  const deletingRef = useRef(false);
  const selectedRef = useRef<string | undefined>(undefined);
  const flushDraftRef = useRef<() => void>(() => undefined);
  const formRef = useRef({
    name: "",
    description: "",
    body: emptyBody,
    status: "draft" as SkillStatus,
    inherited: false,
  });
  formRef.current = { name, description, body, status, inherited };
  selectedRef.current = selected;

  function apply(
    skill: PrismSkill | undefined,
    opts?: {
      readonly keepArmed?: boolean;
      readonly tab?: "yours" | "inherited";
    },
  ): void {
    setConfirmDelete(false);
    setEditingPublished(false);
    if (!opts?.keepArmed) setArmedName(undefined);
    if (!skill) {
      const nextTab = opts?.tab ?? "yours";
      setSelected(undefined);
      setInherited(nextTab === "inherited");
      setStatus("draft");
      setName("");
      setDescription("");
      setBody(emptyBody);
      setTab(nextTab);
      setWorkflowMode("edit");
      snapshotRef.current = snapshotOf({
        name: "",
        description: "",
        body: emptyBody,
        status: "draft",
      });
      return;
    }
    setSelected(skill.name);
    setName(skill.name);
    setDescription(skill.description);
    setBody(skill.body);
    setStatus(skill.status);
    setInherited(skill.inherited);
    setTab(skill.inherited ? "inherited" : "yours");
    if (skill.inherited || skill.status === "published") {
      setWorkflowMode("preview");
    }
    snapshotRef.current = snapshotOf(skill);
  }

  const persist = async (
    input: {
      readonly name: string;
      readonly description: string;
      readonly body: string;
      readonly status: SkillStatus;
    },
    opts?: { readonly toast?: boolean },
  ): Promise<PrismSkill | undefined> => {
    const saved = await postJson<PrismSkill | { error: string }>(
      "/api/skills",
      props.token,
      {
        action: "save",
        name: input.name,
        description: input.description,
        body: input.body,
        status: input.status,
        ...(selectedRef.current && selectedRef.current !== input.name.trim()
          ? { previousName: selectedRef.current }
          : {}),
      },
    );
    if ("error" in saved) {
      if (opts?.toast !== false) showConsoleToast(saved.error, "error");
      return undefined;
    }
    snapshotRef.current = snapshotOf(saved);
    setStatus(saved.status);
    setSelected(saved.name);
    setName(saved.name);
    if (opts?.toast !== false) {
      showConsoleToast(
        saved.status === "published" ? "Published." : "Draft saved.",
      );
    }
    return saved;
  };

  const load = async (
    keep?: string,
    opts?: { readonly keepArmed?: boolean },
  ): Promise<void> => {
    try {
      const listed = await getJson<{ skills: PrismSkill[] }>(
        "/api/skills",
        props.token,
      );
      setSkills(listed.skills);
      setLoadError(undefined);
      const target = keep ?? selectedRef.current;
      if (keep) {
        const next = listed.skills.find((row) => row.name === keep);
        if (
          next &&
          (selectedRef.current === keep || formRef.current.name.trim() === keep)
        ) {
          apply(next, { keepArmed: opts?.keepArmed });
        }
        return;
      }
      if (target) {
        const still = listed.skills.find((row) => row.name === target);
        if (!still) {
          apply(
            listed.skills.find((row) => !row.inherited) ?? listed.skills[0],
            { keepArmed: opts?.keepArmed },
          );
          return;
        }
        if (opts?.keepArmed) apply(still, { keepArmed: true });
        return;
      }
      apply(listed.skills.find((row) => !row.inherited) ?? listed.skills[0]);
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : "Could not load skills.",
      );
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    void load().catch(() => undefined);
  }, [props.token]);

  const arrivingGenerate = useMemo(() => {
    const key = name.trim();
    if (!key) return undefined;
    return props.jobs?.find((job) => isSkillGenerateJob(job, key));
  }, [props.jobs, name]);
  const generateJob =
    arrivingGenerate &&
    !dismissedGenerateIds.has(arrivingGenerate.id) &&
    !shouldCancelArrivingSkillJob(cancelledGenerateName.current, name)
      ? arrivingGenerate
      : undefined;
  const finishedGenerate = useMemo(
    () => latestFinishedSkillJob(props.jobs, name),
    [props.jobs, name],
  );
  const pendingCovered = useMemo(
    () =>
      Boolean(
        name.trim() &&
        (props.jobs ?? []).some((job) =>
          skillJobCoversPending(job, name, props.pendingGenerateQueuedAt),
        ),
      ),
    [props.jobs, name, props.pendingGenerateQueuedAt],
  );
  const pendingGenerate =
    isPendingSkillGenerate(props.pendingGenerateTitle, name) &&
    !generateJob &&
    !pendingCovered;
  const armed = Boolean(name.trim()) && armedName === name.trim();
  const generateBusy = Boolean(
    generateJob || pendingGenerate || armed || applying || cancelPending,
  );

  const yours = useMemo(
    () => skills.filter((skill) => !skill.inherited),
    [skills],
  );
  const inheritedRows = useMemo(
    () => skills.filter((skill) => skill.inherited),
    [skills],
  );
  const listed = useMemo(() => {
    const pool = tab === "yours" ? yours : inheritedRows;
    const needle = query.trim().toLowerCase();
    if (!needle) return pool;
    return pool.filter(
      (skill) =>
        skill.name.toLowerCase().includes(needle) ||
        skill.description.toLowerCase().includes(needle),
    );
  }, [tab, yours, inheritedRows, query]);

  useEffect(() => {
    if (!selected) return;
    if (listed.some((skill) => skill.name === selected)) return;
    flushDraftRef.current();
    apply(listed[0], { tab });
  }, [listed, selected, tab]);

  useEffect(() => {
    const key = name.trim();
    if (!key) return;
    for (const job of props.jobs ?? []) {
      if (isSkillGenerateJob(job, key)) watchedGenerateIds.current.add(job.id);
    }
  }, [props.jobs, name]);

  useEffect(() => {
    if (generateJob?.status !== "needs_confirm") return;
    if (!props.jobActions?.onConfirm) return;
    if (autoConfirmedIds.current.has(generateJob.id)) return;
    if (shouldCancelArrivingSkillJob(cancelledGenerateName.current, name)) {
      return;
    }
    autoConfirmedIds.current.add(generateJob.id);
    props.jobActions.onConfirm(generateJob);
  }, [generateJob, name, props.jobActions]);

  useEffect(() => {
    if (!arrivingGenerate) return;
    if (!shouldCancelArrivingSkillJob(cancelledGenerateName.current, name)) {
      return;
    }
    if (dismissedGenerateIds.has(arrivingGenerate.id)) return;
    setDismissedGenerateIds((prev) => {
      const next = new Set(prev);
      next.add(arrivingGenerate.id);
      return next;
    });
    props.jobActions?.onCancel?.(arrivingGenerate);
    setCancelPending(false);
  }, [arrivingGenerate, dismissedGenerateIds, name, props.jobActions]);

  useEffect(() => {
    if (!cancelPending) return;
    const timer = window.setTimeout(() => setCancelPending(false), 8000);
    return () => window.clearTimeout(timer);
  }, [cancelPending]);

  useEffect(() => {
    if (!props.pendingGenerateTitle) return;
    if (!generateJob && !pendingCovered) return;
    pendingConsumedRef.current?.();
  }, [generateJob?.id, pendingCovered, props.pendingGenerateTitle]);

  useEffect(() => {
    const finished = finishedGenerate;
    if (!finished) return;
    if (!watchedGenerateIds.current.has(finished.id)) return;
    if (appliedGenerateIds.current.has(finished.id)) return;
    if (dismissedGenerateIds.has(finished.id)) return;
    if (shouldCancelArrivingSkillJob(cancelledGenerateName.current, name)) {
      return;
    }
    appliedGenerateIds.current.add(finished.id);
    rememberAppliedGenerateId(finished.id);
    const keep = name.trim();
    if (!keep) return;
    setApplying(true);
    setWorkflowMode("preview");
    void (async () => {
      try {
        for (const wait of APPLY_DELAYS_MS) {
          if (wait) await sleep(wait);
          await load(keep);
        }
        setArmedName(undefined);
        setPendingSince(undefined);
        if (formRef.current.name.trim() === keep) {
          showConsoleToast("Skill updated.");
        }
      } finally {
        setApplying(false);
      }
    })();
  }, [finishedGenerate?.id, name, props.token]);

  useEffect(() => {
    if (!generateJob && !applying) return;
    const key = name.trim();
    if (!key) return;
    const tick = window.setInterval(() => {
      void load(key, { keepArmed: true }).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(tick);
  }, [generateJob?.id, applying, name, props.token]);

  useEffect(() => {
    const stamp =
      generateElapsedFrom(generateJob) ?? props.pendingGenerateQueuedAt;
    if (stamp) {
      setPendingSince(stamp);
      return;
    }
    if (pendingGenerate) {
      setPendingSince((current) => current ?? new Date().toISOString());
      return;
    }
    if (!armed && !applying) setPendingSince(undefined);
  }, [
    pendingGenerate,
    generateJob,
    armed,
    applying,
    props.pendingGenerateQueuedAt,
  ]);

  useEffect(() => {
    if (pendingGenerate || generateJob || !armedName) return;
    const timer = window.setTimeout(() => setArmedName(undefined), 4000);
    return () => window.clearTimeout(timer);
  }, [pendingGenerate, generateJob?.id, armedName]);

  useEffect(() => {
    if (!generateJob && !pendingGenerate && !armed && !applying) return;
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [generateJob?.id, pendingGenerate, armed, applying]);

  const generating = generateJob
    ? skillGenerateStage(generateJob)
    : applying
      ? APPLIED_GENERATE
      : pendingGenerate || armed
        ? PENDING_GENERATE
        : undefined;

  const flushDraft = (): void => {
    if (deletingRef.current) return;
    const prev = formRef.current;
    if (prev.inherited || prev.status !== "draft" || !prev.name.trim()) return;
    const snap = snapshotOf(prev);
    if (snap === snapshotRef.current) return;
    void persist(prev, { toast: false }).then(async (saved) => {
      if (!saved) return;
      const listedSkills = await getJson<{ skills: PrismSkill[] }>(
        "/api/skills",
        props.token,
      );
      setSkills(listedSkills.skills);
    });
  };
  flushDraftRef.current = flushDraft;

  useEffect(() => {
    return () => {
      flushDraftRef.current();
    };
  }, []);

  const save = async (nextStatus: SkillStatus): Promise<void> => {
    const saved = await persist(
      { name, description, body, status: nextStatus },
      { toast: true },
    );
    if (saved) await load(saved.name);
  };

  const duplicate = async (): Promise<void> => {
    if (!selected) return;
    const copied = await postJson<PrismSkill | { error: string }>(
      "/api/skills",
      props.token,
      { action: "duplicate", name: selected },
    );
    if ("error" in copied) {
      showConsoleToast(copied.error, "error");
      return;
    }
    showConsoleToast(`Copied to Yours as ${copied.name}.`);
    await load(copied.name);
  };

  const remove = async (): Promise<void> => {
    if (!selected || inherited) return;
    deletingRef.current = true;
    try {
      const doomed = selected;
      const result = await postJson<{ ok: boolean; detail: string }>(
        "/api/skills",
        props.token,
        { action: "delete", name: doomed },
      );
      if (!result.ok) {
        showConsoleToast(result.detail, "error");
        return;
      }
      showConsoleToast(`Deleted ${doomed}.`);
      const listedSkills = await getJson<{ skills: PrismSkill[] }>(
        "/api/skills",
        props.token,
      );
      const remaining = listedSkills.skills.filter(
        (row) => row.name !== doomed,
      );
      setSkills(remaining);
      apply(remaining.find((row) => !row.inherited));
    } catch (cause) {
      showConsoleToast(
        cause instanceof Error ? cause.message : "Could not delete that skill.",
        "error",
      );
    } finally {
      deletingRef.current = false;
    }
  };

  const badge = editorBadge({ inherited, status });
  const useName = name.trim() || "…";
  const publishedLocked =
    !inherited && status === "published" && !editingPublished;
  const canEdit = !inherited && !publishedLocked;
  const workflowTab = canEdit ? workflowMode : "preview";
  const skillUpdate = editingPublished && status === "published";
  const generateActivity = (() => {
    if (!generateJob) return undefined;
    const text = jobMessage(generateJob);
    const statusLabel = jobDisplayLabel(generateJob);
    if (text && text.trim().toLowerCase() === statusLabel.toLowerCase()) {
      return undefined;
    }
    return text;
  })();
  const generateAgo = generateJob
    ? heartbeatAge(generateJob, nowMs)
    : undefined;

  const startSkillJob = (update: boolean): void => {
    const key = name.trim();
    if (!key) return;
    cancelledGenerateName.current = undefined;
    setCancelPending(false);
    setWorkflowMode("preview");
    props.onGenerate({
      title: skillJobTitle(key),
      playbook: SKILL_PLAYBOOK,
      skillName: key,
      skillUpdate: update,
      skillDraft: {
        name: key,
        description,
        body,
      },
      workspace: props.repos[0]?.path,
    });
  };

  return (
    <>
      <div className="skills-layout">
        <aside className="skills-library">
          <header className="skills-library__head">
            <Tabs
              aria-label="Skill source"
              value={tab}
              onChange={(id) => {
                const next = id as "yours" | "inherited";
                flushDraft();
                const pool = next === "yours" ? yours : inheritedRows;
                if (selected && pool.some((skill) => skill.name === selected)) {
                  setTab(next);
                  return;
                }
                apply(pool[0], { tab: next });
              }}
              options={[
                { id: "yours", label: "Yours" },
                { id: "inherited", label: "Inherited" },
              ]}
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={14} aria-hidden />}
              onClick={() => {
                flushDraft();
                apply(undefined);
              }}
            >
              New
            </Button>
          </header>
          <div className="skills-library__search">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skills"
              aria-label="Search skills"
            />
          </div>
          <div className="skills-library__list">
            {!ready ? (
              <ScreenSkeleton label="Loading skills…" rows={5} />
            ) : loadError ? (
              <>
                <EmptyState>{loadError}</EmptyState>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void load()}
                >
                  Try again
                </Button>
              </>
            ) : listed.length === 0 ? (
              <EmptyState>
                {query.trim()
                  ? "No skills match."
                  : tab === "inherited"
                    ? "No inherited skills."
                    : "No skills yet."}
              </EmptyState>
            ) : (
              listed.map((skill) => {
                const on = skill.name === selected;
                return (
                  <ListTile
                    key={skill.name}
                    selected={on}
                    className="skills-card"
                    onClick={() => {
                      if (skill.name === selected) {
                        apply(skill, { keepArmed: generateBusy });
                        return;
                      }
                      flushDraft();
                      apply(skill);
                    }}
                  >
                    <span className="skills-card__notch" aria-hidden />
                    <span className="skills-card__row">
                      <strong className="skills-card__name">
                        {skill.name}
                      </strong>
                      {skill.inherited ? (
                        <span className="skills-card__meta">read-only</span>
                      ) : skill.status === "published" ? (
                        <span className="skills-pill skills-pill--published">
                          Published
                        </span>
                      ) : (
                        <HoverTip label="Not live yet. Agents cannot use this until you publish.">
                          <span className="skills-pill skills-pill--draft">
                            Draft
                          </span>
                        </HoverTip>
                      )}
                    </span>
                    <span className="skills-card__blurb">
                      {skill.description || "No when-to-use yet."}
                    </span>
                  </ListTile>
                );
              })
            )}
          </div>
        </aside>
        <section className="skills-editor">
          <header className="skills-editor__head">
            <div className="skills-editor__title">
              <h1>{name.trim() || "New skill"}</h1>
              <div className="skills-editor__actions">
                {badge.tone === "draft" ? (
                  <HoverTip label="Not live yet. Agents cannot use this until you publish.">
                    <span className={`skills-pill skills-pill--${badge.tone}`}>
                      {badge.label}
                    </span>
                  </HoverTip>
                ) : (
                  <span className={`skills-pill skills-pill--${badge.tone}`}>
                    {badge.label}
                  </span>
                )}
                {inherited ? (
                  <HoverTip
                    label="Duplicate"
                    detail="Copy this skill into Yours as a draft"
                  >
                    <IconButton
                      label="Duplicate"
                      title=""
                      variant="secondary"
                      disabled={!selected}
                      onClick={() => void duplicate()}
                    >
                      <Copy size={14} aria-hidden />
                    </IconButton>
                  </HoverTip>
                ) : publishedLocked ? (
                  <>
                    <HoverTip
                      label="Edit"
                      detail="Open this published skill for editing"
                    >
                      <IconButton
                        label="Edit"
                        title=""
                        variant="secondary"
                        disabled={generateBusy}
                        onClick={() => {
                          setEditingPublished(true);
                          setWorkflowMode("edit");
                        }}
                      >
                        <Pencil size={14} aria-hidden />
                      </IconButton>
                    </HoverTip>
                    <HoverTip
                      label="Duplicate"
                      detail="Create a new draft with the same content"
                    >
                      <IconButton
                        label="Duplicate"
                        title=""
                        variant="secondary"
                        disabled={!selected || generateBusy}
                        onClick={() => void duplicate()}
                      >
                        <Copy size={14} aria-hidden />
                      </IconButton>
                    </HoverTip>
                    <HoverTip
                      label="History"
                      detail="View, revert, or compare versions"
                    >
                      <IconButton
                        label="Version history"
                        title=""
                        variant="secondary"
                        disabled={!selected || generateBusy}
                        onClick={() => setHistoryOpen(true)}
                      >
                        <History size={14} aria-hidden />
                      </IconButton>
                    </HoverTip>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Sparkles size={14} aria-hidden />}
                      disabled={!name.trim() || generateBusy}
                      loading={generateBusy}
                      onClick={() => startSkillJob(skillUpdate)}
                    >
                      {generateBusy
                        ? "Generating.."
                        : skillUpdate
                          ? "Update skill"
                          : "Generate skill"}
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!name.trim() || generateBusy}
                      onClick={() => void save("published")}
                    >
                      Publish
                    </Button>
                    {selected ? (
                      <>
                        <HoverTip
                          label="History"
                          detail="View, revert, or compare versions"
                        >
                          <IconButton
                            label="Version history"
                            title=""
                            variant="secondary"
                            disabled={generateBusy}
                            onClick={() => setHistoryOpen(true)}
                          >
                            <History size={14} aria-hidden />
                          </IconButton>
                        </HoverTip>
                        <HoverTip
                          label="Duplicate"
                          detail="Create a new draft with the same content"
                        >
                          <IconButton
                            label="Duplicate"
                            title=""
                            variant="secondary"
                            disabled={generateBusy}
                            onClick={() => void duplicate()}
                          >
                            <Copy size={14} aria-hidden />
                          </IconButton>
                        </HoverTip>
                      </>
                    ) : null}
                  </>
                )}
                {selected && !inherited ? (
                  confirmDelete ? (
                    <span className="skills-editor__confirm">
                      <span>{`Delete ${selected}?`}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancel
                      </Button>
                      <HoverTip
                        label="Delete"
                        detail={`Delete ${selected} for good`}
                      >
                        <IconButton
                          label="Delete"
                          title=""
                          variant="danger"
                          disabled={generateBusy}
                          onClick={() => void remove()}
                        >
                          <Trash2 size={14} aria-hidden />
                        </IconButton>
                      </HoverTip>
                    </span>
                  ) : (
                    <HoverTip
                      label="Delete skill"
                      detail="Remove this skill from Prism"
                    >
                      <IconButton
                        label="Delete skill"
                        title=""
                        variant="danger"
                        className="skills-editor__delete"
                        disabled={generateBusy}
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2 size={14} aria-hidden />
                      </IconButton>
                    </HoverTip>
                  )
                ) : null}
              </div>
            </div>
            {generating ? (
              <div className="skills-generate">
                <span>Generating · {generating.stage}</span>
                <GenerateFlow stage={generating.stage} />
                <span className="skills-generate__elapsed">
                  {formatElapsed(
                    generateElapsedFrom(generateJob) ??
                      props.pendingGenerateQueuedAt ??
                      pendingSince,
                    nowMs,
                  )}
                </span>
                <div className="skills-generate__actions">
                  {props.onWatchJob && generateJob ? (
                    <HoverTip label="Watch live" detail="Open this run">
                      <IconButton
                        label="Watch live"
                        title=""
                        variant="secondary"
                        className="skills-generate__watch"
                        onClick={() => props.onWatchJob?.(generateJob.id)}
                      >
                        <Eye size={14} aria-hidden />
                      </IconButton>
                    </HoverTip>
                  ) : null}
                  {generateJob && props.jobActions ? (
                    <LabeledJobBar
                      job={generateJob}
                      {...props.jobActions}
                      onCancel={(job) => {
                        cancelledGenerateName.current = name.trim();
                        setArmedName(undefined);
                        setPendingSince(undefined);
                        setDismissedGenerateIds((prev) => {
                          const next = new Set(prev);
                          next.add(job.id);
                          return next;
                        });
                        props.jobActions?.onCancel?.(job);
                        props.onCloseCompose?.();
                      }}
                    />
                  ) : pendingGenerate || armed || cancelPending ? (
                    <HoverTip label="Cancel" detail="Stop this generate">
                      <IconButton
                        label="Cancel"
                        title=""
                        variant="danger"
                        onClick={() => {
                          cancelledGenerateName.current = name.trim();
                          setCancelPending(true);
                          setArmedName(undefined);
                          setPendingSince(undefined);
                          props.onCloseCompose?.();
                        }}
                      >
                        <X size={14} aria-hidden />
                      </IconButton>
                    </HoverTip>
                  ) : null}
                </div>
              </div>
            ) : null}
          </header>
          <div className="skills-editor__body">
            <label className="skills-field">
              <span className="prism-field__label prism-field__label--mono">
                Name
              </span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canEdit}
                placeholder="commitpush"
                aria-label="Skill name"
                className="skills-input--name"
              />
            </label>
            <label className="skills-field">
              <span className="prism-field__label prism-field__label--mono">
                When to use
              </span>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!canEdit}
                placeholder="Describe when the agent should use this skill."
                aria-label="When to use this skill"
                rows={4}
              />
            </label>
            <div className="skills-field skills-field--workflow">
              <div className="skills-workflow-head">
                <span className="prism-field__label prism-field__label--mono">
                  Workflow
                </span>
                <Tabs
                  aria-label="Workflow view"
                  value={workflowTab}
                  onChange={(id) => {
                    if (!canEdit) return;
                    setWorkflowMode(id as "edit" | "preview");
                  }}
                  options={[
                    { id: "edit", label: "Edit", disabled: !canEdit },
                    { id: "preview", label: "Preview" },
                  ]}
                />
              </div>
              {generateJob || pendingGenerate || armed ? (
                <div className="skills-generating-hint">
                  <p>// Generating workflow steps…</p>
                  {generateActivity ? (
                    <p className="skills-generating-step">
                      <span
                        className="skills-generating-step__prompt"
                        aria-hidden
                      >
                        $
                      </span>
                      <span>{generateActivity}</span>
                      {generateAgo ? (
                        <span className="skills-generating-step__ago">
                          {generateAgo}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {workflowTab === "preview" ? (
                <div className="skills-workflow-preview">
                  {body.trim() ? (
                    <MarkdownDoc text={body} />
                  ) : (
                    <p className="skills-workflow-empty">
                      Nothing to preview yet.
                    </p>
                  )}
                </div>
              ) : (
                <Textarea
                  className="skills-workflow"
                  value={body}
                  disabled={!canEdit || generateBusy}
                  onChange={(event) => setBody(event.target.value)}
                  aria-label="Skill workflow"
                />
              )}
            </div>
            <p className="skills-editor__note">
              A Prism skill. In chat: <code>{`prism use ${useName}`}</code>
            </p>
            <p className="skills-editor__hint">
              {inherited
                ? "Inherited skills are read-only. Duplicate to edit a copy in Yours."
                : publishedLocked
                  ? "Published skills are read-only. Edit to change, or Duplicate to start a new draft."
                  : "Drafts autosave in Prism. Publish to make it live."}
            </p>
          </div>
        </section>
      </div>
      {historyOpen && selected && !inherited ? (
        <SkillHistoryDrawer
          token={props.token}
          skillName={selected}
          onClose={() => setHistoryOpen(false)}
          onReverted={(keep) => {
            void load(keep);
          }}
        />
      ) : null}
    </>
  );
}
