import type { ConsoleStatus } from "@repo-prism/shared";

function tokenFromUrl(href: string | undefined): string {
  if (!href) return "";
  try {
    return new URL(href).searchParams.get("token") ?? "";
  } catch {
    return "";
  }
}

/**
 * HTTP dashboards (playground) always use same-origin `/api/*`.
 * The IDE webview still needs the hub URL from consoleStatus.
 */
export function dashboardLink(status: ConsoleStatus | undefined):
  | {
      readonly base: string;
      readonly token: string;
    }
  | undefined {
  const statusUrl = status?.console?.url;
  const onHttpDashboard =
    typeof window !== "undefined" &&
    (window.location.protocol === "http:" ||
      window.location.protocol === "https:");
  if (onHttpDashboard) {
    return {
      base: "",
      token: tokenFromUrl(statusUrl) || tokenFromUrl(window.location.href),
    };
  }
  if (!statusUrl) return undefined;
  const parsed = new URL(statusUrl);
  return {
    base: `${parsed.protocol}//${parsed.host}`,
    token: parsed.searchParams.get("token") ?? "",
  };
}
