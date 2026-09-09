import type { JobSummary, JobWorkspaceChip } from "@repo-prism/app-shell";
import { jobModelLabel, jobNotePaths } from "@repo-prism/app-shell";
import {
  Button,
  Drawer,
  Input,
  RadioGroup,
  Select,
  Textarea,
  isPrimaryActionKey,
} from "@repo-prism/ui";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { findingsForRepo, findingsIndex, withSeedFinding } from "./findings.js";
import {
  PLAYBOOKS,
  REVIEW_TARGETS,
  SKILL_PLAYBOOK,
  composeQueuedPrd,
  playbookHint,
  playbookOf,
  preferredWorkspace,
  reviewTargetOf,
} from "./fleet.js";
import { RepoSelect } from "./repo-select.js";
import { getJson, postJson } from "./session.js";

const AGENT_DEFAULT_MODEL = {
  value: "",
  label: "Agent default",
} as const;

type AgentChoice = "auto" | "cursor" | "claude";

type WorkerModelsResponse = {
  readonly backend?: "cursor" | "claude";
  readonly models?: readonly {
    readonly id?: string;
    readonly label?: string;
  }[];
};

type NoteFile = {
  readonly path?: string;
  readonly text?: string;
};

function modelOptionsFromAgent(
  body: WorkerModelsResponse | undefined,
): { value: string; label: string }[] {
  const extras = (body?.models ?? []).flatMap((row) => {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) return [];
    const label =
      typeof row.label === "string" && row.label.trim() ? row.label.trim() : id;
    return [{ value: id, label }];
  });
  return [AGENT_DEFAULT_MODEL, ...extras];
}

export function ComposeDrawer(props: {
  readonly token: string;
  readonly workspaces: readonly JobWorkspaceChip[];
  readonly jobs?: readonly JobSummary[];
  readonly defaultWorkspace?: string;
  readonly preset?: {
    readonly title: string;
    readonly prd: string;
    readonly playbook?: string;
    readonly finding?: JobSummary;
    readonly placement?: "checkout" | "worktree";
    readonly branch?: string;
    readonly worktreePath?: string;
  };
  readonly onClose: () => void;
  readonly onQueued: (message: string) => void;
}): ReactElement {
  const fallback = useMemo(
    () => preferredWorkspace(props.workspaces, props.jobs ?? []),
    [props.workspaces, props.jobs],
  );
  const first =
    props.defaultWorkspace && props.defaultWorkspace !== "all"
      ? props.defaultWorkspace
      : fallback;
  const seedFinding = props.preset?.finding;
  const [workspace, setWorkspace] = useState(
    seedFinding?.workspacePath ?? first,
  );
  const [title, setTitle] = useState(
    (props.preset?.title ?? "").trim() || seedFinding?.title || "",
  );
  const [prd, setPrd] = useState(props.preset?.prd ?? "");
  const [playbook, setPlaybook] = useState(() => {
    if (seedFinding) return "finding";
    const preset = props.preset?.playbook;
    if (!preset || preset === "ticket") return "console";
    return preset;
  });
  const [findingRepo, setFindingRepo] = useState(
    seedFinding?.workspacePath ?? first,
  );
  const [findingId, setFindingId] = useState(seedFinding?.id ?? "");
  const findingRepoRef = useRef(findingRepo);
  const [reviewTarget, setReviewTarget] = useState("pr");
  const [findingText, setFindingText] = useState("");
  const [placement, setPlacement] = useState<"checkout" | "worktree">(
    props.preset?.placement === "worktree" ? "worktree" : "checkout",
  );
  const [targetBranch, setTargetBranch] = useState(props.preset?.branch ?? "");
  const [targetWorktree, setTargetWorktree] = useState(
    props.preset?.worktreePath ?? "",
  );
  const [agent, setAgent] = useState<AgentChoice>(() => {
    if (typeof localStorage === "undefined") return "auto";
    const stored = localStorage.getItem("prism.console.compose.agent");
    return stored === "cursor" || stored === "claude" || stored === "auto"
      ? stored
      : "auto";
  });
  const [model, setModel] = useState("");
  const [modelOptions, setModelOptions] = useState<
    { value: string; label: string }[]
  >([AGENT_DEFAULT_MODEL]);
  const [modelHint, setModelHint] = useState<string | undefined>(
    "Loading this agent's models…",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const findingRepos = useMemo(() => {
    const notes = findingsIndex(props.jobs ?? []);
    return props.workspaces.map((row) => ({
      path: row.path,
      label: row.label,
      jobCount: notes.filter((job) => job.workspacePath === row.path).length,
    }));
  }, [props.workspaces, props.jobs]);
  const repoFindings = useMemo(() => {
    const listed = findingsForRepo(props.jobs ?? [], findingRepo, {
      range: "all",
    });
    return withSeedFinding(
      listed,
      seedFinding?.workspacePath === findingRepo ? seedFinding : undefined,
    );
  }, [props.jobs, findingRepo, seedFinding]);
  const selectedFinding = repoFindings.find((job) => job.id === findingId);

  useEffect(() => {
    if (findingRepoRef.current === findingRepo) return;
    findingRepoRef.current = findingRepo;
    setFindingId("");
    setFindingText("");
  }, [findingRepo]);

  useEffect(() => {
    if (findingId && !repoFindings.some((job) => job.id === findingId)) {
      setFindingId("");
    }
  }, [findingId, repoFindings]);

  useEffect(() => {
    let cancelled = false;
    setModel("");
    setModelOptions([AGENT_DEFAULT_MODEL]);
    setModelHint("Loading this agent's models…");
    const query = new URLSearchParams({ backend: agent });
    if (workspace) query.set("workspace", workspace);
    void getJson<WorkerModelsResponse>(
      `/api/worker-models?${query}`,
      props.token,
    )
      .then((body) => {
        if (cancelled) return;
        const next = modelOptionsFromAgent(body);
        setModelOptions(next);
        setModelHint(
          next.length === 1
            ? "This agent did not return a list — using its default."
            : undefined,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setModelHint("Could not load this agent's models — using its default.");
      });
    return () => {
      cancelled = true;
    };
  }, [agent, workspace, props.token]);

  useEffect(() => {
    if (!selectedFinding) {
      setFindingText("");
      return;
    }
    const note = jobNotePaths(selectedFinding)[0];
    const fallback = [
      selectedFinding.title,
      selectedFinding.resultSummary,
      ...(selectedFinding.notes ?? []),
    ]
      .filter(Boolean)
      .join("\n");
    if (!note) {
      setFindingText(fallback);
      return;
    }
    let cancelled = false;
    const query = new URLSearchParams({ path: note });
    if (selectedFinding.workspacePath) {
      query.set("workspace", selectedFinding.workspacePath);
    }
    void getJson<NoteFile>(
      `/api/jobs/${encodeURIComponent(selectedFinding.id)}/notes?${query}`,
      props.token,
    )
      .then((file) => {
        if (cancelled) return;
        const text = file.text?.trim() || fallback;
        setFindingText(text);
      })
      .catch(() => {
        if (!cancelled) setFindingText(fallback);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFinding, props.token]);

  const submit = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!workspace) {
      setError("Add a repository first");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const queuedPrd = composeQueuedPrd({
        prd,
        ...(playbook === "prism-review-pr"
          ? { reviewSeed: reviewTargetOf(reviewTarget)?.seed }
          : {}),
        ...(playbook === "finding" && selectedFinding
          ? {
              finding: {
                title: selectedFinding.title,
                text: findingText,
              },
            }
          : {}),
      });
      const nextPlacement =
        playbook === SKILL_PLAYBOOK ? "checkout" : placement;
      const result = await postJson<{ message?: string; error?: string }>(
        "/api/jobs",
        props.token,
        {
          workspace,
          title: title.trim(),
          prd: queuedPrd,
          playbook,
          placement: nextPlacement,
          workerBackend: agent === "auto" ? undefined : agent,
          ...(model.trim() ? { workerModel: model.trim() } : {}),
          ...(nextPlacement === "worktree" && targetBranch.trim()
            ? { branch: targetBranch.trim() }
            : {}),
          ...(nextPlacement === "worktree" && targetWorktree.trim()
            ? { worktreePath: targetWorktree.trim() }
            : {}),
          ...(playbook === "finding" && selectedFinding
            ? { parentJobId: selectedFinding.id, origin: "finding" }
            : {}),
        },
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      props.onQueued(result.message ?? "Queued.");
      props.onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title="New job"
      onClose={props.onClose}
      onPrimaryAction={() => void submit()}
      footer={
        <div className="compose__foot">
          <p className="compose__keys">Esc to close · ⌘↵ to queue</p>
          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            form="compose-job"
            aria-keyshortcuts="Meta+Enter Control+Enter"
          >
            {busy ? "Queueing…" : "Queue job"}
          </Button>
        </div>
      }
    >
      <form
        id="compose-job"
        className="compose__form"
        onSubmit={(event) => void submit(event)}
        onKeyDown={(event) => {
          if (isPrimaryActionKey(event)) {
            event.preventDefault();
            void submit();
          }
        }}
      >
        <RepoSelect
          token={props.token}
          label="Repo"
          value={workspace}
          onChange={setWorkspace}
          repos={props.workspaces}
        />
        <Input
          label="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
        <div className="compose__playbook">
          <Select
            label="Playbook"
            hint={playbookHint(playbook)}
            value={playbook}
            onChange={(id) => {
              setPlaybook(id);
              if (id === SKILL_PLAYBOOK) {
                setPlacement("checkout");
                setTargetBranch("");
                setTargetWorktree("");
              }
            }}
            options={PLAYBOOKS.map((row) => ({
              value: row.id,
              label: row.label,
            }))}
          />
          {playbook === "finding" ? (
            <div className="compose__pair">
              <RepoSelect
                token={props.token}
                label="Repository"
                hint="Write-ups from this checkout."
                value={findingRepo}
                onChange={setFindingRepo}
                jobsOnly={false}
                repos={findingRepos}
              />
              <Select
                label="Finding"
                hint={
                  !findingRepo
                    ? "Pick a repository first."
                    : repoFindings.length === 0
                      ? "No write-ups in this checkout."
                      : selectedFinding
                        ? `Will attach ${selectedFinding.title}.`
                        : "Pick a write-up from this checkout to attach."
                }
                value={findingId}
                disabled={!findingRepo}
                onChange={(id) => {
                  const previousTitle = selectedFinding?.title;
                  setFindingId(id);
                  const next = repoFindings.find((job) => job.id === id);
                  if (!next) return;
                  setTitle((current) =>
                    !current.trim() || current === previousTitle
                      ? next.title
                      : current,
                  );
                }}
                options={[
                  { value: "", label: "Choose a finding" },
                  ...repoFindings.map((job) => ({
                    value: job.id,
                    label: job.title,
                  })),
                ]}
              />
            </div>
          ) : null}
          {playbook === "prism-review-pr" ? (
            <Select
              label="Review"
              hint="What the teammate should audit."
              value={reviewTarget}
              onChange={setReviewTarget}
              options={REVIEW_TARGETS.map((row) => ({
                value: row.id,
                label: row.label,
              }))}
            />
          ) : null}
        </div>
        <div className="compose__pair">
          <Select
            label="Agent"
            value={agent}
            onChange={(value) => {
              const next = value as AgentChoice;
              setAgent(next);
              localStorage.setItem("prism.console.compose.agent", next);
            }}
            options={[
              { value: "auto", label: "Auto (this window)" },
              { value: "cursor", label: "Cursor" },
              { value: "claude", label: "Claude Code" },
            ]}
          />
          <Select
            label="Model"
            value={model}
            hint={modelHint}
            onChange={setModel}
            options={modelOptions}
          />
        </div>
        <RadioGroup
          name="placement"
          legend="Placement"
          value={placement}
          onChange={(value) => {
            const next = value === "worktree" ? "worktree" : "checkout";
            setPlacement(next);
            if (next === "checkout") {
              setTargetBranch("");
              setTargetWorktree("");
              return;
            }
            setTargetBranch(props.preset?.branch ?? "");
            setTargetWorktree(props.preset?.worktreePath ?? "");
          }}
          options={[
            {
              value: "checkout",
              label: "Current worktree",
              hint:
                playbook === SKILL_PLAYBOOK
                  ? "Context only — this job does not edit the repo, so a dirty tree is fine"
                  : "Edits stay uncommitted on this branch, in this folder",
            },
            {
              value: "worktree",
              label: "Isolated branch",
              hint:
                playbook === SKILL_PLAYBOOK
                  ? "Not needed for a skill. Prefer Current worktree"
                  : targetWorktree
                    ? `Runs on ${targetBranch || "this worktree"}`
                    : "New branch in a separate worktree Prism reviews later",
            },
          ]}
        />
        <div className="compose__brief">
          <Textarea
            label="What should the teammate do?"
            placeholder="Write prompt here"
            rows={8}
            value={prd}
            onChange={(event) => setPrd(event.target.value)}
          />
        </div>
        {error ? (
          <p className="compose__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Drawer>
  );
}

function agentChoiceOf(job: JobSummary): AgentChoice {
  return job.workerBackend === "cursor" || job.workerBackend === "claude"
    ? job.workerBackend
    : "auto";
}

function playbookLabelOf(job: JobSummary): string {
  const id = job.playbook?.trim();
  if (!id || id === "ticket") {
    return playbookOf("console")?.label ?? "Blank brief";
  }
  return playbookOf(id)?.label ?? id;
}

export function InstructionDrawer(props: {
  readonly token: string;
  readonly job: JobSummary;
  readonly workspaces: readonly JobWorkspaceChip[];
  readonly onClose: () => void;
  readonly onSent: (message: string) => void;
}): ReactElement {
  const job = props.job;
  const workspace = job.workspacePath ?? "";
  const agent = agentChoiceOf(job);
  const playbookId =
    !job.playbook || job.playbook === "ticket" ? "console" : job.playbook;
  const playbookOptions = PLAYBOOKS.some((row) => row.id === playbookId)
    ? PLAYBOOKS.map((row) => ({ value: row.id, label: row.label }))
    : [
        { value: playbookId, label: playbookLabelOf(job) },
        ...PLAYBOOKS.map((row) => ({ value: row.id, label: row.label })),
      ];
  const modelLabel = jobModelLabel(
    job.workerBackend,
    job.workerModel,
    job.workerThinking,
  );
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    const text = instruction.trim();
    if (!text) {
      setError("Instruction is required");
      return;
    }
    if (!workspace) {
      setError("This job has no repository");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await postJson<{ message?: string; error?: string }>(
        `/api/jobs/${encodeURIComponent(job.id)}/control`,
        props.token,
        {
          action: "attach_context",
          workspace,
          context: text,
        },
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      props.onSent(
        result.message?.trim() ||
          `Queued for ${job.title}. The teammate will pick it up next.`,
      );
      props.onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={`Add instruction to ${job.title}`}
      onClose={props.onClose}
      onPrimaryAction={() => void submit()}
      footer={
        <div className="compose__foot">
          <p className="compose__keys">Esc to close · ⌘↵ to send</p>
          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            form="instruct-job"
            aria-keyshortcuts="Meta+Enter Control+Enter"
          >
            {busy ? "Sending…" : "Add instruction"}
          </Button>
        </div>
      }
    >
      <form
        id="instruct-job"
        className="compose__form"
        onSubmit={(event) => void submit(event)}
        onKeyDown={(event) => {
          if (isPrimaryActionKey(event)) {
            event.preventDefault();
            void submit();
          }
        }}
      >
        <RepoSelect
          token={props.token}
          label="Repo"
          value={workspace}
          onChange={() => undefined}
          disabled
          repos={props.workspaces}
        />
        <Input label="Title" value={job.title} disabled />
        <div className="compose__playbook">
          <Select
            label="Playbook"
            hint={playbookHint(playbookId)}
            value={playbookId}
            onChange={() => undefined}
            disabled
            options={playbookOptions}
          />
        </div>
        <div className="compose__pair">
          <Select
            label="Agent"
            value={agent}
            onChange={() => undefined}
            disabled
            options={[
              { value: "auto", label: "Auto (this window)" },
              { value: "cursor", label: "Cursor" },
              { value: "claude", label: "Claude Code" },
            ]}
          />
          <Select
            label="Model"
            value={job.workerModel ?? ""}
            onChange={() => undefined}
            disabled
            options={[
              {
                value: job.workerModel ?? "",
                label: job.workerModel ? modelLabel : "Agent default",
              },
            ]}
          />
        </div>
        <RadioGroup
          name="instruct-placement"
          legend="Placement"
          value={job.placement === "worktree" ? "worktree" : "checkout"}
          disabled
          onChange={() => undefined}
          options={[
            {
              value: "checkout",
              label: "Current worktree",
              hint: "Edits stay uncommitted on this branch, in this folder",
            },
            {
              value: "worktree",
              label: "Isolated branch",
              hint: "New branch in a separate worktree Prism reviews later",
            },
          ]}
        />
        <div className="compose__brief">
          <Textarea
            label="Brief"
            rows={4}
            value={job.prd ?? ""}
            disabled
            onChange={() => undefined}
          />
          <Textarea
            label="Instruction"
            hint="The teammate picks this up on its next turn."
            placeholder="What should it do next?"
            rows={8}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </div>
        {error ? (
          <p className="compose__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Drawer>
  );
}
