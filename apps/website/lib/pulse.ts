/**
 * First-party Pulse (Umami at pulse.shaileshjha.in) for prismhq.in.
 *
 * Same loader and click contract as portfolio / writes. Page views come from
 * the script watching History — do not also track() on every route. No emails.
 */

export const PULSE_ORIGIN = "https://pulse.shaileshjha.in";

/** Umami website id — override with NEXT_PUBLIC_PULSE_WEBSITE_ID. */
export const PULSE_WEBSITE_ID =
  process.env.NEXT_PUBLIC_PULSE_WEBSITE_ID ??
  "837be913-9493-45dc-8a1a-2483bc2b58e9";

export const prismhqEvents = {
  ctaClick: "cta_click",
  navClick: "nav_click",
  installCopy: "install_copy",
  installOpen: "install_open",
} as const;

export type TrackProps = Record<string, string | number | boolean>;

export type TrackAttrs = {
  "data-track"?: string;
  "data-track-target"?: string;
};

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: TrackProps) => void;
      identify?: {
        (id: string, data?: TrackProps): void;
        (data: TrackProps): void;
      };
    };
  }
}

const SCRIPT_ATTR = "data-pulse-loaded";
const DEVICE_KEY = "pulse_did";
const DEVICE_MAX_AGE = 60 * 60 * 24 * 400;

export function pulseDomains(): string | undefined {
  const vercelEnv =
    process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV;
  if (process.env.NODE_ENV !== "production") {
    return "prismhq.in,www.prismhq.in,localhost,127.0.0.1";
  }
  if (vercelEnv && vercelEnv !== "production") return undefined;
  return "prismhq.in,www.prismhq.in";
}

export function track(name: string, data?: TrackProps): void {
  if (typeof window === "undefined") return;
  window.umami?.track(name, data);
}

export function trackProps(name: string, target?: string): TrackAttrs {
  return {
    "data-track": name,
    ...(target ? { "data-track-target": target } : {}),
  };
}

export function installCopyTarget(command: string): string | undefined {
  const text = command.trim();
  if (!text) return undefined;
  if (/mcp-server/i.test(text) || /mcpServers/i.test(text)) return "mcp";
  if (/mcp_servers/i.test(text) || /claude mcp add/i.test(text)) return "mcp";
  if (/@repo-prism\/cli|\bprism doctor\b|prism dna/i.test(text)) return "cli";
  if (
    /install-extension|prismhq\.repo-prism|open-vsx|marketplace\.visualstudio/i.test(
      text,
    )
  ) {
    return "ide";
  }
  if (/@repo-prism\/core/.test(text)) return "core";
  if (/git clone.*prism/i.test(text) || /bun run verify:milestone/.test(text)) {
    return "source";
  }
  return undefined;
}

export function installLinkAttrs(href: string | undefined): TrackAttrs {
  if (!href) return {};
  try {
    const url = new URL(href, "https://www.prismhq.in");
    if (url.protocol === "cursor:") {
      return trackProps(prismhqEvents.installOpen, "cursor");
    }
    if (url.protocol === "vscode:" || url.protocol === "vscode-insiders:") {
      return trackProps(prismhqEvents.installOpen, "vscode");
    }
    if (url.hostname === "marketplace.visualstudio.com") {
      return trackProps(prismhqEvents.installOpen, "marketplace");
    }
    if (url.hostname === "open-vsx.org") {
      return trackProps(prismhqEvents.installOpen, "openvsx");
    }
  } catch {
    if (href.startsWith("cursor://")) {
      return trackProps(prismhqEvents.installOpen, "cursor");
    }
    if (href.startsWith("vscode:") || href.startsWith("vscode-insiders:")) {
      return trackProps(prismhqEvents.installOpen, "vscode");
    }
  }
  return {};
}

function clip(value: string, max = 180): string {
  return value.length <= max ? value : value.slice(0, max);
}

function referrerHost(): string {
  try {
    if (!document.referrer) return "";
    return new URL(document.referrer).hostname;
  } catch {
    return "";
  }
}

function cookieDomain(): string {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "";
  const parts = host.split(".");
  if (parts.length < 2) return "";
  return `.${parts.slice(-2).join(".")}`;
}

function readCookie(name: string): string {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const value = part.trim();
    if (value.startsWith(prefix)) {
      return decodeURIComponent(value.slice(prefix.length));
    }
  }
  return "";
}

function writeCookie(name: string, value: string): void {
  const domain = cookieDomain();
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const scoped = domain ? `; Domain=${domain}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${DEVICE_MAX_AGE}; SameSite=Lax${scoped}${secure}`;
}

function mintId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function deviceId(): string {
  const fromCookie = readCookie(DEVICE_KEY);
  if (fromCookie) {
    try {
      window.localStorage.setItem(DEVICE_KEY, fromCookie);
    } catch {
      /* private mode */
    }
    return fromCookie;
  }
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored) {
      writeCookie(DEVICE_KEY, stored);
      return stored;
    }
  } catch {
    /* private mode */
  }
  const id = mintId();
  try {
    window.localStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* private mode */
  }
  writeCookie(DEVICE_KEY, id);
  return id;
}

type NetworkConnection = {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
};

function sessionMeta(): TrackProps {
  const nav = window.navigator;
  const url = new URL(window.location.href);
  const conn = (nav as Navigator & { connection?: NetworkConnection })
    .connection;
  const data: TrackProps = {};
  const put = (
    key: string,
    value: string | number | boolean | null | undefined,
  ) => {
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      value === false
    ) {
      return;
    }
    data[key] = typeof value === "string" ? clip(value) : value;
  };

  put("host", url.hostname);
  put("path", url.pathname);
  put("site", "prismhq");
  put("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
  put("locale", nav.language);
  put("screen", `${window.screen.width}x${window.screen.height}`);
  put("viewport", `${window.innerWidth}x${window.innerHeight}`);
  put("ref", referrerHost());
  put("conn", conn?.effectiveType);
  if (typeof conn?.downlink === "number") {
    put("downlink", Math.round(conn.downlink * 10) / 10);
  }
  put("save_data", Boolean(conn?.saveData));
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ] as const) {
    put(key, url.searchParams.get(key));
  }
  return data;
}

function bindSessionMeta(): () => void {
  let sent = false;
  const send = () => {
    if (sent) return true;
    const identifyFn = window.umami?.identify;
    if (!identifyFn) return false;
    const id = deviceId();
    const data = { ...sessionMeta(), ...(id ? { device_id: id } : {}) };
    if (id) identifyFn(id, data);
    else if (Object.keys(data).length) identifyFn(data);
    sent = true;
    return true;
  };

  if (send()) return () => undefined;

  const poll = window.setInterval(() => {
    if (send()) window.clearInterval(poll);
  }, 200);
  const timeout = window.setTimeout(() => window.clearInterval(poll), 10_000);
  return () => {
    window.clearInterval(poll);
    window.clearTimeout(timeout);
  };
}

export function loadPulse(options: {
  websiteId: string;
  origin?: string;
  domains?: string;
}): () => void {
  if (typeof document === "undefined" || !options.websiteId) {
    return () => undefined;
  }

  const origin = (options.origin ?? PULSE_ORIGIN).replace(/\/$/, "");
  const src = `${origin}/script.js`;
  const existing = document.querySelector<HTMLScriptElement>(
    `script[${SCRIPT_ATTR}]`,
  );
  if (existing?.getAttribute("data-website-id") === options.websiteId) {
    return bindSessionMeta();
  }
  existing?.remove();
  delete window.umami;

  const script = document.createElement("script");
  script.defer = true;
  script.src = src;
  script.setAttribute("data-website-id", options.websiteId);
  script.setAttribute(SCRIPT_ATTR, "1");
  if (options.domains) script.setAttribute("data-domains", options.domains);
  document.head.appendChild(script);

  let stopMeta = () => undefined as void;
  const onLoad = () => {
    stopMeta = bindSessionMeta();
  };
  script.addEventListener("load", onLoad);

  return () => {
    script.removeEventListener("load", onLoad);
    stopMeta();
    script.remove();
  };
}

export function bindPulseClicks(): () => void {
  if (typeof document === "undefined") return () => undefined;

  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const node = event.target;
    if (!(node instanceof Element)) return;

    const tagged = node.closest<HTMLElement>("[data-track]");
    if (tagged?.dataset.track) {
      const target = tagged.dataset.trackTarget;
      track(tagged.dataset.track, target ? { target } : undefined);
      return;
    }

    const anchor = node.closest("a");
    if (!anchor?.href) return;
    const attrs = installLinkAttrs(anchor.getAttribute("href") ?? anchor.href);
    if (attrs["data-track"]) {
      track(
        attrs["data-track"],
        attrs["data-track-target"]
          ? { target: attrs["data-track-target"] }
          : undefined,
      );
      return;
    }
    try {
      const url = new URL(anchor.href, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.origin === window.location.origin) return;
      track("outbound_click", { target: url.hostname });
    } catch {
      /* ignore invalid href */
    }
  };

  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}

/** Fumadocs code-block copy buttons on install docs. */
export function bindDocsCodeCopy(): () => void {
  if (typeof document === "undefined") return () => undefined;

  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const node = event.target;
    if (!(node instanceof Element)) return;
    if (node.closest("[data-track]")) return;
    const button = node.closest("button");
    if (!button) return;
    const label = `${button.getAttribute("aria-label") ?? ""} ${button.textContent ?? ""}`;
    if (!/copy/i.test(label)) return;
    const root = button.closest("figure, pre, div");
    const pre =
      root?.querySelector("pre") ?? button.parentElement?.querySelector("pre");
    const target = installCopyTarget(pre?.textContent ?? "");
    if (target) track(prismhqEvents.installCopy, { target });
  };

  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
