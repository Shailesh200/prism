import type { DispatchConfig, DriverId, DriverSnapshot } from "./types.js";

export const DRIVER_LABELS: Record<DriverId, string> = {
  github: "GitHub",
  linear: "Linear",
  jira: "Jira",
  slack: "Slack",
  notion: "Notion",
  "google-calendar": "Google Calendar",
};

export function connectCta(id: DriverId): string {
  return `Say “connect ${DRIVER_LABELS[id]}” to add it to start-my-day.`;
}

export type HttpGet = (
  url: string,
  headers: Record<string, string>,
) => Promise<{ ok: boolean; status: number; json: unknown; text: string }>;

export const DRIVER_HTTP_TIMEOUT_MS = 8_000;

export const defaultHttpGet: HttpGet = async (url, headers) => {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(DRIVER_HTTP_TIMEOUT_MS),
  });
  const text = await response.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { ok: response.ok, status: response.status, json, text };
};

export async function fetchGithubUser(
  token: string,
  http: HttpGet,
): Promise<DriverSnapshot> {
  const user = await http("https://api.github.com/user", {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "prism-dispatch",
  });
  if (!user.ok) {
    return {
      id: "github",
      connected: true,
      available: false,
      error: `GitHub ${user.status}`,
      items: [],
    };
  }
  const login =
    user.json && typeof user.json === "object" && "login" in user.json
      ? String((user.json as { login: unknown }).login)
      : "me";
  const search = await http(
    `https://api.github.com/search/issues?q=${encodeURIComponent(`is:pr is:open review-requested:${login}`)}&per_page=10`,
    {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "prism-dispatch",
    },
  );
  const items: DriverSnapshot["items"] = [];
  if (search.ok && search.json && typeof search.json === "object") {
    const payload = search.json as {
      items?: { title?: string; html_url?: string; repository_url?: string }[];
    };
    for (const issue of payload.items ?? []) {
      items.push({
        id: issue.html_url ?? issue.title ?? "pr",
        title: issue.title ?? "Pull request",
        ...(issue.html_url ? { url: issue.html_url } : {}),
        detail: "review requested",
      });
    }
  }
  return { id: "github", connected: true, available: true, items };
}

export async function fetchLinear(
  token: string,
  _http: HttpGet,
): Promise<DriverSnapshot> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `{ viewer { assignedIssues(first: 10, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id identifier title url } } } }`,
    }),
  });
  const json = await response.json();
  if (!response.ok) {
    return {
      id: "linear",
      connected: true,
      available: false,
      error: `Linear ${response.status}`,
      items: [],
    };
  }
  return parseLinear(json);
}

function parseLinear(json: unknown): DriverSnapshot {
  const nodes =
    json &&
    typeof json === "object" &&
    "data" in json &&
    json.data &&
    typeof json.data === "object" &&
    "viewer" in json.data
      ? (
          json.data as {
            viewer?: {
              assignedIssues?: {
                nodes?: {
                  id: string;
                  identifier: string;
                  title: string;
                  url?: string;
                }[];
              };
            };
          }
        ).viewer?.assignedIssues?.nodes
      : undefined;
  return {
    id: "linear",
    connected: true,
    available: true,
    items: (nodes ?? []).map((node) => ({
      id: node.id,
      title: `${node.identifier} ${node.title}`,
      ...(node.url ? { url: node.url } : {}),
      detail: "assigned to you",
    })),
  };
}

export async function fetchJira(
  token: string,
  cloudId: string | undefined,
  http: HttpGet,
): Promise<DriverSnapshot> {
  let site = cloudId;
  if (!site) {
    const resources = await http(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      { Authorization: `Bearer ${token}`, Accept: "application/json" },
    );
    if (resources.ok && Array.isArray(resources.json)) {
      const first = resources.json[0] as { id?: string } | undefined;
      site = first?.id;
    }
  }
  if (!site) {
    return {
      id: "jira",
      connected: true,
      available: false,
      error: "No Jira site on this Atlassian account",
      items: [],
    };
  }
  const search = await http(
    `https://api.atlassian.com/ex/jira/${site}/rest/api/3/search/jql?jql=${encodeURIComponent("assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC")}&maxResults=10`,
    { Authorization: `Bearer ${token}`, Accept: "application/json" },
  );
  if (!search.ok) {
    return {
      id: "jira",
      connected: true,
      available: false,
      error: `Jira ${search.status}`,
      items: [],
    };
  }
  const issues =
    search.json && typeof search.json === "object" && "issues" in search.json
      ? (
          search.json as {
            issues?: { key: string; fields?: { summary?: string } }[];
          }
        ).issues
      : [];
  return {
    id: "jira",
    connected: true,
    available: true,
    items: (issues ?? []).map((issue) => ({
      id: issue.key,
      title: `${issue.key} ${issue.fields?.summary ?? ""}`.trim(),
      detail: "assigned to you",
    })),
  };
}

export async function fetchSlack(
  token: string,
  config: DispatchConfig,
  http: HttpGet,
): Promise<DriverSnapshot> {
  const oldest = Math.floor(
    Date.now() / 1000 - config.mentionWindowHours * 3600,
  );
  const mentions = await http(
    `https://slack.com/api/search.messages?query=${encodeURIComponent(`is:unreads OR @me`)}&count=${config.mentionLimit}&sort=timestamp`,
    { Authorization: `Bearer ${token}` },
  );
  const items: DriverSnapshot["items"] = [];
  const mentionJson = mentions.json as
    | {
        ok?: boolean;
        messages?: {
          matches?: {
            iid?: string;
            text?: string;
            permalink?: string;
            username?: string;
          }[];
        };
        error?: string;
      }
    | undefined;
  if (mentions.ok && mentionJson?.ok) {
    for (const match of (mentionJson.messages?.matches ?? []).slice(
      0,
      config.mentionLimit,
    )) {
      items.push({
        id: match.iid ?? match.permalink ?? "mention",
        title: (match.text ?? "").slice(0, 140) || "mention",
        ...(match.permalink ? { url: match.permalink } : {}),
        detail: `mention${match.username ? ` from ${match.username}` : ""}`,
      });
    }
  } else if (mentionJson?.error) {
    return {
      id: "slack",
      connected: true,
      available: false,
      error: mentionJson.error,
      items: [],
    };
  }

  for (const channel of config.slackTrackChannelIds.slice(0, 5)) {
    const history = await http(
      `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel)}&limit=${config.trackedMessageLimit}&oldest=${oldest}`,
      { Authorization: `Bearer ${token}` },
    );
    const hist = history.json as
      | {
          ok?: boolean;
          messages?: { ts?: string; text?: string; user?: string }[];
        }
      | undefined;
    if (!history.ok || !hist?.ok) continue;
    for (const message of (hist.messages ?? []).slice(
      0,
      config.trackedMessageLimit,
    )) {
      items.push({
        id: `${channel}:${message.ts ?? items.length}`,
        title: (message.text ?? "").slice(0, 140) || "(empty)",
        detail: `tracked ${channel}`,
      });
    }
  }

  return { id: "slack", connected: true, available: true, items };
}

export async function fetchNotion(
  token: string,
  _http: HttpGet,
): Promise<DriverSnapshot> {
  const response = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      page_size: 8,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    }),
    signal: AbortSignal.timeout(DRIVER_HTTP_TIMEOUT_MS),
  });
  if (!response.ok) {
    return {
      id: "notion",
      connected: true,
      available: false,
      error: `Notion ${response.status}`,
      items: [],
    };
  }
  const json = (await response.json()) as {
    results?: {
      id: string;
      url?: string;
      properties?: Record<string, { title?: { plain_text?: string }[] }>;
    }[];
  };
  return {
    id: "notion",
    connected: true,
    available: true,
    items: (json.results ?? []).slice(0, 8).map((page) => ({
      id: page.id,
      title:
        page.properties?.title?.title?.[0]?.plain_text ??
        page.properties?.Name?.title?.[0]?.plain_text ??
        "Notion page",
      ...(page.url ? { url: page.url } : {}),
      detail: "recent",
    })),
  };
}

export async function fetchGoogleCalendar(
  token: string,
  now: Date,
  http: HttpGet,
): Promise<DriverSnapshot> {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=12`;
  const response = await http(url, { Authorization: `Bearer ${token}` });
  if (!response.ok) {
    return {
      id: "google-calendar",
      connected: true,
      available: false,
      error: `Calendar ${response.status}`,
      items: [],
    };
  }
  const json = response.json as {
    items?: {
      id?: string;
      summary?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
    }[];
  };
  return {
    id: "google-calendar",
    connected: true,
    available: true,
    items: (json.items ?? []).map((event) => ({
      id: event.id ?? event.summary ?? "event",
      title: event.summary ?? "(no title)",
      ...(event.htmlLink ? { url: event.htmlLink } : {}),
      detail: event.start?.dateTime ?? event.start?.date ?? "today",
    })),
  };
}
