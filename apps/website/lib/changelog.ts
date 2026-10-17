export type ChangelogSection = {
  title: string;
  /** Prose under the heading, before the list. Paragraphs are separated by a blank line. */
  intro?: string;
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
    /\b(intelligence|codebase dna|blast radius|repository map|health score|prepare_change|prepare a change|house style|guard_session|work order|working set)\b/i.test(
      hay,
    )
  ) {
    tags.add("Intelligence");
  }

  return TAG_ORDER.filter((tag) => tags.has(tag));
}

/** The release the changelog page leads with (CHANGELOG.md's 2.0.0 section). */
export const SITE_CURRENT_RELEASE = {
  version: "2.0.0",
  summary: "Clarity, reliability and precision.",
} as const;

/**
 * Releases for the RSS feed: the current site release first, then the parsed
 * notes. A 2.0.0 heading in the file is not duplicated.
 */
export function feedReleases(markdown: string, limit = 20): ChangelogRelease[] {
  const parsed = parseChangelog(markdown);
  if (parsed.some((r) => r.version === SITE_CURRENT_RELEASE.version)) {
    return parsed.slice(0, limit);
  }
  const current: ChangelogRelease = {
    version: SITE_CURRENT_RELEASE.version,
    title: SITE_CURRENT_RELEASE.summary,
    body: "",
    bullets: [SITE_CURRENT_RELEASE.summary],
    sections: [],
  };
  return [current, ...parsed].slice(0, limit);
}

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const lines = markdown.split("\n");
  const releases: ChangelogRelease[] = [];
  let current: ChangelogRelease | null = null;
  let section: ChangelogSection | null = null;
  /** Lines of the paragraph currently being collected under a ### heading. */
  let prose: string[] = [];
  /** The previous non-blank line was a bullet or its continuation. */
  let openBullet = false;

  const flushProse = () => {
    if (!section || prose.length === 0) {
      prose = [];
      return;
    }
    const text = prose.join(" ").replace(/\s+/g, " ").trim();
    prose = [];
    if (!text) return;
    section.intro = section.intro ? `${section.intro}\n\n${text}` : text;
  };

  const pushSection = () => {
    flushProse();
    if (!current || !section) return;
    if (section.bullets.length > 0 || section.intro) {
      current.sections.push(section);
    }
    section = null;
    openBullet = false;
  };

  const appendBullet = (extra: string) => {
    if (!current || current.bullets.length === 0) return;
    const last = current.bullets.length - 1;
    current.bullets[last] = `${current.bullets[last]} ${extra}`;
    if (section && section.bullets.length > 0) {
      const sLast = section.bullets.length - 1;
      section.bullets[sLast] = `${section.bullets[sLast]} ${extra}`;
    }
  };

  for (const line of lines) {
    const heading = /^##\s+(\d+\.\d+\.\d+)(?:\s+[—–-]\s*(.+))?$/.exec(
      line.replace(/\r$/, ""),
    );
    if (heading) {
      pushSection();
      if (current) releases.push(current);
      current = {
        version: heading[1] ?? "",
        title: heading[2]?.trim() || undefined,
        body: "",
        bullets: [],
        sections: [],
      };
      openBullet = false;
      continue;
    }
    if (!current) continue;
    current.body += `${line}\n`;

    const sectionHeading = /^###\s+(.+)$/.exec(line);
    if (sectionHeading) {
      pushSection();
      section = { title: sectionHeading[1]?.trim() ?? "", bullets: [] };
      continue;
    }

    if (line.trim() === "") {
      flushProse();
      openBullet = false;
      continue;
    }

    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) {
      flushProse();
      const text = bullet[1] ?? "";
      current.bullets.push(text);
      if (section) section.bullets.push(text);
      openBullet = true;
      continue;
    }

    if (openBullet && /^[ \t]+\S/.test(line)) {
      appendBullet(line.trim());
      continue;
    }

    openBullet = false;
    if (section) prose.push(line.trim());
  }
  pushSection();
  if (current) releases.push(current);
  return releases;
}
