/**
 * Anonymous usage ping to Pulse (Umami at pulse.shaileshjha.in).
 *
 * A CLI command or an MCP tool reports its name and whether it worked.
 * Nothing from the repository is included: no paths, prompts, source, or
 * error text. The request is not awaited past a short timeout, and a failure
 * is ignored. Set `PRISM_PULSE=0` to turn it off. Tests and CI do not send.
 */

const PULSE_ORIGIN = "https://pulse.shaileshjha.in";
const PULSE_WEBSITE_ID = "837be913-9493-45dc-8a1a-2483bc2b58e9";
const SEND_MS = 400;

export type UsageResult = "ok" | "findings" | "failed";

export type UsageReport = {
  readonly surface: "cli" | "mcp";
  /** Command or tool name. A value that is not a short name is dropped. */
  readonly name: string;
  readonly result: UsageResult;
  /** A `PRISM_*` code, when the call failed. Messages are never sent. */
  readonly code?: string;
  /** Install target, when it is one of the known hosts. */
  readonly client?: string;
  readonly ms?: number;
};

export function pulseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.PRISM_PULSE === "0") return false;
  if (env.VITEST || env.BUN_TEST || env.NODE_ENV === "test") return false;
  if (env.CI === "true" || env.GITHUB_ACTIONS === "true") return false;
  return true;
}

/** Keep a short name. Anything else (a path, a sentence) is not a metric. */
export function pulseName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = value.trim().slice(0, 40);
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(clean) ? clean : undefined;
}

export function usageEventName(
  report: UsageReport,
): "install" | "cli" | "tool" {
  if (report.surface === "mcp") return "tool";
  if (report.name === "install") return "install";
  return "cli";
}

/** The body Pulse stores. Exported so tests can see that paths never leave. */
export function usagePayload(report: UsageReport): {
  readonly name: "install" | "cli" | "tool";
  readonly url: string;
  readonly data: Record<string, string | number>;
} {
  const name = usageEventName(report);
  const called = pulseName(report.name);
  const data: Record<string, string | number> = { result: report.result };
  if (report.surface === "mcp") {
    if (called) data.tool = called;
  } else if (called) data.command = called;
  const client = pulseName(report.client);
  const code = pulseName(report.code);
  if (client) data.client = client;
  if (code?.startsWith("PRISM_")) data.code = code;
  if (typeof report.ms === "number" && Number.isFinite(report.ms)) {
    data.ms = Math.min(120_000, Math.max(0, Math.round(report.ms)));
  }
  const slug = called ?? "unknown";
  return {
    name,
    url: report.surface === "mcp" ? `/mcp/${slug}` : `/cli/${slug}`,
    data,
  };
}

export function reportUsage(
  report: UsageReport,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): void {
  if (!pulseEnabled(env)) return;
  const { name, url, data } = usagePayload(report);
  void postPulse(name, url, data, fetchImpl);
}

async function postPulse(
  name: string,
  url: string,
  data: Record<string, string | number>,
  fetchImpl: typeof fetch,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_MS);
  try {
    await fetchImpl(`${PULSE_ORIGIN}/api/send`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "user-agent": "prism",
      },
      body: JSON.stringify({
        type: "event",
        payload: {
          website: PULSE_WEBSITE_ID,
          hostname: "prismhq.in",
          url,
          name,
          data,
        },
      }),
    });
  } catch {
    // Pulse is optional. A down network never changes the command.
  } finally {
    clearTimeout(timer);
  }
}
