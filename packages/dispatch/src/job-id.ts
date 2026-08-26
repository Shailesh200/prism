const OPAQUE_JOB_ID = /^job-[0-9a-f]{8}$/i;
const TICKET = /\b([A-Z]{2,}-\d+)\b/;

export function ticketFromTitle(title: string): string | undefined {
  return title.match(TICKET)?.[1];
}

/** User-facing id: a ticket token, or a kebab slug from the title. Never `job-<hex>`. */
export function slugFromTitle(title: string): string {
  const ticket = ticketFromTitle(title);
  if (ticket) return ticket;
  const slug = title
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "task";
}

export function isOpaqueJobId(id: string): boolean {
  return OPAQUE_JOB_ID.test(id);
}

export function displayJobId(job: { id: string; title: string }): string {
  if (!isOpaqueJobId(job.id)) return job.id;
  return slugFromTitle(job.title);
}

export function allocateJobId(input: {
  readonly title: string;
  readonly explicit?: string;
  readonly taken: ReadonlySet<string>;
}): string {
  if (input.explicit?.trim()) return input.explicit.trim();
  const base = slugFromTitle(input.title);
  if (!isTaken(input.taken, base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!isTaken(input.taken, candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function isTaken(taken: ReadonlySet<string>, id: string): boolean {
  if (taken.has(id)) return true;
  const lower = id.toLowerCase();
  for (const existing of taken) {
    if (existing.toLowerCase() === lower) return true;
  }
  return false;
}

export function resolveJobRef<T extends { id: string; title: string }>(
  jobs: readonly T[],
  ref: string,
):
  | { readonly kind: "one"; readonly job: T }
  | { readonly kind: "many"; readonly jobs: T[] }
  | undefined {
  const needle = ref.trim();
  if (!needle) return undefined;
  const lower = needle.toLowerCase();
  const exact = jobs.find(
    (job) => job.id === needle || job.id.toLowerCase() === lower,
  );
  if (exact) return { kind: "one", job: exact };

  const byDisplay = jobs.filter(
    (job) => displayJobId(job).toLowerCase() === lower,
  );
  if (byDisplay.length === 1) return { kind: "one", job: byDisplay[0]! };
  if (byDisplay.length > 1) return { kind: "many", jobs: byDisplay };

  const byTitle = jobs.filter((job) => {
    const title = job.title.toLowerCase();
    return title === lower || title.includes(lower);
  });
  if (byTitle.length === 1) return { kind: "one", job: byTitle[0]! };
  if (byTitle.length > 1) return { kind: "many", jobs: byTitle };
  return undefined;
}
