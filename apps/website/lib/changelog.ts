export type ChangelogSection = {
  title: string;
  bullets: string[];
};

export type ChangelogRelease = {
  version: string;
  title?: string;
  body: string;
  bullets: string[];
  sections: ChangelogSection[];
};

/** Archive filters on the magazine What’s new page (Stitch editorial). */
export const SHIP_FILTERS = [
  "All",
  "Dispatch",
  "Intelligence",
  "CLI",
  "MCP",
] as const;

export type ShipFilter = (typeof SHIP_FILTERS)[number];
export type ShipTag = Exclude<ShipFilter, "All">;

const TAG_ORDER: ShipTag[] = ["Dispatch", "Intelligence", "CLI", "MCP"];

export function stripMd(text: string): string {
  return text.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

/** One-line dek for a magazine archive row. */
export function releaseDek(release: ChangelogRelease): string {
  const raw =
    release.sections[0]?.bullets[0] ??
    release.bullets[0] ??
    release.title ??
    "";
  return stripMd(raw);
}

/**
 * Chips shown on a row: changelog subsections when present, otherwise tags.
 */
export function releaseChips(release: ChangelogRelease): string[] {
  const fromSections = release.sections.map((section) => section.title);
  if (fromSections.length > 0) return fromSections.slice(0, 3);
  return releaseTags(release);
}

/** Tags used by the archive filter. */
export function releaseTags(release: ChangelogRelease): ShipTag[] {
  const tags = new Set<ShipTag>();
  const hay = [
    release.title ?? "",
    ...release.sections.map((section) => section.title),
    ...release.bullets,
  ].join("\n");

  for (const section of release.sections) {
    const title = section.title.toLowerCase();
    if (title === "mcp") tags.add("MCP");
    if (title === "cli") tags.add("CLI");
    if (title === "ide" || title === "hub" || title === "console") {
      tags.add("Dispatch");
    }
  }

  if (/\*\*MCP:\*\*|\bstart_job\b/.test(hay)) tags.add("MCP");
  if (/\*\*CLI:\*\*|\bprism doctor\b/.test(hay)) tags.add("CLI");
  if (
    /\*\*Dispatch:\*\*|\*\*Hub:\*\*|\b(teammate|worktree|job console)\b/i.test(
      hay,
    )
  ) {
    tags.add("Dispatch");
  }
  if (
    /\b(intelligence|codebase dna|blast radius|repository map|health score)\b/i.test(
      hay,
    )
  ) {
    tags.add("Intelligence");
  }

  return TAG_ORDER.filter((tag) => tags.has(tag));
}

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const lines = markdown.split("\n");
  const releases: ChangelogRelease[] = [];
  let current: ChangelogRelease | null = null;
  let section: ChangelogSection | null = null;

  const pushSection = () => {
    if (!current || !section) return;
    if (section.bullets.length > 0) current.sections.push(section);
    section = null;
  };

  for (const line of lines) {
    const heading = /^##\s+(\d+\.\d+\.\d+)(?:\s+[—–-]\s*(.+))?$/.exec(line);
    if (heading) {
      pushSection();
      if (current) releases.push(current);
      current = {
        version: heading[1],
        title: heading[2]?.trim() || undefined,
        body: "",
        bullets: [],
        sections: [],
      };
      continue;
    }
    if (!current) continue;
    current.body += `${line}\n`;

    const sectionHeading = /^###\s+(.+)$/.exec(line);
    if (sectionHeading) {
      pushSection();
      section = { title: sectionHeading[1].trim(), bullets: [] };
      continue;
    }

    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) {
      const text = bullet[1];
      current.bullets.push(text);
      if (section) section.bullets.push(text);
    }
  }
  pushSection();
  if (current) releases.push(current);
  return releases;
}
