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
  const config = await loadConfig(deps.workspaceRoot);
  const git = await gitSnapshot(deps.workspaceRoot, deps.git);
  const jobs = await loadJobs(deps.workspaceRoot);
  const memories = await loadMemories(deps.workspaceRoot);
  const drivers: DriverSnapshot[] = [];
  for (const id of DRIVER_ORDER) {
    if (id === "linear" && config.ticketHost !== "linear") continue;
    if (id === "jira" && config.ticketHost !== "jira") continue;
    drivers.push(await loadDriverSnapshot(id, config, deps));
  }

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
    return leftover.nextStep
      ? `Continue ${leftover.id}: ${leftover.nextStep}`
      : `Continue leftover job ${leftover.id} (${leftover.title})`;
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
  lines.push("## Live");
  if (leftover.length === 0) {
    lines.push("- No leftover Dispatch jobs.");
  } else {
    for (const job of leftover) {
      lines.push(
        `- ${job.id} · ${job.status} · ${job.title}${job.nextStep ? ` · next: ${job.nextStep}` : ""}`,
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
