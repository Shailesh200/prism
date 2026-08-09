/**
 * Shared Prism date/time formatting (M-062 P-D9).
 *
 * Prefer this over ad-hoc `toLocaleString` / duplicated relative-time helpers
 * so Overview, Trends, Settings, and audit surfaces read the same clock.
 */

/** Compact relative time like "3h ago" / "2d ago" from an ISO date. */
export function relativePrismTime(
  iso: string,
  now: number = Date.now(),
): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export type FormatPrismDateStyle = "relative" | "date" | "datetime" | "time";

/**
 * Format an ISO timestamp for Prism UI.
 *
 * - `relative` — "3h ago" (default)
 * - `date` — short locale date (e.g. "Aug 9, 2026")
 * - `datetime` — short locale date + time
 * - `time` — 24h locale time
 */
export function formatPrismDate(
  iso: string,
  style: FormatPrismDateStyle = "relative",
  now: number = Date.now(),
): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  if (style === "relative") return relativePrismTime(iso, now);
  if (style === "time") {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  if (style === "datetime") {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
