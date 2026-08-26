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
import {
  isDriverAuthFailure,
  renewDriverToken,
  tokenNeedsRefresh,
} from "./token-refresh.js";
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
  /** Injected in tests. Production uses global fetch for Prism Auth refresh. */
  readonly brokerFetch?: typeof fetch;
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
  const now = deps.now ?? new Date();
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
    now,
    ...(configureHint ? { configureHint } : {}),
  });

  return {
    message,
    generatedAt: now.toISOString(),
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
  let token = await loadToken(deps.workspaceRoot, id);
  if (!granted || !token) {
    return { id, connected: false, available: true, items: [] };
  }
  const now = deps.now ?? new Date();
  if (tokenNeedsRefresh(token, now.getTime())) {
    token =
      (await renewDriverToken({
        workspaceRoot: deps.workspaceRoot,
        driver: id,
        token,
        ...(deps.env ? { env: deps.env } : {}),
        ...(deps.brokerFetch ? { fetchImpl: deps.brokerFetch } : {}),
      })) ?? token;
  }
  const http = deps.http ?? defaultHttpGet;
  try {
    let snapshot = await fetchConnectedDriver(id, token, config, http, now);
    if (isDriverAuthFailure(snapshot.error) && token.refreshToken) {
      const renewed = await renewDriverToken({
        workspaceRoot: deps.workspaceRoot,
        driver: id,
        token,
        ...(deps.env ? { env: deps.env } : {}),
        ...(deps.brokerFetch ? { fetchImpl: deps.brokerFetch } : {}),
      });
      if (renewed) {
        snapshot = await fetchConnectedDriver(id, renewed, config, http, now);
      }
    }
    return snapshot;
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

async function fetchConnectedDriver(
  id: DriverId,
  token: { accessToken: string; extra?: Record<string, string> },
  config: DispatchConfig,
  http: HttpGet,
  now: Date,
): Promise<DriverSnapshot> {
  switch (id) {
    case "github":
      return fetchGithubUser(token.accessToken, http);
    case "linear":
      return fetchLinear(token.accessToken, http);
    case "jira":
      return fetchJira(token.accessToken, token.extra?.cloudId, http);
    case "slack":
      return fetchSlack(token.accessToken, config, http);
    case "notion":
      return fetchNotion(token.accessToken, http);
    case "google-calendar":
      return fetchGoogleCalendar(token.accessToken, now, http);
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
    greetingLine(now, standupName(input.drivers, input.git)),
    "",
    "Here's your standup.",
    "",
  ];
  if (input.config.standupTemplate.trim()) {
    lines.push(input.config.standupTemplate.trim(), "");
  }

  lines.push("## Yesterday");
  const yesterdayLines = yesterdaySection(input.git, finished, input.drivers);
  if (yesterdayLines.length === 0) {
    lines.push("- Nothing recorded since yesterday.");
  } else {
    lines.push(...yesterdayLines);
  }
  lines.push("");

  lines.push("## Waiting on you");
  for (const driver of input.drivers) {
    if (!driver.connected) continue;
    lines.push(`### ${label(driver.id)}`);
    if (driver.error) {
      lines.push(`- Connected, but ${driver.error}`);
      continue;
    }
    if (driver.items.length === 0) {
      lines.push(`- Nothing waiting.`);
      continue;
    }
    for (const item of driver.items.slice(0, 8)) {
      lines.push(itemLine(item));
    }
  }
  lines.push("### This repo");
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
    `- Git: \`${input.git.branch}\`${input.git.dirtyCount ? ` · ${String(input.git.dirtyCount)} uncommitted` : " · clean"}`,
  );
  if (input.git.error) lines.push(`- Git note: ${input.git.error}`);
  if (input.memories.length > 0) {
    lines.push("### Notes");
    for (const memory of input.memories.slice(0, 8)) {
      lines.push(`- (${memory.scope}) ${memory.text}`);
    }
  }
  lines.push("");

  lines.push(`**Suggested focus:** ${briefFocus(input.suggestedFocus)}`);

  if (input.connectCtas.length > 0) {
    lines.push("", "## Not connected yet");
    for (const cta of input.connectCtas) lines.push(`- ${cta}`);
  }

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

function standupName(
  drivers: readonly DriverSnapshot[],
  git: GitSnapshot,
): string | undefined {
  const fromDriver = drivers.find((driver) =>
    driver.viewerName?.trim(),
  )?.viewerName;
  const raw = fromDriver?.trim() || git.userName?.trim();
  if (!raw) return undefined;
  return raw.split(/\s+/)[0];
}

function yesterdaySection(
  git: GitSnapshot,
  finished: readonly JobRecord[],
  drivers: readonly DriverSnapshot[],
): string[] {
  const lines: string[] = [];
  const commits = git.sinceYesterday ?? [];
  if (commits.length > 0) {
    lines.push("### Git");
    for (const commit of commits.slice(0, 8)) {
      lines.push(`- ${commit}`);
    }
  }
  if (finished.length > 0) {
    lines.push("### Dispatch");
    for (const job of finished) {
      const detail =
        job.status === "error"
          ? job.errorMessage || "The teammate hit an error."
          : job.resultSummary || "Wrapped up.";
      lines.push(`- ${jobRef(job)} — ${briefFocus(detail)}`);
    }
  }
  for (const driver of drivers) {
    if (!driver.connected) continue;
    const done = driver.recentlyDone ?? [];
    if (done.length === 0) continue;
    lines.push(`### ${label(driver.id)}`);
    for (const item of done.slice(0, 8)) {
      lines.push(itemLine(item));
    }
  }
  return lines;
}

function itemLine(item: {
  title: string;
  detail?: string | undefined;
  url?: string | undefined;
}): string {
  const detail = item.detail ? ` (${item.detail})` : "";
  return `- ${item.title}${detail}`;
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
