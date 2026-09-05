import type { JobSummary, JobWorkspaceChip } from "@repo-prism/app-shell";
import {
  Button,
  Drawer,
  Input,
  RadioGroup,
  Select,
  Textarea,
} from "@repo-prism/ui";
import { useMemo, useState, type FormEvent, type ReactElement } from "react";
import { PLAYBOOKS, preferredWorkspace } from "./fleet.js";
import { RepoSelect } from "./repo-select.js";
import { postJson } from "./session.js";

export function ComposeDrawer(props: {
  readonly token: string;
  readonly workspaces: readonly JobWorkspaceChip[];
  readonly jobs?: readonly JobSummary[];
  readonly defaultWorkspace?: string;
  readonly preset?: {
    readonly title: string;
    readonly prd: string;
    readonly playbook?: string;
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
  const [workspace, setWorkspace] = useState(first);
  const [title, setTitle] = useState(props.preset?.title ?? "");
  const [prd, setPrd] = useState(props.preset?.prd ?? "");
  const [playbook, setPlaybook] = useState(props.preset?.playbook ?? "console");
  const [placement, setPlacement] = useState<"checkout" | "worktree">(
    "checkout",
  );
  const [agent, setAgent] = useState<"auto" | "cursor" | "claude">(() => {
    if (typeof localStorage === "undefined") return "auto";
    const stored = localStorage.getItem("prism.console.compose.agent");
    return stored === "cursor" || stored === "claude" || stored === "auto"
      ? stored
      : "auto";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
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
      const result = await postJson<{ message?: string; error?: string }>(
        "/api/jobs",
        props.token,
        {
          workspace,
          title: title.trim(),
          prd,
          playbook,
          placement,
          workerBackend: agent === "auto" ? undefined : agent,
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
      footer={
        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          form="compose-job"
        >
          {busy ? "Queueing…" : "Queue job"}
        </Button>
      }
    >
      <form
        id="compose-job"
        className="compose__form"
        onSubmit={(event) => void submit(event)}
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
        <Select
          label="Playbook"
          value={playbook}
          onChange={setPlaybook}
          options={PLAYBOOKS.map((row) => ({
            value: row.id,
            label: row.label,
          }))}
        />
        <Select
          label="Agent"
          value={agent}
          onChange={(value) => {
            const next = value as "auto" | "cursor" | "claude";
            setAgent(next);
            localStorage.setItem("prism.console.compose.agent", next);
          }}
          options={[
            { value: "auto", label: "Auto (this window)" },
            { value: "cursor", label: "Cursor" },
            { value: "claude", label: "Claude Code" },
          ]}
        />
        <RadioGroup
          name="placement"
          legend="Placement"
          value={placement}
          onChange={(value) =>
            setPlacement(value === "worktree" ? "worktree" : "checkout")
          }
          options={[
            {
              value: "checkout",
              label: "checkout",
              hint: "Edits stay uncommitted in this folder",
            },
            {
              value: "worktree",
              label: "worktree",
              hint: "Isolated branch Prism reviews later",
            },
          ]}
        />
        <Textarea
          label="What should the teammate do?"
          rows={8}
          value={prd}
          onChange={(event) => setPrd(event.target.value)}
        />
        {error ? (
          <p className="compose__error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Drawer>
  );
}
