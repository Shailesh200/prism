import { jobDisplayLabel, type JobSummary } from "@repo-prism/app-shell";

export type JobLineageNode = {
  readonly job: JobSummary;
  readonly children: readonly JobLineageNode[];
};

export function jobsRelatedTo(
  jobs: readonly JobSummary[],
  focus: JobSummary,
): readonly JobSummary[] {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const related = new Set<string>([focus.id]);
  let cursor: JobSummary | undefined = focus;
  const seenUp = new Set<string>([focus.id]);
  while (cursor?.parentJobId) {
    if (seenUp.has(cursor.parentJobId)) break;
    related.add(cursor.parentJobId);
    seenUp.add(cursor.parentJobId);
    cursor = byId.get(cursor.parentJobId);
    if (!cursor) break;
  }
  const walkDown = (id: string): void => {
    for (const job of jobs) {
      if (job.parentJobId === id && !related.has(job.id)) {
        related.add(job.id);
        walkDown(job.id);
      }
    }
  };
  for (const id of related) walkDown(id);
  return jobs.filter((job) => related.has(job.id));
}

export function lineageRoot(
  jobs: readonly JobSummary[],
  focus: JobSummary,
): JobSummary {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  let cursor = focus;
  const seen = new Set<string>([focus.id]);
  while (cursor.parentJobId && !seen.has(cursor.parentJobId)) {
    const parent = byId.get(cursor.parentJobId);
    if (!parent) break;
    seen.add(parent.id);
    cursor = parent;
  }
  return cursor;
}

export function lineageTree(
  jobs: readonly JobSummary[],
  root: JobSummary,
): JobLineageNode {
  const related = jobsRelatedTo(jobs, root);
  const childrenOf = (id: string): JobLineageNode[] =>
    related
      .filter((job) => job.parentJobId === id)
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
      .map((job) => ({ job, children: childrenOf(job.id) }));
  return { job: root, children: childrenOf(root.id) };
}

export function lineageSummary(job: JobSummary): string {
  return `${job.title} · ${jobDisplayLabel(job)}`;
}
