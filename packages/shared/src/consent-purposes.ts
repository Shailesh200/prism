import { z } from "zod";

/**
 * The catalogue of things Prism will not do until the user says so (ADR-0024,
 * M-036 Phase 1).
 *
 * Before M-036 there was one master "allow network integrations" toggle, and
 * it lived in browser `localStorage` — so a direct SDK, MCP or CLI caller was
 * bound by nothing at all. Worse, the Core gate accepted `consentGranted: true`
 * from the caller, and every host passed it unconditionally: the gate recorded
 * consent rather than requiring it.
 *
 * Purposes are deliberately coarse. Intelligence purposes describe analysis
 * extras; Dispatch purposes describe chat-native OAuth drivers (ADR-0035).
 * Splitting further would produce prompts nobody reads.
 */
export const CONSENT_PURPOSE_IDS = [
  "network.github",
  "network.github-user",
  "network.pagespeed",
  "network.package-install",
  "network.git-remote",
  "network.gravatar",
  "network.linear",
  "network.jira",
  "network.slack",
  "network.notion",
  "network.google-calendar",
  "run.local-build",
] as const;

export type ConsentPurposeId = (typeof CONSENT_PURPOSE_IDS)[number];

export const ConsentPurposeIdSchema = z.enum(CONSENT_PURPOSE_IDS);

/** `network.*` purposes send data off the machine; `run.*` execute local code. */
export type ConsentPurposeGroup = "network" | "run";

export type ConsentPurpose = {
  readonly id: ConsentPurposeId;
  readonly group: ConsentPurposeGroup;
  /** Short label for a toggle. */
  readonly title: string;
  /**
   * What will actually happen, in the second person, naming the host or the
   * command. A user reading only this line should be able to decide.
   */
  readonly detail: string;
  /** Where the request goes, or what gets executed. Shown next to the toggle. */
  readonly reaches: string;
};

export const CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  {
    id: "network.github",
    group: "network",
    title: "GitHub metadata",
    detail:
      "Prism will request workflow runs and pull request metadata for this repository's remote.",
    reaches: "api.github.com",
  },
  {
    id: "network.github-user",
    group: "network",
    title: "GitHub (your account)",
    detail:
      "Prism Dispatch will read pull requests, reviews, and notifications for the GitHub user you connect, using a token stored in the OS keychain.",
    reaches: "api.github.com",
  },
  {
    id: "network.linear",
    group: "network",
    title: "Linear tickets",
    detail:
      "Prism Dispatch will read issues assigned to you in Linear for start-my-day.",
    reaches: "api.linear.app",
  },
  {
    id: "network.jira",
    group: "network",
    title: "Jira tickets",
    detail:
      "Prism Dispatch will read unresolved issues assigned to you in Jira for start-my-day.",
    reaches: "api.atlassian.com",
  },
  {
    id: "network.slack",
    group: "network",
    title: "Slack mentions and tracked channels",
    detail:
      "Prism Dispatch will search Slack for messages that mention you and read recent messages from channels or groups you pick. It will not post, and it will not open your full DM inbox.",
    reaches: "slack.com",
  },
  {
    id: "network.notion",
    group: "network",
    title: "Notion",
    detail:
      "Prism Dispatch will search Notion pages you have shared with the connected integration.",
    reaches: "api.notion.com",
  },
  {
    id: "network.google-calendar",
    group: "network",
    title: "Google Calendar",
    detail:
      "Prism Dispatch will read today's events from your Google Calendar. Read-only.",
    reaches: "www.googleapis.com",
  },
  {
    id: "network.pagespeed",
    group: "network",
    title: "PageSpeed Insights",
    detail:
      "Prism will send a URL you choose to Google's PageSpeed API and read back the Core Web Vitals it measures.",
    reaches: "www.googleapis.com",
  },
  {
    id: "network.package-install",
    group: "network",
    title: "Install measurement tools",
    detail:
      "Prism will install Lighthouse from the npm registry into this workspace before measuring. This writes to node_modules and your lockfile.",
    reaches: "your configured npm registry",
  },
  {
    id: "network.git-remote",
    group: "network",
    title: "Contact the git remote",
    detail:
      "Prism will run `git fetch --prune` so branch and ahead/behind counts are current. This contacts whatever remote the repository is configured with, using your existing git credentials.",
    reaches: "this repository's git remote",
  },
  {
    id: "network.gravatar",
    group: "network",
    title: "Gravatar avatars",
    detail:
      "Prism will request contributor avatars from Gravatar, which reveals a hash of each committer's email address to a third party. Off by default: Prism draws avatars locally instead.",
    reaches: "gravatar.com",
  },
  {
    id: "run.local-build",
    group: "run",
    title: "Run this repository's build",
    detail:
      "Prism will run this repository's own build script to measure bundle weight. That script is code from the repository you opened, and it runs with your permissions.",
    reaches: "your shell",
  },
];

/** A purpose plus the decision so far. `decidedAt` is null when undecided. */
export type ConsentState = {
  readonly purpose: ConsentPurpose;
  readonly granted: boolean;
  readonly decidedAt: string | null;
};

const BY_ID = new Map<string, ConsentPurpose>(
  CONSENT_PURPOSES.map((purpose) => [purpose.id, purpose]),
);

export function isConsentPurposeId(value: string): value is ConsentPurposeId {
  return BY_ID.has(value);
}

/** `undefined` for an unknown id, so callers must decide what that means. */
export function consentPurpose(id: string): ConsentPurpose | undefined {
  return BY_ID.get(id);
}

/**
 * The line shown when something is refused. It names the purpose and what it
 * would do, because "consent required" alone tells a user nothing about what
 * they would be agreeing to.
 */
export function consentRequiredMessage(id: string): string {
  const purpose = consentPurpose(id);
  if (!purpose) return `Consent required for "${id}", which Prism cannot find.`;
  const where =
    purpose.group === "network"
      ? `Reaches ${purpose.reaches}.`
      : `Runs on ${purpose.reaches}.`;
  return `Consent required for "${purpose.id}". ${purpose.detail} ${where} Grant it in Settings, or call setConsent(${JSON.stringify(purpose.id)}, true).`;
}
