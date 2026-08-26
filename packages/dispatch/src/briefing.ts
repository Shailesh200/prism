import { isPurposeGranted } from "./consent.js";
import { loadConfig } from "./config.js";
import {
  connectCta,
  defaultHttpGet,
  fetchGithubUser,
  fetchGoogleCalendar,
  fetchJira,
  fetchLinear,
  fetchNotion,
  fetchSlack,
  type HttpGet,
} from "./drivers.js";
import { gitSnapshot, type GitRunner } from "./git.js";
import { loadJobs } from "./jobs.js";
import { loadMemories } from "./memory.js";
import { leftoverFocusSpeak, jobRef, statusPhrase } from "./job-voice.js";
import { loadToken } from "./tokens.js";
import {
  DRIVER_CONSENT,
  type DayBriefing,
  type DispatchConfig,
  type DriverId,
  type DriverSnapshot,
  type GitSnapshot,
  type JobRecord,
  type MemoryItem,
} from "./types.js";

export type BriefingDeps = {
  readonly workspaceRoot: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly git?: GitRunner;
  readonly http?: HttpGet;
  readonly now?: Date;
  readonly snapshots?: Partial<Record<DriverId, DriverSnapshot>>;
};

const DRIVER_ORDER: readonly DriverId[] = [
  "linear",
  "jira",
  "github",
  "slack",
  "notion",
  "google-calendar",
];

export async function buildDayBriefing(
  deps: BriefingDeps,
): Promise<DayBriefing> {
  const [config, git, jobs, memories] = await Promise.all([
    loadConfig(deps.workspaceRoot),
    gitSnapshot(deps.workspaceRoot, deps.git),
    loadJobs(deps.workspaceRoot),
    loadMemories(deps.workspaceRoot),
  ]);
  const driverIds = DRIVER_ORDER.filter((id) => {
    if (id === "linear" && config.ticketHost !== "linear") return false;
    if (id === "jira" && config.ticketHost !== "jira") return false;
    return true;
  });
  const drivers = await Promise.all(
    driverIds.map((id) => loadDriverSnapshot(id, config, deps)),
  );

  const connectCtas = drivers
    .filter((driver) => !driver.connected)
    .map((driver) => connectCta(driver.id));

  const suggestedFocus = suggestFocus(jobs, git, drivers);
  const configureHint = config.hints
    ? "Say “configure Dispatch” to change section order, Slack channels, or the tickets host (Linear vs Jira)."
    : undefined;

  const message = formatBriefing({
    git,
    jobs,
    drivers,
    memories,
    suggestedFocus,
    connectCtas,
    config,
    ...(configureHint ? { configureHint } : {}),
  });

  return {
    message,
    generatedAt: (deps.now ?? new Date()).toISOString(),
    git,
    jobs,
    drivers,
    memories,
    suggestedFocus,
    connectCtas,
    ...(configureHint ? { configureHint } : {}),
  };
}

async function loadDriverSnapshot(
  id: DriverId,
  config: DispatchConfig,
  deps: BriefingDeps,
): Promise<DriverSnapshot> {
  if (deps.snapshots?.[id]) return deps.snapshots[id];
  const purpose = DRIVER_CONSENT[id];
  const granted = await isPurposeGranted(deps.workspaceRoot, purpose);
  const token = await loadToken(deps.workspaceRoot, id);
  if (!granted || !token) {
    return { id, connected: false, available: true, items: [] };
  }
  const http = deps.http ?? defaultHttpGet;
  try {
    switch (id) {
      case "github":
        return await fetchGithubUser(token.accessToken, http);
      case "linear":
        return await fetchLinear(token.accessToken, http);
      case "jira":
        return await fetchJira(token.accessToken, token.extra?.cloudId, http);
      case "slack":
        return await fetchSlack(token.accessToken, config, http);
      case "notion":
        return await fetchNotion(token.accessToken, http);
      case "google-calendar":
        return await fetchGoogleCalendar(
          token.accessToken,
          deps.now ?? new Date(),
          http,
        );
    }
  } catch (cause) {
    return {
      id,
      connected: true,
      available: false,
      error: cause instanceof Error ? cause.message : String(cause),
      items: [],
    };
  }
}

function suggestFocus(
  jobs: readonly JobRecord[],
  git: GitSnapshot,
  drivers: readonly DriverSnapshot[],
): string {
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
  const ticket = drivers.find(
    (driver) => driver.id === "linear" || driver.id === "jira",
  )?.items[0];
  if (ticket) return `Start with ${ticket.title}`;
  const pr = drivers.find((driver) => driver.id === "github")?.items[0];
  if (pr) return `Review ${pr.title}`;
  if (git.dirtyCount > 0) {
    return `Finish the ${git.dirtyCount} uncommitted change${git.dirtyCount === 1 ? "" : "s"} on ${git.branch}`;
  }
  return "Pick one ticket or say “start working on …” with a PRD.";
}

export function formatBriefing(input: {
  readonly git: GitSnapshot;
  readonly jobs: readonly JobRecord[];
  readonly drivers: readonly DriverSnapshot[];
  readonly memories: readonly MemoryItem[];
  readonly suggestedFocus: string;
  readonly connectCtas: readonly string[];
  readonly configureHint?: string;
  readonly config: DispatchConfig;
}): string {
  const lines: string[] = ["# Start my day", ""];
  if (input.config.standupTemplate.trim()) {
    lines.push(input.config.standupTemplate.trim(), "");
  }

  const leftover = input.jobs.filter(
    (job) =>
      job.status !== "done" &&
      job.status !== "cancelled" &&
      job.status !== "error",
  );
  const finished = input.jobs.filter(
    (job) =>
      (job.status === "done" || job.status === "error") &&
      isRecent(job.updatedAt, 48),
  );
  if (finished.length > 0) {
    lines.push("## Just finished");
    for (const job of finished) {
      const detail =
        job.status === "error"
          ? job.errorMessage || "The teammate hit an error."
          : job.resultSummary || "Wrapped up.";
      lines.push(`- ${jobRef(job)} — ${detail}`);
    }
    lines.push("");
  }
  lines.push("## Live");
  if (leftover.length === 0) {
    lines.push("- No leftover Dispatch jobs.");
  } else {
    for (const job of leftover) {
      lines.push(
        `- ${jobRef(job)} — ${statusPhrase(job.status)}${
          job.lastActivity && job.status === "running"
            ? ` · ${job.lastActivity}`
            : job.nextStep &&
                !/worker running|agent booting|cursor-auth|CURSOR_API_KEY/i.test(
                  job.nextStep,
                )
              ? ` · ${job.nextStep}`
              : ""
        }`,
      );
    }
  }
  lines.push(
    `- Git: \`${input.git.branch}\`${input.git.dirtyCount ? ` · ${input.git.dirtyCount} dirty` : " · clean"}`,
  );
  if (input.git.error) lines.push(`- Git note: ${input.git.error}`);

  for (const driver of input.drivers) {
    if (!driver.connected) continue;
    if (driver.error) {
      lines.push(`- ${label(driver.id)}: connected, but ${driver.error}`);
      continue;
    }
    if (driver.items.length === 0) {
      lines.push(`- ${label(driver.id)}: nothing waiting.`);
      continue;
    }
    lines.push(`- ${label(driver.id)}:`);
    for (const item of driver.items.slice(0, 8)) {
      lines.push(`  - ${item.title}${item.detail ? ` (${item.detail})` : ""}`);
    }
  }

  if (input.memories.length > 0) {
    lines.push("- Memories in play:");
    for (const memory of input.memories.slice(0, 8)) {
      lines.push(`  - (${memory.scope}) ${memory.text}`);
    }
  }

  lines.push("", `**Suggested focus:** ${input.suggestedFocus}`);

  if (input.connectCtas.length > 0) {
    lines.push("", "## Available");
    for (const cta of input.connectCtas) lines.push(`- ${cta}`);
  }

  if (input.configureHint) {
    lines.push("", "## Configure", `- ${input.configureHint}`);
  }

  return lines.join("\n");
}

function isRecent(iso: string, hours: number, now = Date.now()): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return now - t < hours * 60 * 60 * 1000;
}

function label(id: DriverId): string {
  switch (id) {
    case "github":
      return "GitHub";
    case "linear":
      return "Linear";
    case "jira":
      return "Jira";
    case "slack":
      return "Slack";
    case "notion":
      return "Notion";
    case "google-calendar":
      return "Calendar";
  }
}
