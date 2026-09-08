import type { JobSummary, JobWorkspaceChip } from "@repo-prism/app-shell";
import {
  Button,
  HoverTip,
  Input,
  ListTile,
  Pip,
  ProgressBar,
  Tabs,
  Textarea,
} from "@repo-prism/ui";
import { Plus, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { showConsoleToast } from "./console-toast.js";
import {
  formatElapsed,
  isSkillGenerateJob,
  skillGenerateStage,
} from "./skill-generate.js";
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

function snapshotOf(form: {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly status: SkillStatus;
}): string {
  return JSON.stringify(form);
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

export function SkillsView(props: {
  readonly token: string;
  readonly repos: readonly JobWorkspaceChip[];
  readonly jobs?: readonly JobSummary[];
  readonly onGenerate: (input: {
    readonly title: string;
    readonly prd: string;
    readonly workspace?: string;
  }) => void;
  readonly onWatchJob?: (jobId: string) => void;
}): ReactElement {
  const [skills, setSkills] = useState<readonly PrismSkill[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState(emptyBody);
  const [status, setStatus] = useState<SkillStatus>("draft");
  const [inherited, setInherited] = useState(false);
  const [tab, setTab] = useState<"yours" | "inherited">("yours");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const snapshotRef = useRef("");
  const formRef = useRef({
    name: "",
    description: "",
    body: emptyBody,
    status: "draft" as SkillStatus,
    inherited: false,
  });
  formRef.current = { name, description, body, status, inherited };

  function apply(skill: PrismSkill | undefined): void {
    if (!skill) {
      setSelected(undefined);
      setInherited(false);
      setStatus("draft");
      setName("");
      setDescription("");
      setBody(emptyBody);
      setTab("yours");
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

  const load = async (keep?: string): Promise<void> => {
    const listed = await getJson<{ skills: PrismSkill[] }>(
      "/api/skills",
      props.token,
    );
    setSkills(listed.skills);
    if (keep) {
      const next = listed.skills.find((row) => row.name === keep);
      if (next) apply(next);
      return;
    }
    if (selected) {
      const still = listed.skills.find((row) => row.name === selected);
      if (!still) {
        apply(listed.skills.find((row) => !row.inherited) ?? listed.skills[0]);
      }
      return;
    }
    apply(listed.skills.find((row) => !row.inherited) ?? listed.skills[0]);
  };

  useEffect(() => {
    void load().catch(() => undefined);
  }, [props.token]);

  useEffect(() => {
    if (inherited || status !== "draft" || !name.trim()) return;
    const snap = snapshotOf({ name, description, body, status });
    if (snap === snapshotRef.current) return;
    const timer = window.setTimeout(() => {
      void persist(
        { name, description, body, status: "draft" },
        { toast: false },
      ).then(async (saved) => {
        if (!saved) return;
        const listed = await getJson<{ skills: PrismSkill[] }>(
          "/api/skills",
          props.token,
        );
        setSkills(listed.skills);
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [name, description, body, inherited, status, props.token]);

  const yours = useMemo(
    () => skills.filter((skill) => !skill.inherited),
    [skills],
  );
  const inheritedRows = useMemo(
    () => skills.filter((skill) => skill.inherited),
    [skills],
  );
  const listed = tab === "yours" ? yours : inheritedRows;

  const generateJob = useMemo(() => {
    const key = name.trim();
    if (!key) return undefined;
    return props.jobs?.find((job) => isSkillGenerateJob(job, key));
  }, [props.jobs, name]);

  useEffect(() => {
    if (!generateJob) return;
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [generateJob?.id]);

  const generating = generateJob ? skillGenerateStage(generateJob) : undefined;

  const flushDraft = (): void => {
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

  const badge = editorBadge({ inherited, status });
  const useName = name.trim() || "…";
  const canEdit = !inherited;
  const generateBusy = Boolean(generating);

  return (
    <div className="skills-layout">
      <aside className="skills-library">
        <header className="skills-library__head">
          <Tabs
            aria-label="Skill source"
            value={tab}
            onChange={(id) => setTab(id as "yours" | "inherited")}
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
        <div className="skills-library__list">
          {listed.map((skill) => {
            const on = skill.name === selected;
            return (
              <ListTile
                key={skill.name}
                selected={on}
                className="skills-card"
                onClick={() => {
                  if (skill.name === selected) return;
                  flushDraft();
                  apply(skill);
                }}
              >
                <span className="skills-card__notch" aria-hidden />
                <span className="skills-card__row">
                  <strong className="skills-card__name">{skill.name}</strong>
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
          })}
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void duplicate()}
                >
                  Duplicate to Yours
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Sparkles size={16} aria-hidden />}
                    disabled={!name.trim() || generateBusy}
                    onClick={() => {
                      props.onGenerate({
                        title: `Skill: ${name.trim()}`,
                        prd: [
                          "This job is for Prism, not a product repo.",
                          "Write a complete Prism skill (SKILL.md) from this draft.",
                          `Name: ${name.trim()}`,
                          `When to use: ${description.trim()}`,
                          "",
                          body.trim(),
                          "",
                          "Return markdown the Console can publish. Do not edit the user's repository.",
                        ].join("\n"),
                        workspace: props.repos[0]?.path,
                      });
                    }}
                  >
                    Generate skill
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!name.trim()}
                    onClick={() => void save("published")}
                  >
                    Publish
                  </Button>
                </>
              )}
            </div>
          </div>
          {generating && generateJob ? (
            <div className="skills-generate">
              <Pip tone="accent" pulse />
              <span>Generating · {generating.stage}</span>
              <ProgressBar
                value={generating.progress}
                label={`Generating ${generating.stage}`}
                className="prism-progress--hairline"
              />
              <span className="skills-generate__elapsed">
                {formatElapsed(
                  generateJob.startedAt ??
                    generateJob.queuedAt ??
                    generateJob.createdAt,
                  nowMs,
                )}
              </span>
              {props.onWatchJob ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => props.onWatchJob?.(generateJob.id)}
                >
                  Watch live
                </Button>
              ) : null}
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
          <label className="skills-field skills-field--workflow">
            <span className="prism-field__label prism-field__label--mono">
              Workflow
            </span>
            {generating ? (
              <p className="skills-generating-hint">
                // Generating workflow steps…
              </p>
            ) : null}
            <Textarea
              className="skills-workflow"
              value={body}
              disabled={!canEdit || generateBusy}
              onChange={(event) => setBody(event.target.value)}
              aria-label="Skill workflow"
            />
          </label>
        </div>
        <footer className="skills-editor__bar">
          <p className="skills-editor__note">
            A Prism skill. In chat: <code>{`prism use ${useName}`}</code>
          </p>
          <p className="skills-editor__hint">
            Drafts autosave in Prism. Publish to make it live.
          </p>
        </footer>
      </section>
    </div>
  );
}
