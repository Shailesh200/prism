import { JobRecordSchema, type JobRecord } from "./types.js";
import { jobsPath } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

type JobsFile = { jobs: JobRecord[] };

export async function loadJobs(workspaceRoot: string): Promise<JobRecord[]> {
  const file = await readJsonFile<JobsFile>(jobsPath(workspaceRoot), {
    jobs: [],
  });
  return (file.jobs ?? []).flatMap((job) => {
    const parsed = JobRecordSchema.safeParse(job);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function saveJobs(
  workspaceRoot: string,
  jobs: readonly JobRecord[],
): Promise<void> {
  await writeJsonFile(jobsPath(workspaceRoot), { jobs });
}

export async function upsertJob(
  workspaceRoot: string,
  job: JobRecord,
): Promise<JobRecord> {
  const jobs = await loadJobs(workspaceRoot);
  const next = [
    ...jobs.filter((item) => item.id !== job.id),
    { ...job, updatedAt: new Date().toISOString() },
  ];
  await saveJobs(workspaceRoot, next);
  return next.find((item) => item.id === job.id) ?? job;
}

export async function getJob(
  workspaceRoot: string,
  id: string,
): Promise<JobRecord | undefined> {
  const jobs = await loadJobs(workspaceRoot);
  return jobs.find(
    (job) => job.id === id || job.id.toLowerCase() === id.toLowerCase(),
  );
}

export function activeJobCount(jobs: readonly JobRecord[]): number {
  return jobs.filter(
    (job) =>
      job.status === "running" ||
      job.status === "booting" ||
      job.status === "ready" ||
      job.status === "waiting_on_you",
  ).length;
}
