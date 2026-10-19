import { CHANGELOG_REVALIDATE_SECONDS } from "@/lib/changelog-pages";

/**
 * Where a version's publish time comes from. The current packages win, then
 * the 1.x server, then the early CLI. `created` and `modified` are not versions.
 */
export const PUBLISH_TIME_PACKAGES = [
  "@prismapp/cli",
  "@repo-prism/mcp-server",
  "@repo-prism/cli",
] as const;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function registryTimeUrl(name: string): string {
  return `https://registry.npmjs.org/${name}`;
}

/** npm's `time` map, first package wins, as ISO strings. */
export function collectPublishTimes(
  packs: Array<Record<string, string> | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const time of packs) {
    if (!time) continue;
    for (const [version, stamp] of Object.entries(time)) {
      if (version === "created" || version === "modified" || out[version]) {
        continue;
      }
      const date = new Date(stamp);
      if (Number.isNaN(date.getTime())) continue;
      out[version] = date.toISOString();
    }
  }
  return out;
}

/** `18 Oct 2026, 18:26 UTC`. UTC so the page does not depend on the server zone. */
export function formatPublished(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hour}:${minute} UTC`;
}

/** Publish time of each version npm has shipped. Missing or offline is an empty map. */
export async function publishedTimes(
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, string>> {
  const packs = await Promise.all(
    PUBLISH_TIME_PACKAGES.map(async (name) => {
      try {
        const res = await fetchImpl(registryTimeUrl(name), {
          signal: AbortSignal.timeout(4000),
          next: { revalidate: CHANGELOG_REVALIDATE_SECONDS },
        });
        if (!res.ok) return undefined;
        const body = (await res.json()) as { time?: Record<string, string> };
        return body.time;
      } catch {
        return undefined;
      }
    }),
  );
  return collectPublishTimes(packs);
}
