import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import {
  EmptyState,
  Select,
  Button,
  Textarea,
  Input,
  isPrimaryActionKey,
} from "@repo-prism/ui";
import type { DispatchConfig } from "@repo-prism/dispatch";
import { showConsoleToast } from "./console-toast.js";
import { ToggleCheck } from "./fields.js";
import { RepoSelect } from "./repo-select.js";
import {
  getJson,
  postJson,
  WORKSPACES_CHANGED,
  notifyWorkspacesChanged,
} from "./session.js";

type RepoRow = {
  readonly path: string;
  readonly label: string;
  readonly jobCount?: number;
};

type ReposResponse = { readonly repos: RepoRow[] };

type SettingsResponse = {
  readonly workspace: string;
  readonly label: string;
  readonly config: DispatchConfig;
};

type VendorId = "slack" | "github" | "notion" | "calendar" | "linear" | "jira";

type ConnectorsResponse = {
  readonly connectors: readonly { id: string; label: string }[];
  readonly vendors?: Record<VendorId, boolean>;
};

type SectionId = DispatchConfig["sectionOrder"][number];

/** Template plus standing preferences that are not already in it. */
function standupNotesText(config: DispatchConfig): string {
  const template = config.standupTemplate;
  const extras = config.preferences.filter(
    (line) => line.length > 0 && !template.includes(line),
  );
  if (extras.length === 0) return template;
  return template ? `${template}\n${extras.join("\n")}` : extras.join("\n");
}

function flattenStandup(config: DispatchConfig): DispatchConfig {
  return { ...config, standupTemplate: standupNotesText(config) };
}

const ALWAYS_SECTIONS: readonly SectionId[] = [
  "jobs",
  "git",
  "focus",
  "memories",
];

const BRIEFING_SECTIONS: readonly SectionId[] = [
  "jobs",
  "git",
  "tickets",
  "github",
  "slack",
  "notion",
  "calendar",
  "focus",
  "memories",
];

const SECTION_LABELS: Record<SectionId, string> = {
  jobs: "Jobs",
  git: "Git",
  tickets: "Tickets",
  github: "GitHub",
  slack: "Slack",
  notion: "Notion",
  calendar: "Calendar",
  focus: "Suggested focus",
  memories: "Memories",
};

export function SettingsView(props: {
  readonly token: string;
  readonly onRemoveRepo?: (path: string, label: string) => void;
}): ReactElement {
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [workspace, setWorkspace] = useState<string>("");
  const [config, setConfig] = useState<DispatchConfig | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [vendors, setVendors] = useState<
    Record<VendorId, boolean> | undefined
  >();
  const [connectorsFailed, setConnectorsFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const query = workspace
      ? `?workspace=${encodeURIComponent(workspace)}`
      : "";
    void getJson<ConnectorsResponse>(`/api/connectors${query}`, props.token)
      .then((body) => {
        if (!alive) return;
        setVendors(
          body.vendors ?? {
            slack: false,
            github: false,
            notion: false,
            calendar: false,
            linear: false,
            jira: false,
          },
        );
        setConnectorsFailed(false);
      })
      .catch(() => {
        if (alive) {
          setVendors(undefined);
          setConnectorsFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [props.token, workspace]);

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void getJson<ReposResponse>("/api/repos", props.token)
        .then((body) => {
          if (!alive) return;
          const list = body.repos ?? [];
          setRepos(list);
          setWorkspace((current) =>
            list.some((row) => row.path === current)
              ? current
              : list[0]?.path || "",
          );
        })
        .catch((cause: unknown) => {
          if (alive) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        });
    };
    load();
    window.addEventListener(WORKSPACES_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(WORKSPACES_CHANGED, load);
    };
  }, [props.token]);

  useEffect(() => {
    if (!workspace) return;
    let alive = true;
    void getJson<SettingsResponse>(
      `/api/settings?workspace=${encodeURIComponent(workspace)}`,
      props.token,
    )
      .then((body) => {
        if (!alive) return;
        setConfig(flattenStandup(body.config));
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      alive = false;
    };
  }, [props.token, workspace]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!config || !workspace) return;
    setBusy(true);
    try {
      const trimmed = {
        ...config,
        preferences: config.standupTemplate
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      };
      const body = await postJson<SettingsResponse>(
        "/api/settings",
        props.token,
        { workspace, ...trimmed },
      );
      setConfig(flattenStandup(body.config));
      showConsoleToast("Dispatch settings saved");
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const patch = (next: Partial<DispatchConfig>): void => {
    if (!config) return;
    setConfig({ ...config, ...next });
  };

  const sectionOn = (id: SectionId): boolean =>
    !config?.sectionsOff.includes(id);

  const toggleSection = (id: SectionId, on: boolean): void => {
    if (!config) return;
    const off = new Set(config.sectionsOff);
    if (on) off.delete(id);
    else off.add(id);
    patch({ sectionsOff: [...off] });
  };

  const has = (vendor: VendorId): boolean => vendors?.[vendor] === true;

  const visibleSections = BRIEFING_SECTIONS.filter((id) => {
    if (ALWAYS_SECTIONS.includes(id)) return true;
    if (id === "tickets") return has("linear") || has("jira");
    if (id === "github") return has("github");
    if (id === "slack") return has("slack");
    if (id === "notion") return has("notion");
    if (id === "calendar") return has("calendar");
    return true;
  });

  const ticketOptions = [
    ...(has("linear") ? [{ value: "linear", label: "Linear" }] : []),
    ...(has("jira") ? [{ value: "jira", label: "Jira" }] : []),
  ];

  if (!config && !error) {
    return <p className="console__loading">Loading Dispatch settings…</p>;
  }

  return (
    <section className="console__panel">
      <h1 className="console__title">Dispatch Settings</h1>
      <p className="console__lede">
        These are the same knobs as the <code>configure</code> tool, stored in
        this repository under <code>.prism/dispatch</code>. They never leave the
        machine.
      </p>
      {error ? <EmptyState>{error}</EmptyState> : null}
      {repos.length > 0 ? (
        <div className="dispatch-settings">
          <fieldset className="dispatch-settings__group">
            <legend>Repositories</legend>
            <p className="dispatch-settings__lede">
              Removing a repository hides it from this Console. The checkout and
              its jobs stay on disk.
            </p>
            <ul className="dispatch-settings__repos">
              {repos.map((repo) => (
                <li key={repo.path}>
                  <span>
                    <strong>{repo.label}</strong>
                    <em>{repo.path}</em>
                  </span>
                  {props.onRemoveRepo ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        props.onRemoveRepo?.(repo.path, repo.label)
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void postJson<{ path?: string; cancelled?: boolean }>(
                  "/api/workspaces/pick",
                  props.token,
                  {},
                )
                  .then((result) => {
                    if (!result.path) return;
                    notifyWorkspacesChanged();
                    setWorkspace(result.path);
                    showConsoleToast("Repository added");
                  })
                  .catch((cause) =>
                    showConsoleToast(
                      cause instanceof Error ? cause.message : String(cause),
                      "error",
                    ),
                  );
              }}
            >
              Add repository
            </Button>
          </fieldset>
        </div>
      ) : null}
      {repos.length === 0 && !error ? (
        <>
          <EmptyState>
            <strong>No repositories registered.</strong> Select a folder to add
            one.
          </EmptyState>
          <RepoSelect
            token={props.token}
            label="Repository"
            value={workspace}
            onChange={setWorkspace}
            repos={[]}
          />
        </>
      ) : null}
      {config && repos.length > 0 ? (
        <form
          className="dispatch-settings"
          onKeyDown={(event) => {
            if (isPrimaryActionKey(event)) {
              event.preventDefault();
              event.currentTarget.requestSubmit();
            }
          }}
          onSubmit={(event) => void onSubmit(event)}
        >
          {repos.length > 0 ? (
            <RepoSelect
              label="Repository"
              token={props.token}
              value={workspace}
              onChange={setWorkspace}
              repos={repos}
            />
          ) : (
            <p className="console__lede">
              Settings for <strong>{repos[0]?.label}</strong>
            </p>
          )}

          <fieldset className="dispatch-settings__group">
            <legend>How jobs run</legend>
            <Select
              label="When Prism should start a teammate"
              value={config.dispatchMode}
              options={[
                { value: "ask", label: "Ask first (default)" },
                { value: "auto", label: "Always dispatch" },
                { value: "inline", label: "Only when I ask for a job" },
              ]}
              onChange={(value) =>
                patch({ dispatchMode: value as DispatchConfig["dispatchMode"] })
              }
            />
            <Select
              label="Where the teammate works"
              value={config.placement}
              options={[
                {
                  value: "checkout",
                  label: "Current worktree (uncommitted)",
                },
                { value: "worktree", label: "Isolated branch" },
              ]}
              onChange={(value) =>
                patch({ placement: value as DispatchConfig["placement"] })
              }
            />
            <Select
              label="Which agent runs the job"
              value={config.workerBackend}
              options={[
                { value: "auto", label: "Match this host" },
                { value: "cursor", label: "Cursor" },
                { value: "claude", label: "Claude Code" },
              ]}
              onChange={(value) =>
                patch({
                  workerBackend: value as DispatchConfig["workerBackend"],
                })
              }
            />
            <Input
              label="Max jobs at once"
              type="number"
              min={1}
              max={20}
              value={config.maxJobs}
              onChange={(event) =>
                patch({
                  maxJobs: Number.parseInt(event.target.value, 10) || 1,
                })
              }
            />
            <ToggleCheck
              checked={config.verifyJobs}
              onChange={(checked) => patch({ verifyJobs: checked })}
              hint="Prism runs these after the teammate stops, not during the job."
            >
              Run typecheck and tests after a teammate stops
            </ToggleCheck>
            <ToggleCheck
              checked={config.subagents}
              onChange={(checked) => patch({ subagents: checked })}
              hint="In-process helpers inside one teammate. No extra OS process."
            >
              Allow in-process subagents inside one teammate
            </ToggleCheck>
            <ToggleCheck
              checked={config.fanout}
              onChange={(checked) => patch({ fanout: checked })}
              hint="Stored, but Prism does not split a brief into sibling jobs yet. Leave this off."
            >
              Split one brief into sibling jobs
            </ToggleCheck>
            <Textarea
              label="Instructions for Dispatch jobs"
              rows={4}
              value={config.jobInstructions}
              placeholder="e.g. Prefer small diffs. Ask before renaming public APIs. Don't add comments I didn't ask for."
              hint="How every teammate should work — pasted into the job prompt. One-off facts still belong in Remember."
              onChange={(event) =>
                patch({ jobInstructions: event.target.value })
              }
            />
          </fieldset>

          <details className="dispatch-settings__group">
            <summary>Standup</summary>
            {ticketOptions.length > 0 ? (
              <Select
                label="Tickets"
                value={
                  ticketOptions.some((row) => row.value === config.ticketHost)
                    ? config.ticketHost
                    : (ticketOptions[0]?.value ?? config.ticketHost)
                }
                options={ticketOptions}
                onChange={(value) =>
                  patch({ ticketHost: value as DispatchConfig["ticketHost"] })
                }
              />
            ) : null}
            <ToggleCheck
              checked={config.hints}
              onChange={(checked) => patch({ hints: checked })}
            >
              Show configure hints in standup
            </ToggleCheck>
            <p className="dispatch-settings__lede">
              Sections in “start my day”. Off hides that heading in the standup.
              Vendor sections appear only when that plugin is signed in for this
              agent window — a download in the plugin cache is not enough.
            </p>
            {connectorsFailed ? (
              <p className="dispatch-settings__lede">
                Could not see which plugins this agent window has, so Slack,
                Linear, GitHub, Notion and Calendar settings are hidden rather
                than guessed.
              </p>
            ) : null}
            <div className="dispatch-settings__toggles">
              {visibleSections.map((id) => (
                <ToggleCheck
                  key={id}
                  checked={sectionOn(id)}
                  onChange={(on) => toggleSection(id, on)}
                >
                  {SECTION_LABELS[id]}
                </ToggleCheck>
              ))}
            </div>
            <Textarea
              label="Standup notes"
              rows={4}
              value={config.standupTemplate}
              placeholder={"standup: terse\ngreet me by name"}
              hint="How “start my day” should be written — terse, greet by name, lead with tickets. Pasted at the top of the standup. Never hides a section or a finished job."
              onChange={(event) =>
                patch({ standupTemplate: event.target.value })
              }
            />
          </details>

          {has("slack") ? (
            <details className="dispatch-settings__group">
              <summary>Mentions and Slack</summary>
              <Input
                label="Mention window (hours)"
                type="number"
                min={1}
                max={168}
                value={config.mentionWindowHours}
                onChange={(event) =>
                  patch({
                    mentionWindowHours:
                      Number.parseInt(event.target.value, 10) || 24,
                  })
                }
              />
              <Input
                label="Mention limit"
                type="number"
                min={1}
                max={50}
                value={config.mentionLimit}
                onChange={(event) =>
                  patch({
                    mentionLimit: Number.parseInt(event.target.value, 10) || 10,
                  })
                }
              />
              <Input
                label="Tracked Slack messages"
                type="number"
                min={1}
                max={50}
                value={config.trackedMessageLimit}
                onChange={(event) =>
                  patch({
                    trackedMessageLimit:
                      Number.parseInt(event.target.value, 10) || 15,
                  })
                }
              />
              <Input
                label="Slack channels to track (comma-separated ids)"
                value={config.slackTrackChannelIds.join(", ")}
                placeholder="C01234567, C08999999"
                onChange={(event) =>
                  patch({
                    slackTrackChannelIds: event.target.value
                      .split(",")
                      .map((id) => id.trim())
                      .filter(Boolean)
                      .slice(0, 5),
                  })
                }
              />
            </details>
          ) : null}

          <div className="dispatch-settings__actions">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
