/**
 * How each 1.x changelog bullet reads after Prism 2.0, as reviewed in the v7 design.
 * One letter per bullet, in CHANGELOG.md order (sections flattened):
 * r = the thing no longer exists, c = it mentions parts that were removed or reworked,
 * - = still true. Releases with nothing tagged are left out.
 */
export const LEGACY_TAGS: Readonly<Record<string, string>> = {
  "1.12.0": "c----r-r--rrrrrrc--",
  "1.11.1": "rrrrrr-",
  "1.11.0": "rrrrrrrrrrrrrrrr-",
  "1.10.0": "rrrrrr---",
  "1.9.0": "rrrrrrr",
  "1.8.2": "rr",
  "1.8.1": "rr",
  "1.8.0": "rrrrrr-",
  "1.1.17": "rrr---rr",
  "1.1.16": "rr",
  "1.1.15": "rrrr",
  "1.1.14": "rrrr",
  "1.1.13": "rrrr",
  "1.1.12": "rrr",
  "1.1.11": "rr",
  "1.1.10": "rr",
  "1.1.9": "rrr",
  "1.1.7": "r-",
  "1.1.6": "r",
  "1.1.5": "r",
  "1.1.4": "r",
  "1.1.3": "r",
  "1.1.2": "r",
  "1.1.1": "crr-",
  "1.1.0": "---r",
  "1.0.5": "-c-",
  "1.0.4": "-r-",
  "1.0.0": "r--r---r",
};

export type LegacyTag = "removed" | "changed";

/** The 2.0 status of bullet `index` (counted across all sections) in a 1.x release. */
export function legacyTag(
  version: string,
  index: number,
): LegacyTag | undefined {
  const letter = LEGACY_TAGS[version]?.[index];
  if (letter === "r") return "removed";
  if (letter === "c") return "changed";
  return undefined;
}
