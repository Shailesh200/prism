import type { HostConnector } from "./host-connectors.js";
import type { BriefingSectionId } from "./types.js";

/**
 * What the host agent should fetch, and with what (ADR-0049).
 *
 * Prism used to fetch a briefing's Linear, Slack and Calendar sections itself
 * over its own OAuth. It now supplies only the local spine — git, jobs,
 * memories — and hands back a contract: here are the sections, here is which
 * of *your* connectors fills each one.
 *
 * This inverts who holds the credential. Prism never sees a token because the
 * call happens in the host, under the grant the user already made in their
 * editor. See ADR-0049 for why that is not what ADR-0036 rejected.
 */

export type FillSectionId =
  | "tickets"
  | "reviews"
  | "messages"
  | "calendar"
  | "docs";

export type FillRequest = {
  readonly section: FillSectionId;
  /** The heading to put this under. */
  readonly heading: string;
  /** What to ask the connector for, in plain words. */
  readonly ask: string;
  /**
   * Connectors on this machine that could answer. Empty means the section
   * cannot be filled — which is stated, not silently dropped.
   */
  readonly connectors: readonly string[];
};

export type FillContract = {
  readonly requests: readonly FillRequest[];
  /** Sections with no connector behind them, named so the gap is visible. */
  readonly unfillable: readonly FillSectionId[];
};

/**
 * Which connector ids can serve which section.
 *
 * Deliberately a plain table rather than something inferred from a plugin's
 * description: guessing that "Sentry" is a ticket tracker because its blurb
 * says "issues" produces a briefing section quietly filled from the wrong
 * place, which is worse than an empty one.
 */
const SECTION_SOURCES: Record<FillSectionId, readonly string[]> = {
  tickets: ["linear", "jira", "shortcut", "asana", "notion-workspace"],
  reviews: ["github", "gitlab", "bitbucket"],
  messages: ["slack", "discord", "microsoft-teams"],
  calendar: ["google-calendar", "outlook", "calendar"],
  docs: ["notion-workspace", "notion", "confluence"],
};

const SECTION_COPY: Record<FillSectionId, { heading: string; ask: string }> = {
  tickets: {
    heading: "Tickets",
    ask: "Issues assigned to me that are open or in progress, newest first. Title and status only.",
  },
  reviews: {
    heading: "Reviews",
    ask: "Pull requests waiting on my review, and my own open PRs with failing checks or requested changes.",
  },
  messages: {
    heading: "Messages",
    ask: "Direct mentions and unread threads from the last day that look like they need an answer.",
  },
  calendar: {
    heading: "Calendar",
    ask: "Events on my calendar today, with start times.",
  },
  docs: {
    heading: "Docs",
    ask: "Pages assigned to me or edited by my team in the last day.",
  },
};

const BRIEFING_TO_FILL: Partial<Record<BriefingSectionId, FillSectionId>> = {
  tickets: "tickets",
  github: "reviews",
  slack: "messages",
  notion: "docs",
  calendar: "calendar",
};

export type SlackFillHints = {
  readonly channelIds: readonly string[];
  readonly mentionWindowHours: number;
  readonly mentionLimit: number;
  readonly trackedMessageLimit: number;
};

/**
 * Standup fill sections the user left on, in the order they chose.
 *
 * Vendor sections that are off must not appear in the contract — that is how
 * a Dispatch Settings toggle becomes a real change instead of a stored no-op.
 */
export function fillSectionsFromConfig(options: {
  readonly sectionOrder?: readonly BriefingSectionId[];
  readonly sectionsOff?: readonly string[];
}): FillSectionId[] {
  const off = new Set(options.sectionsOff ?? []);
  const order = options.sectionOrder ?? [
    "tickets",
    "github",
    "slack",
    "notion",
    "calendar",
  ];
  const out: FillSectionId[] = [];
  for (const id of order) {
    const fill = BRIEFING_TO_FILL[id];
    if (!fill || off.has(id) || out.includes(fill)) continue;
    out.push(fill);
  }
  return out;
}

function matchingConnectorIds(
  connectors: readonly HostConnector[],
  sources: readonly string[],
): string[] {
  const hits: string[] = [];
  for (const row of connectors) {
    const hay = `${row.id} ${row.label}`.toLowerCase();
    if (sources.some((src) => hay.includes(src.toLowerCase()))) {
      hits.push(row.id);
    }
  }
  return hits;
}

function messagesAsk(slack?: SlackFillHints): string {
  if (!slack) return SECTION_COPY.messages.ask;
  const window =
    slack.mentionWindowHours === 24
      ? "the last day"
      : `the last ${String(slack.mentionWindowHours)} hour${slack.mentionWindowHours === 1 ? "" : "s"}`;
  let ask = `Direct mentions and unread threads from ${window}, at most ${String(slack.mentionLimit)}.`;
  if (slack.channelIds.length > 0) {
    ask += ` Track Slack channels ${slack.channelIds.join(", ")} (up to ${String(slack.trackedMessageLimit)} messages).`;
  }
  return ask;
}

/**
 * Build the contract from what the host actually has.
 *
 * A section with no connector is reported in `unfillable` rather than dropped,
 * because "you have no ticket tracker connected" is useful and a silently
 * missing Tickets heading is not.
 */
export function buildFillContract(
  connectors: readonly HostConnector[],
  options: {
    readonly sections?: readonly FillSectionId[];
    readonly sectionOrder?: readonly BriefingSectionId[];
    readonly sectionsOff?: readonly string[];
    /**
     * The tracker this repo actually uses. Without it a shop running Jira gets
     * asked about Linear too, purely because the plugin happens to be
     * installed for another project.
     */
    readonly ticketHost?: string;
    readonly slack?: SlackFillHints;
  } = {},
): FillContract {
  const sections =
    options.sections ??
    (options.sectionOrder || options.sectionsOff
      ? fillSectionsFromConfig(options)
      : ["tickets", "reviews", "messages", "calendar"]);
  const requests: FillRequest[] = [];
  const unfillable: FillSectionId[] = [];

  for (const section of sections) {
    const sources =
      section === "tickets" && options.ticketHost
        ? SECTION_SOURCES.tickets.filter((id) => id === options.ticketHost)
        : SECTION_SOURCES[section];
    const matches = matchingConnectorIds(connectors, sources);
    if (matches.length === 0) {
      unfillable.push(section);
      continue;
    }
    const copy = SECTION_COPY[section];
    requests.push({
      section,
      heading: copy.heading,
      ask: section === "messages" ? messagesAsk(options.slack) : copy.ask,
      connectors: matches,
    });
  }

  return { requests, unfillable };
}

/**
 * The contract as instructions the host agent reads.
 *
 * Written as an addressed instruction rather than a data dump because the
 * consumer is a language model deciding what to do next, and "call your Linear
 * tools" is actionable where a JSON blob is something to summarise.
 */
export function formatFillContract(contract: FillContract): string {
  if (contract.requests.length === 0 && contract.unfillable.length === 0) {
    return "";
  }
  const lines: string[] = [];
  if (contract.requests.length > 0) {
    lines.push(
      "## Fill these from your own connectors",
      "",
      "Prism does not hold credentials for these — you do. Call the tools you",
      "already have, then present the sections below inside the standup above,",
      "under **Waiting on you**. Keep each to a few lines.",
      "",
    );
    for (const request of contract.requests) {
      lines.push(
        `- **${request.heading}** — via ${request.connectors.join(" or ")}. ${request.ask}`,
      );
    }
  }
  if (contract.unfillable.length > 0) {
    lines.push(
      "",
      `_No connector for: ${contract.unfillable.join(", ")}. Install one in your editor to see these._`,
    );
  }
  return lines.join("\n");
}
