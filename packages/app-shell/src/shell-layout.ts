import { isBrowserShell } from "./is-browser.js";

/**
 * Extension / IDE webviews are often a narrow secondary sidebar (~300–400px).
 * Use the hover-expand rail there; keep the full sidenav in the browser shell.
 */
export function shellNavVariant(): "full" | "rail" {
  return isBrowserShell() ? "full" : "rail";
}

/** Root class for screen shells (`ov` + optional `ov--rail`). */
export function shellRootClass(
  ...extras: Array<string | false | null | undefined>
): string {
  const rail = shellNavVariant() === "rail";
  return ["ov", rail ? "ov--rail" : null, ...extras]
    .filter((c): c is string => Boolean(c))
    .join(" ");
}
