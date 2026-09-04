import { isSectionOn, loadConfig, standupNotesText } from "./config.js";
import {
  buildFillContract,
  formatFillContract,
  type FillContract,
} from "./fill-contract.js";
import { gitSnapshot, type GitRunner } from "./git.js";
import {
  discoverHostConnectors,
  connectorCovers,
  type HostConnector,
} from "./host-connectors.js";
import { loadJobs } from "./jobs.js";
import { loadMemories } from "./memory.js";
import { leftoverFocusSpeak, jobRef, statusPhrase } from "./job-voice.js";
import type {
  DayBriefing,
  DispatchConfig,
  GitSnapshot,
  JobRecord,
  MemoryItem,
} from "./types.js";

export type BriefingDeps = {
  readonly workspaceRoot: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly git?: GitRunner;
  readonly now?: Date;
  /** Injected in tests so discovery does not read the developer's own machine. */
  readonly connectors?: readonly HostConnector[];
};

/**
 * The standup: a local spine plus a contract for the rest (ADR-0049).
 *
 * Prism supplies what only Prism can — git, jobs, memories — and names the
 * sections the host agent should fill with connectors it already has. Nothing
 * here touches the network.
 */
export async function buildDayBriefing(
  deps: BriefingDeps,
): Promise<DayBriefing> {
  const now = deps.now ?? new Date();
  const [config, git, jobs, memories, discovered] = await Promise.all([
    loadConfig(deps.workspaceRoot),
    gitSnapshot(deps.workspaceRoot, deps.git),
    loadJobs(deps.workspaceRoot),
    loadMemories(deps.workspaceRoot),
    deps.connectors
      ? Promise.resolve({ connectors: deps.connectors })
      : discoverHostConnectors({ workspaceRoot: deps.workspaceRoot }),
  ]);
  const connectors = discovered.connectors;
  const fill = buildFillContract(connectors, {
    ticketHost: config.ticketHost,
    sectionOrder: config.sectionOrder,
    sectionsOff: config.sectionsOff,
    ...(connectorCovers(connectors, "slack")
      ? {
          slack: {
            channelIds: config.slackTrackChannelIds,
            mentionWindowHours: config.mentionWindowHours,
            mentionLimit: config.mentionLimit,
            trackedMessageLimit: config.trackedMessageLimit,
          },
        }
      : {}),
  });

  const suggestedFocus = suggestFocus(jobs, git);
  const configureHint = config.hints
    ? "Say \u201cconfigure Dispatch\u201d to change section order, Slack channels, or the tickets host (Linear vs Jira)."
    : undefined;

  const message = formatBriefing({
    git,
    jobs,
    memories,
    suggestedFocus,
    fill,
    config,
    now,
    ...(configureHint ? { configureHint } : {}),
  });

  return {
    message,
    generatedAt: now.toISOString(),
    git,
    jobs,
    memories,
    suggestedFocus,
    connectors: connectors.map((row) => ({
      ...row,
      hosts: [...row.hosts],
      skills: [...row.skills],
    })),
    fill: {
      requests: fill.requests.map((row) => ({
        ...row,
        connectors: [...row.connectors],
      })),
      unfillable: [...fill.unfillable],
    },
    ...(configureHint ? { configureHint } : {}),
  };
}

/**
 * What to do next, from what Prism can see on its own.
 *
 * The ticket and PR branches are gone with the drivers (ADR-0049): Prism no
 * longer fetches either, and guessing a focus from a section the host has not
 * filled yet would be inventing one. The host agent, which *does* have that
 * data, can override this once it fills the contract.
 */
function suggestFocus(jobs: readonly JobRecord[], git: GitSnapshot): string {
  const leftover = jobs.find(
    (job) =>
      job.status === "waiting_on_you" ||
      job.status === "running" ||
      job.status === "paused",
  );
  if (leftover) {
    if (leftover.lastActivity && leftover.status === "running") {
      return `Continue ${jobRef(leftover)}: ${leftover.lastActivity}`;
    }
    return leftoverFocusSpeak(leftover);
  }
  const justFinished = jobs.find(
    (job) =>
      (job.status === "done" || job.status === "error") &&
      isRecent(job.updatedAt, 48) &&
      Boolean(job.resultSummary || job.errorMessage),
  );
  if (justFinished?.status === "done" && justFinished.resultSummary) {
    return `${jobRef(justFinished)} finished: ${justFinished.resultSummary}`;
  }
  if (justFinished?.errorMessage) {
    return `${jobRef(justFinished)} failed: ${justFinished.errorMessage}`;
  }
  if (git.dirtyCount > 0) {
    return `Finish the ${git.dirtyCount} uncommitted change${git.dirtyCount === 1 ? "" : "s"} on ${git.branch}`;
  }
  return "Pick one ticket or say “start working on …” with a PRD.";
}

export function formatBriefing(input: {
  readonly git: GitSnapshot;
  readonly jobs: readonly JobRecord[];
  readonly memories: readonly MemoryItem[];
  readonly suggestedFocus: string;
  readonly fill: FillContract;
  readonly configureHint?: string;
  readonly config: DispatchConfig;
  readonly now?: Date;
}): string {
  const now = input.now ?? new Date();
  const leftover = input.jobs.filter(
    (job) =>
      job.status !== "done" &&
      job.status !== "cancelled" &&
      job.status !== "error",
  );
  const finished = input.jobs.filter(
    (job) =>
      (job.status === "done" || job.status === "error") &&
      isRecent(job.updatedAt, 48, now.getTime()),
  );
  const lines: string[] = [
    greetingLine(now, standupName(input.git)),
    "",
    "Here's your standup.",
    "",
  ];
  // Template and standing preferences are one note for the presenting
  // agent. They shape presentation, never content (M-066 P-P9).
  const standupNotes = standupNotesText(input.config).trim();
  if (standupNotes) {
    lines.push(standupNotes, "");
  }

  lines.push("## Yesterday");
  const yesterdayLines = yesterdaySection(input.git, finished, input.config);
  if (yesterdayLines.length === 0) {
    lines.push("- Nothing recorded since yesterday.");
  } else {
    lines.push(...yesterdayLines);
  }
  lines.push("");

  // Only "This repo" is Prism's to write. The connector-backed subsections
  // are named in the fill contract below and written by the host agent, which
  // is the one holding the credentials (ADR-0049).
  const showJobs = isSectionOn(input.config, "jobs");
  const showGit = isSectionOn(input.config, "git");
  if (showJobs || showGit) {
    lines.push("## Waiting on you");
    lines.push("### This repo");
    if (showJobs) {
      if (leftover.length === 0) {
        lines.push("- No leftover Dispatch jobs.");
      } else {
        for (const job of leftover) {
          lines.push(
            `- ${jobRef(job)} — ${statusPhrase(job.status)}${
              job.lastActivity && job.status === "running"
                ? ` · ${job.lastActivity}`
                : job.nextStep &&
                    !/worker running|agent booting|cursor-auth|worker-auth|CURSOR_API_KEY/i.test(
                      job.nextStep,
                    )
                  ? ` · ${job.nextStep}`
                  : ""
            }`,
          );
        }
      }
    }
    if (showGit) {
      lines.push(
        `- Git: \`${input.git.branch}\`${input.git.dirtyCount ? ` · ${String(input.git.dirtyCount)} uncommitted` : " · clean"}`,
      );
      if (input.git.error) lines.push(`- Git note: ${input.git.error}`);
    }
  }
  if (isSectionOn(input.config, "memories") && input.memories.length > 0) {
    lines.push("### Notes");
    for (const memory of input.memories.slice(0, 8)) {
      lines.push(`- (${memory.scope}) ${memory.text}`);
    }
  }
  lines.push("");

  if (isSectionOn(input.config, "focus")) {
    lines.push(`**Suggested focus:** ${briefFocus(input.suggestedFocus)}`);
  }

  const contract = formatFillContract(input.fill);
  if (contract) lines.push("", contract);

  if (input.configureHint) {
    lines.push("", "## Configure", `- ${input.configureHint}`);
  }

  return lines.join("\n");
}

function greetingLine(now: Date, name: string | undefined): string {
  const hour = now.getHours();
  const when =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return name ? `${when}, ${name}.` : `${when}.`;
}

function standupName(git: GitSnapshot): string | undefined {
  // git config is the only name Prism still knows: the connector viewer names
  // went with the drivers. An unset user.name means no greeting name, which is
  // better than guessing one.
  const raw = git.userName?.trim();
  if (!raw) return undefined;
  return raw.split(/\s+/)[0];
}

function yesterdaySection(
  git: GitSnapshot,
  finished: readonly JobRecord[],
  config: DispatchConfig,
): string[] {
  const lines: string[] = [];
  const commits = git.sinceYesterday ?? [];
  if (isSectionOn(config, "git") && commits.length > 0) {
    lines.push("### Git");
    for (const commit of commits.slice(0, 8)) {
      lines.push(`- ${commit}`);
    }
  }
  if (isSectionOn(config, "jobs") && finished.length > 0) {
    lines.push("### Dispatch");
    for (const job of finished) {
      const detail =
        job.status === "error"
          ? job.errorMessage || "The teammate hit an error."
          : job.resultSummary || "Wrapped up.";
      lines.push(`- ${jobRef(job)} — ${briefFocus(detail)}`);
    }
  }
  return lines;
}

function briefFocus(text: string): string {
  const first = text.split("\n")[0]?.trim() || text.trim();
  if (first.length <= 220) return first;
  return `${first.slice(0, 217)}…`;
}

function isRecent(iso: string, hours: number, now = Date.now()): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return now - t < hours * 60 * 60 * 1000;
}
