export type ChangelogRelease = {
  version: string;
  body: string;
  bullets: string[];
};

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const lines = markdown.split("\n");
  const releases: ChangelogRelease[] = [];
  let current: ChangelogRelease | null = null;

  for (const line of lines) {
    const heading = /^##\s+(\d+\.\d+\.\d+)\s*$/.exec(line);
    if (heading) {
      if (current) releases.push(current);
      current = { version: heading[1], body: "", bullets: [] };
      continue;
    }
    if (!current) continue;
    current.body += `${line}\n`;
    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) current.bullets.push(bullet[1]);
  }
  if (current) releases.push(current);
  return releases;
}
