/**
 * Surface CWV helpers: display vocabulary + re-exports of Node-free parse from
 * `@repo-prism/intelligence/cwv` (same metric/insight path as Core lab).
 */

import type { CwvMetric, CwvRating, JsonValue } from "@repo-prism/shared";
import { CwvRouteLabProgressDetailSchema } from "@repo-prism/shared";
import type { LighthouseLabProgressEvent } from "./client.js";

export {
  cwvFieldReportFromPagespeedJson,
  cwvReportFromLighthouseJson,
  heuristicFrontendRoutes,
  metricsFromLighthouseJson,
  scoreRating,
} from "@repo-prism/intelligence/cwv";

export function formatCwvValue(m: CwvMetric): string {
  if (m.id === "CLS") return m.value.toFixed(3);
  if (m.unit === "ms") {
    if (m.value >= 1000) return `${(m.value / 1000).toFixed(2)}s`;
    return `${Math.round(m.value)}ms`;
  }
  return String(m.value);
}

export function ratingLabel(rating: CwvRating | undefined): string {
  if (rating === "good") return "Good";
  if (rating === "needs-improvement") return "Needs work";
  if (rating === "poor") return "Poor";
  return "No data";
}

/** Threshold → color class (defined in domain-extra.css). */
export function ratingClass(rating: CwvRating | undefined): string {
  if (rating === "good") return "dm-rating--good";
  if (rating === "needs-improvement") return "dm-rating--warn";
  if (rating === "poor") return "dm-rating--poor";
  return "dm-rating--na";
}

/** Lighthouse category display metadata (order + friendly labels + tips). */
export const LIGHTHOUSE_CATEGORIES: {
  id: string;
  label: string;
  desc: string;
}[] = [
  {
    id: "performance",
    label: "Performance",
    desc: "Lab performance score from Lighthouse audits (weighted CWV + timings).",
  },
  {
    id: "accessibility",
    label: "Accessibility",
    desc: "Automated accessibility checks (contrast, labels, roles). Not a full a11y audit.",
  },
  {
    id: "best-practices",
    label: "Best Practices",
    desc: "Security, correctness, and modern-web best-practice audits.",
  },
  {
    id: "seo",
    label: "SEO",
    desc: "Basic search-engine optimization checks (meta, crawlability, mobile).",
  },
];

/** Normalize host/job progress into the AppShell lab progress event shape. */
export function lighthouseProgressFromJobEvent(event: {
  readonly message: string;
  readonly detail?: JsonValue;
}): LighthouseLabProgressEvent {
  const parsed = CwvRouteLabProgressDetailSchema.safeParse(event.detail);
  if (!parsed.success) {
    return { message: event.message };
  }
  return {
    message: event.message,
    measuringRoute: parsed.data.measuringRoute,
    measuredRoutes: parsed.data.measuredRoutes,
    ...(parsed.data.report ? { report: parsed.data.report } : {}),
  };
}
