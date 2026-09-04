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
