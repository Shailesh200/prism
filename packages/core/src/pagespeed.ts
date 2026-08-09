/**
 * Consent-gated PageSpeed Insights fetch (M-053 / ADR-0033).
 * API keys are per-call only — never logged.
 */

import { createConsentStore } from "@repo-prism/intelligence";

export type FetchPagespeedMetricsInput = {
  readonly workspaceRoot: string;
  readonly apiKey: string;
  readonly url: string;
};

/** Friendly message for a non-2xx PageSpeed Insights response. */
function describePagespeedStatus(status: number, body: string): string {
  const detail = body ? `: ${body.slice(0, 160)}` : "";
  if (status === 400) {
    return "PageSpeed rejected the request (400) — the API key may be invalid or malformed.";
  }
  if (status === 403) {
    return "PageSpeed returned 403 — the key may be restricted, or the PageSpeed Insights API isn't enabled for this project.";
  }
  if (status === 429) {
    return "PageSpeed returned 429 — rate limit reached. Try again shortly.";
  }
  return `PageSpeed ${status}${detail}`;
}

/** Friendly message for a thrown PageSpeed fetch error. */
function describePagespeedError(err: unknown): string {
  if (err instanceof TypeError) {
    return "Couldn't reach Google PageSpeed Insights (network request failed). Check your connection and that network.pagespeed consent is granted.";
  }
  return err instanceof Error ? err.message : String(err);
}

/** PageSpeed Insights v5 (opt-in; requires API key + network.pagespeed consent). */
export async function fetchPagespeedMetrics(
  input: FetchPagespeedMetricsInput,
): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  const gate = await createConsentStore({
    workspaceRoot: input.workspaceRoot,
  }).requireGranted("network.pagespeed");
  if (!gate.ok) return { ok: false, error: gate.error.message };

  const key = input.apiKey.trim();
  const target = input.url.trim();
  if (!key) return { ok: false, error: "PageSpeed API key missing" };
  if (!target) return { ok: false, error: "Enter a URL to analyze" };
  try {
    const endpoint = new URL(
      "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
    );
    endpoint.searchParams.set("url", target);
    endpoint.searchParams.set("key", key);
    endpoint.searchParams.set("category", "performance");
    endpoint.searchParams.set("strategy", "mobile");
    const res = await fetch(endpoint.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: describePagespeedStatus(res.status, body) };
    }
    return { ok: true, raw: await res.json() };
  } catch (err: unknown) {
    return { ok: false, error: describePagespeedError(err) };
  }
}
