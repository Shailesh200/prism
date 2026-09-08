/** Stages shown on the Skills generating chip (Stitch Title Integration). */
export type SkillGenerateStage =
  | "Thinking"
  | "Writing"
  | "Finalising"
  | "Done"
  | "Failed";

export function skillGenerateStage(job: {
  readonly status: string;
  readonly lastActivity?: string;
}): { readonly stage: SkillGenerateStage; readonly progress: number } {
  const status = job.status;
  const activity = (job.lastActivity ?? "").toLowerCase();
  if (status === "failed" || status === "cancelled") {
    return { stage: "Failed", progress: 1 };
  }
  if (status === "done") return { stage: "Done", progress: 1 };
  if (
    /check|verif|final|review/.test(activity) ||
    status === "needs_review" ||
    status === "ready"
  ) {
    return { stage: "Finalising", progress: 0.88 };
  }
  if (/edit|writ|file|using |finished /.test(activity)) {
    return { stage: "Writing", progress: 0.58 };
  }
  if (/think/.test(activity) || status === "queued" || status === "booting") {
    return { stage: "Thinking", progress: 0.22 };
  }
  if (status === "running") {
    return { stage: "Writing", progress: 0.58 };
  }
  return { stage: "Thinking", progress: 0.22 };
}

export function formatElapsed(
  fromIso: string | undefined,
  nowMs: number,
): string {
  if (!fromIso) return "0:00";
  const started = Date.parse(fromIso);
  if (!Number.isFinite(started)) return "0:00";
  const seconds = Math.max(0, Math.floor((nowMs - started) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function skillJobTitle(name: string): string {
  return `Skill: ${name.trim()}`;
}

export function isSkillGenerateJob(
  job: { readonly title: string; readonly status: string },
  skillName: string,
): boolean {
  const want = skillJobTitle(skillName).toLowerCase();
  if (!job.title.toLowerCase().startsWith(want)) return false;
  return (
    job.status === "queued" ||
    job.status === "booting" ||
    job.status === "running" ||
    job.status === "ready"
  );
}
