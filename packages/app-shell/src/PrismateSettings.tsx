/**
 * Dispatch knobs that used to live on the Console Settings tab.
 * Same store as the `configure` tool (`.prism/dispatch`), reached over HTTP
 * so app-shell never imports `@repo-prism/dispatch`.
 */

import type { ConsoleStatus } from "@repo-prism/shared";
import { EmptyState, Input, Select, Textarea, Text } from "@repo-prism/ui";
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { clearAuditLog } from "./audit-log.js";
import { clearIntegrationsState } from "./integrations-store.js";
import { clearTourCompleted } from "./PrismTour.js";

export type PrismateConfig = {
  readonly dispatchMode: "ask" | "auto" | "inline";
  readonly placement: "checkout" | "worktree";
  readonly workerBackend: "auto" | "cursor" | "claude";
  readonly maxJobs: number;
  readonly verifyJobs: boolean;
  readonly subagents: boolean;
  readonly fanout: boolean;
  readonly jobInstructions: string;
  readonly hints: boolean;
  readonly ticketHost: "linear" | "jira";
  readonly sectionsOff: readonly string[];
  readonly standupTemplate: string;
  readonly preferences: readonly string[];
  readonly mentionWindowHours: number;
  readonly mentionLimit: number;
  readonly trackedMessageLimit: number;
  readonly slackTrackChannelIds: readonly string[];
};

type VendorId = "slack" | "github" | "notion" | "calendar" | "linear" | "jira";
type SectionId =
  | "jobs"
  | "git"
  | "tickets"
  | "github"
  | "slack"
  | "notion"
  | "calendar"
  | "focus"
  | "memories";

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

import { dashboardLink } from "./hub-link.js";

export { dashboardLink };

function standupNotesText(config: PrismateConfig): string {
  const template = config.standupTemplate;
  const extras = config.preferences.filter(
    (line) => line.length > 0 && !template.includes(line),
  );
  if (extras.length === 0) return template;
  return template ? `${template}\n${extras.join("\n")}` : extras.join("\n");
}

function flattenStandup(config: PrismateConfig): PrismateConfig {
  return { ...config, standupTemplate: standupNotesText(config) };
}

/** Drop every `prism.*` key this surface stored in the browser. */
export function clearLocalPrismUi(): void {
  clearAuditLog();
  clearIntegrationsState();
  clearTourCompleted();
  if (typeof localStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("prism.")) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* ignore quota / private-mode */
  }
}

/** Hub-down / proxy failures arrive as Node's "fetch failed". */
export function explainPrismateError(message: string): string {
  if (
    /fetch failed|Failed to fetch|ECONNREFUSED|not running|asleep/i.test(
      message,
    )
  ) {
    return "Job settings could not be loaded. Say prism wake, then reopen Prismate.";
  }
  return message;
}

async function readJson(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const joined = new URL(
    url,
    typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin,
  );
  if (token && !joined.searchParams.has("token")) {
    joined.searchParams.set("token", token);
  }
  const res = await fetch(joined.toString(), {
    ...init,
    headers,
    cache: "no-store",
  });
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(err);
  }
  return body;
}

export function PrismateSettings(props: {
  readonly workspacePath: string;
  readonly consoleStatus?: ConsoleStatus;
}): ReactElement {
  const link = dashboardLink(props.consoleStatus);
  const [config, setConfig] = useState<PrismateConfig | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [vendors, setVendors] = useState<
    Record<VendorId, boolean> | undefined
  >();
  const [connectorsFailed, setConnectorsFailed] = useState(false);

  useEffect(() => {
    if (!link || !props.workspacePath) return;
    let alive = true;
    const query = `workspace=${encodeURIComponent(props.workspacePath)}`;
    void readJson(`${link.base}/api/settings?${query}`, link.token)
      .then((body) => {
        if (!alive) return;
        const row = body as { config?: PrismateConfig };
        if (!row.config) throw new Error("Settings response was empty.");
        setConfig(flattenStandup(row.config));
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (alive) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    void readJson(`${link.base}/api/connectors?${query}`, link.token)
      .then((body) => {
        if (!alive) return;
        const row = body as { vendors?: Record<VendorId, boolean> };
        setVendors(
          row.vendors ?? {
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
  }, [link?.base, link?.token, props.workspacePath]);

  const patch = (next: Partial<PrismateConfig>): void => {
    if (!config) return;
    setConfig({ ...config, ...next });
    setSaved(false);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!config || !link) return;
    setBusy(true);
    try {
      const trimmed = {
        ...config,
        workspace: props.workspacePath,
        preferences: config.standupTemplate
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      };
      const body = (await readJson(`${link.base}/api/settings`, link.token, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trimmed),
      })) as { config?: PrismateConfig };
      if (body.config) setConfig(flattenStandup(body.config));
      setSaved(true);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!link) {
    return (
      <EmptyState variant="page" title="Prismate">
        Open Settings from the Prism Dashboard to change how jobs run.
      </EmptyState>
    );
  }

  if (!config && !error) {
    return (
      <SettingsCard title="Prismate">
        <p className="set-static">Loading Prismate settings…</p>
      </SettingsCard>
    );
  }

  if (error && !config) {
    return (
      <EmptyState variant="page" title="Prismate">
        {explainPrismateError(error)}
      </EmptyState>
    );
  }

  const has = (vendor: VendorId): boolean => vendors?.[vendor] === true;
  const sectionOn = (id: SectionId): boolean =>
    !config?.sectionsOff.includes(id);
  const toggleSection = (id: SectionId, on: boolean): void => {
    if (!config) return;
    const off = new Set(config.sectionsOff);
    if (on) off.delete(id);
    else off.add(id);
    patch({ sectionsOff: [...off] });
  };
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

  return (
    <form className="set-prismate" onSubmit={(event) => void onSubmit(event)}>
      {error ? (
        <p className="set-info" role="alert">
          {explainPrismateError(error)}
        </p>
      ) : null}
      {config ? (
        <>
          <SettingsCard title="How jobs run">
            <SettingsRow
              label="When Prism should start a teammate"
              help="Ask first is the default. Always dispatch never asks. Inline only starts a job when you say so."
            >
              <Select
                aria-label="When Prism should start a teammate"
                value={config.dispatchMode}
                options={[
                  { value: "ask", label: "Ask first (default)" },
                  { value: "auto", label: "Always dispatch" },
                  { value: "inline", label: "Only when I ask for a job" },
                ]}
                onChange={(value) =>
                  patch({
                    dispatchMode: value as PrismateConfig["dispatchMode"],
                  })
                }
              />
            </SettingsRow>
            <SettingsRow
              label="Where the teammate works"
              help="Current worktree leaves edits uncommitted. Isolated branch uses a job worktree."
            >
              <Select
                aria-label="Where the teammate works"
                value={config.placement}
                options={[
                  {
                    value: "checkout",
                    label: "Current worktree (uncommitted)",
                  },
                  { value: "worktree", label: "Isolated branch" },
                ]}
                onChange={(value) =>
                  patch({ placement: value as PrismateConfig["placement"] })
                }
              />
            </SettingsRow>
            <SettingsRow
              label="Which agent runs the job"
              help="Match this host uses Cursor in Cursor and Claude Code in Claude Code."
            >
              <Select
                aria-label="Which agent runs the job"
                value={config.workerBackend}
                options={[
                  { value: "auto", label: "Match this host" },
                  { value: "cursor", label: "Cursor" },
                  { value: "claude", label: "Claude Code" },
                ]}
                onChange={(value) =>
                  patch({
                    workerBackend: value as PrismateConfig["workerBackend"],
                  })
                }
              />
            </SettingsRow>
            <SettingsRow
              label="Max jobs at once"
              help="Cap on teammates running at the same time (1–20)."
            >
              <Input
                aria-label="Max jobs at once"
                className="set-input--compact"
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
            </SettingsRow>
            <SettingsRow
              label="Verify after stop"
              help="Prism runs this repository's checks after the teammate stops, not during the job."
            >
              <Toggle
                checked={config.verifyJobs}
                label={config.verifyJobs ? "On" : "Off"}
                onChange={(checked) => patch({ verifyJobs: checked })}
              />
            </SettingsRow>
            <SettingsRow
              label="In-process subagents"
              help="Helpers inside one teammate. No extra OS process."
            >
              <Toggle
                checked={config.subagents}
                label={config.subagents ? "On" : "Off"}
                onChange={(checked) => patch({ subagents: checked })}
              />
            </SettingsRow>
            <SettingsRow
              label="Split one brief"
              help="Stored, but Prism does not split a brief into sibling jobs yet. Leave this off."
            >
              <Toggle
                checked={config.fanout}
                label={config.fanout ? "On" : "Off"}
                onChange={(checked) => patch({ fanout: checked })}
              />
            </SettingsRow>
            <SettingsRow
              label="Instructions for jobs"
              help="How every teammate should work — pasted into the job prompt. One-off facts still belong in Remember."
            >
              <Textarea
                aria-label="Instructions for jobs"
                rows={4}
                value={config.jobInstructions}
                placeholder="e.g. Prefer small diffs. Ask before renaming public APIs."
                onChange={(event) =>
                  patch({ jobInstructions: event.target.value })
                }
              />
            </SettingsRow>
          </SettingsCard>

          <SettingsCard title="Standup">
            {ticketOptions.length > 0 ? (
              <SettingsRow
                label="Tickets"
                help="Which ticket host “start my day” should read."
              >
                <Select
                  aria-label="Tickets"
                  value={
                    ticketOptions.some((row) => row.value === config.ticketHost)
                      ? config.ticketHost
                      : (ticketOptions[0]?.value ?? config.ticketHost)
                  }
                  options={ticketOptions}
                  onChange={(value) =>
                    patch({ ticketHost: value as PrismateConfig["ticketHost"] })
                  }
                />
              </SettingsRow>
            ) : null}
            <SettingsRow
              label="Configure hints"
              help="Show a configure hint at the bottom of standup."
            >
              <Toggle
                checked={config.hints}
                label={config.hints ? "On" : "Off"}
                onChange={(checked) => patch({ hints: checked })}
              />
            </SettingsRow>
            <SettingsRow
              label="Standup sections"
              help="Off hides that heading in “start my day”. Vendor sections appear only when that plugin is signed in for this agent window."
            >
              <div className="set-prismate__toggles">
                {connectorsFailed ? (
                  <p className="set-row__help">
                    Could not see which plugins this agent window has, so Slack,
                    Linear, GitHub, Notion and Calendar toggles are hidden
                    rather than guessed.
                  </p>
                ) : null}
                {visibleSections.map((id) => (
                  <Toggle
                    key={id}
                    checked={sectionOn(id)}
                    label={SECTION_LABELS[id]}
                    onChange={(on) => toggleSection(id, on)}
                  />
                ))}
              </div>
            </SettingsRow>
            <SettingsRow
              label="Standup notes"
              help="How “start my day” should be written — terse, greet by name, lead with tickets. Never hides a section or a finished job."
            >
              <Textarea
                aria-label="Standup notes"
                rows={4}
                value={config.standupTemplate}
                placeholder={"standup: terse\ngreet me by name"}
                onChange={(event) =>
                  patch({ standupTemplate: event.target.value })
                }
              />
            </SettingsRow>
          </SettingsCard>

          {has("slack") ? (
            <SettingsCard title="Mentions and Slack">
              <SettingsRow
                label="Mention window (hours)"
                help="How far back standup looks for mentions (1–168)."
              >
                <Input
                  aria-label="Mention window (hours)"
                  className="set-input--compact"
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
              </SettingsRow>
              <SettingsRow label="Mention limit" help="Max mentions to show.">
                <Input
                  aria-label="Mention limit"
                  className="set-input--compact"
                  type="number"
                  min={1}
                  max={50}
                  value={config.mentionLimit}
                  onChange={(event) =>
                    patch({
                      mentionLimit:
                        Number.parseInt(event.target.value, 10) || 10,
                    })
                  }
                />
              </SettingsRow>
              <SettingsRow
                label="Tracked Slack messages"
                help="Max tracked messages to show."
              >
                <Input
                  aria-label="Tracked Slack messages"
                  className="set-input--compact"
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
              </SettingsRow>
              <SettingsRow
                label="Slack channels to track"
                help="Comma-separated channel ids, up to five."
              >
                <Input
                  aria-label="Slack channels to track"
                  className="set-input"
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
              </SettingsRow>
            </SettingsCard>
          ) : null}

          <div className="set-prismate__actions">
            <button type="submit" className="ov-btn" disabled={busy}>
              {busy ? "Saving…" : saved ? "Saved" : "Save"}
            </button>
          </div>
        </>
      ) : null}
    </form>
  );
}

export function WipePrismDataCard(props: {
  readonly consoleStatus?: ConsoleStatus;
}): ReactElement {
  const link = dashboardLink(props.consoleStatus);
  const wipeId = useId();
  const [wipeText, setWipeText] = useState("");
  const [wiping, setWiping] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState<string | undefined>();

  const wipeAll = async (): Promise<void> => {
    if (!link || wipeText.trim().toLowerCase() !== "wipe") return;
    setWiping(true);
    try {
      const body = (await readJson(`${link.base}/api/wipe`, link.token, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: wipeText }),
      })) as { message?: string };
      clearLocalPrismUi();
      setDone(
        body.message ??
          "Prism data is gone. Reload the Prism MCP server, then open the Console again.",
      );
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWiping(false);
    }
  };

  return (
    <SettingsCard title="Wipe all Prism data">
      <div className="set-wipe">
        <p className="set-wipe__help">
          Deletes everything Prism stores on this machine: the library
          (~/.prism) and the .prism folder in every registered repository —
          jobs, memories, skills, Console session, index, Envelope, and this
          browser&apos;s Prism settings. Source code and git history stay.
        </p>
        {!link ? (
          <p className="set-wipe__status" role="status">
            Wipe needs the Dashboard API. Say prism wake, then reopen General.
          </p>
        ) : null}
        {error ? (
          <p className="set-wipe__status" role="alert">
            {explainPrismateError(error)}
          </p>
        ) : null}
        {done ? (
          <p className="set-wipe__status" role="status">
            {done}
          </p>
        ) : null}
        {link && !done ? (
          <div className="set-wipe__confirm">
            <div className="set-wipe__copy">
              <label className="set-wipe__label" htmlFor={wipeId}>
                Type wipe to confirm
              </label>
              <p className="set-wipe__hint">
                This cannot be undone. Prism will look like a newly installed
                MCP.
              </p>
            </div>
            <div className="set-wipe__row">
              <Input
                id={wipeId}
                aria-label="Type wipe to confirm"
                className="set-wipe__input"
                value={wipeText}
                placeholder="wipe"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setWipeText(event.target.value)}
              />
              <button
                type="button"
                className="ov-btn ov-btn--danger"
                disabled={wiping || wipeText.trim().toLowerCase() !== "wipe"}
                onClick={() => void wipeAll()}
              >
                {wiping ? "Wiping…" : "Wipe all Prism data"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </SettingsCard>
  );
}

function SettingsCard(props: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="ov-card set-card">
      <Text variant="card" as="h2" className="set-card__title">
        {props.title}
      </Text>
      <div className="set-card__body">{props.children}</div>
    </section>
  );
}

function SettingsRow(props: {
  label: string;
  help: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="set-row">
      <div className="set-row__copy">
        <div className="set-row__label">{props.label}</div>
        <div className="set-row__help">{props.help}</div>
      </div>
      <div className="set-row__control">{props.children}</div>
    </div>
  );
}

function Toggle(props: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className="set-toggle"
      data-on={props.checked ? "true" : "false"}
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
    >
      <span className="set-toggle__track" aria-hidden>
        <span className="set-toggle__knob" />
      </span>
      <span className="set-toggle__text">{props.label}</span>
    </button>
  );
}
