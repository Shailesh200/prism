import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  GitPullRequest,
  Gauge,
  Lock,
  Plug,
  Server,
  Sparkles,
  Terminal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { CardIcon, InfoTip, Input, type CardIconTone } from "@repo-prism/ui";
import {
  NO_CONSOLE_STATUS,
  PRISM_TOOL_COUNT,
  type ConsoleStatus,
} from "@repo-prism/shared";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { useAppShellClient } from "./client-context.js";
import type { AppShellClient } from "./client.js";
import { isBrowserShell } from "./is-browser.js";
import {
  loadIntegrationsState,
  loadLighthouseEnabledInFrontend,
  saveIntegrationsState,
  saveLighthouseEnabledInFrontend,
  type IntegrationConnection,
  type IntegrationsState,
} from "./integrations-store.js";

/**
 * True only inside the VS Code / Cursor editor webview (not the standalone Vite
 * playground or the browser bridge). The editor host injects the
 * `acquireVsCodeApi` global; the browser bridge sets `data-prism-mode="browser"`
 * and the standalone playground has neither. Used to hide the VS Code / Cursor
 * cards, since being in the webview means those extensions are already installed.
 *
 * NOTE: `IntegrationsScreenProps` carries no explicit surface/host prop, so this
 * relies on the `acquireVsCodeApi` global as the available signal.
 */
function isExtensionWebview(): boolean {
  if (isBrowserShell()) return false;
  return (
    typeof (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi ===
    "function"
  );
}

/** Google docs on obtaining a PageSpeed Insights API key. */
const PAGESPEED_KEY_DOCS =
  "https://developers.google.com/speed/docs/insights/v5/get-started";

/** Prism website install guides. */
const PRISM_CLI_DOCS = "https://www.prismhq.in/docs/start/install";
const PRISM_MCP_DOCS = "https://www.prismhq.in/docs/start/install";

/**
 * Cursor one-click MCP install deeplink. The config param is base64 of
 * {"command":"npx","args":["-y","--prefer-online","@repo-prism/mcp-server@latest"],
 * "env":{"NODE_USE_SYSTEM_CA":"1"}} —
 * keep in sync with apps/website/lib/mcp-install.ts (cursorMcpInstallHref).
 *
 * No workspace variable: the server resolves the open folder from MCP roots
 * and follows roots/list_changed, so the deeplink config matches what every
 * other install path hands out.
 */
const CURSOR_MCP_INSTALL =
  "cursor://anysphere.cursor-deeplink/mcp/install?name=prism&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIi0tcHJlZmVyLW9ubGluZSIsIkByZXBvLXByaXNtL21jcC1zZXJ2ZXJAbGF0ZXN0Il0sImVudiI6eyJOT0RFX1VTRV9TWVNURU1fQ0EiOiIxIn19";

export type IntegrationsScreenProps = {
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  onNavigate: (view: AppView) => void;
  /** Settings → Allow network integrations (ADR-0024). */
  networkIntegrationsAllowed: boolean;
};

type Status = "available" | "coming_soon" | "locked";

type IntegrationId =
  | "mcp"
  | "cli"
  | "vscode"
  | "cursor"
  | "git"
  | "github"
  | "pagespeed"
  | "cwv"
  | "forge"
  | "argo"
  | "jenkins";

type Integration = {
  id: IntegrationId;
  name: string;
  blurb: string;
  /** Base catalog status; github/pagespeed may resolve to locked at render. */
  status: Status;
  icon: LucideIcon;
  /** Tone for the card-title icon (design-system palette). */
  tone?: CardIconTone;
  note?: string;
  details: string;
  /** Needs Settings → Allow network integrations. */
  networkGated?: boolean;
  /** Show Connect / Disconnect + optional connector panel. */
  connectable?: boolean;
  /** Copyable install/run command shown in the expanded panel. */
  installCommand?: string;
  /** Install guide on prismhq.in, linked from the expanded panel. */
  docsHref?: string;
  /** One-click Cursor MCP install deeplink. */
  cursorInstallHref?: string;
};

const INTEGRATIONS: readonly Integration[] = [
  {
    id: "mcp",
    name: "MCP Server",
    blurb: "Expose repo context to LLMs via Model Context Protocol.",
    status: "available",
    icon: Plug,
    tone: "violet",
    installCommand: "npx -y @repo-prism/mcp-server",
    docsHref: PRISM_MCP_DOCS,
    cursorInstallHref: CURSOR_MCP_INSTALL,
    details:
      "Run `npx -y @repo-prism/mcp-server` or add it to your MCP client config. See docs/start/install.mdx in the repo for Cursor, Claude, and other hosts.",
  },
  {
    id: "cli",
    name: "CLI",
    blurb: "Command-line interface for local-first analysis.",
    status: "available",
    icon: Terminal,
    tone: "ink",
    installCommand: "npx -y @repo-prism/cli",
    docsHref: PRISM_CLI_DOCS,
    details:
      "Run `npx -y @repo-prism/cli doctor` to verify your workspace, then commands like `dna`, `health`, and `blast`. See packages/cli/README.md for the full list.",
  },
  {
    id: "vscode",
    name: "VS Code Extension",
    blurb: "Inline cartography and blast-radius warnings in the editor.",
    status: "available",
    icon: Code2,
    tone: "brand",
    details:
      "Install the Prism VS Code extension to open the same surfaces inside the editor.",
  },
  {
    id: "cursor",
    name: "Cursor Extension",
    blurb: "Deep integration with Cursor’s AI coding environment.",
    status: "available",
    icon: Sparkles,
    tone: "violet",
    details:
      "Packaging overlay on the VS Code extension. Open Prism from the Cursor sidebar.",
  },
  {
    id: "git",
    name: "Remote Git",
    blurb:
      "Opt-in remote history fetch — read-only, never pushes without consent.",
    status: "available",
    icon: GitBranch,
    tone: "amber",
    note: "Fetch only — no push",
    connectable: true,
    details:
      "When enabled, Prism may run `git fetch` to refresh remote-tracking refs (ahead/behind, last fetch). Analysis stays read-only and never pushes without your explicit consent. DevOps stays available from local CI overlays — you do not need this toggle to open the DevOps domain.",
  },
  {
    id: "github",
    name: "GitHub Actions / metadata",
    blurb: "Opt-in live workflow listing for a configured owner/repo.",
    status: "available",
    icon: GitPullRequest,
    tone: "brand",
    note: "Opt-in",
    networkGated: true,
    connectable: true,
    details:
      "Fetches workflow metadata only when you click Test connection and Allow network integrations is on. Token stays in localStorage — never sent to Core logs.",
  },
  {
    id: "pagespeed",
    name: "PageSpeed Insights",
    blurb: "Opt-in CWV lab scores via Google PageSpeed Insights.",
    status: "available",
    icon: Gauge,
    tone: "emerald",
    note: "Opt-in",
    networkGated: true,
    connectable: true,
    details:
      "API key is stored only in localStorage. Live CWV fetch is used from the Frontend domain when network integrations are allowed.",
  },
  {
    id: "cwv",
    name: "Lighthouse / CWV ingest",
    blurb: "Map performance metrics back to architectural components.",
    status: "available",
    icon: Gauge,
    tone: "emerald",
    details:
      "Contracts and Domain · Web opt-in UI exist. Local Lighthouse lab + report import remain available without network; PageSpeed is a separate connector.",
  },
  {
    id: "forge",
    name: "GitHub App integration",
    blurb:
      "Install a GitHub App for PR velocity, issue density, and ownership overlays.",
    status: "coming_soon",
    icon: GitBranch,
    tone: "ink",
    note: "Coming soon",
    details:
      "GitHub App–based forge overlays (PRs, issues, ownership) beyond today’s Actions workflow listing. Prefer the GitHub Actions connector for live CI today.",
  },
  {
    id: "argo",
    name: "Argo CD / Workflows",
    blurb: "GitOps delivery pipelines — not available yet.",
    status: "coming_soon",
    icon: Workflow,
    tone: "rose",
    details:
      "Argo connection UI is a placeholder for now. Live sync and drift will land in a future release.",
  },
  {
    id: "jenkins",
    name: "Jenkins",
    blurb: "Classic CI servers — not available yet.",
    status: "coming_soon",
    icon: Server,
    tone: "ink",
    details:
      "Jenkins connection UI is a placeholder for now. Live job listing will land in a future release.",
  },
];

function resolveStatus(item: Integration, networkAllowed: boolean): Status {
  if (item.networkGated && !networkAllowed) return "locked";
  return item.status;
}

/** Loose Google API key shape (AIza…); does not call the network. */
function looksLikePagespeedKey(key: string): boolean {
  const t = key.trim();
  return t.length >= 20 && /^AIza[0-9A-Za-z_-]+$/.test(t);
}

/**
 * Ask the host what the Console knows.
 *
 * `undefined` while in flight is deliberately distinct from a status whose
 * `console` is null: "looking" and "nothing running" are different sentences,
 * and rendering the second one during the first is how a screen tells a user
 * something false for a second.
 */
function useConsoleStatus(client: AppShellClient): {
  readonly status: ConsoleStatus | undefined;
  readonly refresh: () => void;
} {
  const [status, setStatus] = useState<ConsoleStatus | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    if (!client.fetchConsoleStatus) {
      setStatus(NO_CONSOLE_STATUS);
      return;
    }
    void client.fetchConsoleStatus().then((next) => {
      if (live) setStatus(next);
    });
    return () => {
      live = false;
    };
  }, [client, nonce]);

  return { status, refresh: () => setNonce((n) => n + 1) };
}

export function IntegrationsScreen(
  props: IntegrationsScreenProps,
): ReactElement {
  const client = useAppShellClient();
  const { status: consoleStatus, refresh: refreshConsole } =
    useConsoleStatus(client);
  const subtitle = "Connect Prism to your tools";
  const [openId, setOpenId] = useState<IntegrationId | null>(null);
  const [state, setState] = useState<IntegrationsState>(() =>
    loadIntegrationsState(),
  );
  const [githubTest, setGithubTest] = useState<string | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [pagespeedTest, setPagespeedTest] = useState<string | null>(null);
  const [pagespeedBusy, setPagespeedBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] =
    useState<IntegrationId | null>(null);
  const [lighthouseFrontend, setLighthouseFrontend] = useState<boolean>(() =>
    loadLighthouseEnabledInFrontend(),
  );

  const hideEditorCards = isExtensionWebview();
  const visibleIntegrations = INTEGRATIONS.filter(
    (item) =>
      !(hideEditorCards && (item.id === "vscode" || item.id === "cursor")),
  )
    // Coming-soon cards always render last.
    .slice()
    .sort((a, b) => {
      const aSoon = a.status === "coming_soon" ? 1 : 0;
      const bSoon = b.status === "coming_soon" ? 1 : 0;
      return aSoon - bSoon;
    });

  const setLighthouseEnabled = (enabled: boolean): void => {
    setLighthouseFrontend(enabled);
    saveLighthouseEnabledInFrontend(enabled);
  };

  const requestDisconnect = (id: IntegrationId): void => {
    setConfirmDisconnect(id);
  };

  const confirmDisconnectNow = (): void => {
    if (confirmDisconnect) setEnabled(confirmDisconnect, false);
    setConfirmDisconnect(null);
  };

  const persist = (next: IntegrationsState): void => {
    setState(next);
    saveIntegrationsState(next);
  };

  const connection = (id: IntegrationId): IntegrationConnection =>
    state[id] ?? { enabled: false };

  const setEnabled = (id: IntegrationId, enabled: boolean): void => {
    const prev = connection(id);
    persist({
      ...state,
      [id]: prev.config ? { enabled, config: prev.config } : { enabled },
    });
  };

  const setConfig = (
    id: IntegrationId,
    patch: Record<string, string>,
  ): void => {
    const prev = connection(id);
    const config = { ...prev.config, ...patch };
    persist({
      ...state,
      [id]: { enabled: prev.enabled, config },
    });
  };

  const testGithub = async (): Promise<void> => {
    if (!props.networkIntegrationsAllowed) {
      setGithubTest(
        "Enable Allow network integrations in Settings before testing.",
      );
      return;
    }
    const cfg = connection("github").config ?? {};
    const owner = (cfg.owner ?? "").trim();
    const repo = (cfg.repo ?? "").trim();
    const token = (cfg.token ?? "").trim();
    if (!owner || !repo) {
      setGithubTest("Enter owner and repo first.");
      return;
    }
    setGithubBusy(true);
    setGithubTest(null);
    if (!client.fetchGithubWorkflows) {
      setGithubTest("GitHub CI is not available in this host.");
      setGithubBusy(false);
      return;
    }
    const result = await client.fetchGithubWorkflows(
      token ? { owner, repo, token } : { owner, repo },
    );
    if (result.ok) {
      const n = result.workflows.length;
      setGithubTest(
        `Connected — ${n} workflow${n === 1 ? "" : "s"} found${
          token ? " (authenticated)" : " (public, unauthenticated)"
        }.`,
      );
    } else {
      setGithubTest(result.error);
    }
    setGithubBusy(false);
  };

  const testPagespeed = async (): Promise<void> => {
    if (!props.networkIntegrationsAllowed) {
      setPagespeedTest(
        "Enable Allow network integrations in Settings before testing.",
      );
      return;
    }
    const key = (connection("pagespeed").config?.apiKey ?? "").trim();
    if (!key) {
      setPagespeedTest("Enter an API key first.");
      return;
    }
    if (!looksLikePagespeedKey(key)) {
      setPagespeedTest(
        "Key format looks invalid (expect a Google API key starting with AIza…).",
      );
      return;
    }
    setPagespeedBusy(true);
    setPagespeedTest(null);
    if (!client.fetchPagespeedMetrics) {
      setPagespeedTest("PageSpeed is not available in this host.");
      setPagespeedBusy(false);
      return;
    }
    // Minimal PSI call against a stable public URL to validate the key.
    const result = await client.fetchPagespeedMetrics(
      key,
      "https://example.com",
    );
    if (result.ok) {
      setPagespeedTest(
        "API key works — live CWV can be used in the Frontend domain.",
      );
    } else {
      setPagespeedTest(result.error);
    }
    setPagespeedBusy(false);
  };

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
        active="integrations"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        <header className="ov-top">
          <div>
            <div className="ov-top__title">Integrations</div>
            <div className="ov-top__sub">
              {[props.repoLabel, props.branch].filter(Boolean).join(" · ") ||
                subtitle}
            </div>
          </div>
        </header>

        <div className="ov-scroll int-scroll">
          <div className="int-intro">
            <h1 className="int-intro__title">Integrations</h1>
            <p className="int-intro__sub">{subtitle}</p>
          </div>

          <div className="int-banner" role="note">
            <Lock size={18} aria-hidden className="int-banner__icon" />
            <p className="int-banner__body">
              <span className="int-banner__kicker">Local-first</span>
              Prism never sends code or data over the network unless you
              explicitly enable an integration
              {props.networkIntegrationsAllowed
                ? " and Allow network integrations is on."
                : ". Network connectors stay locked until Settings → Allow network integrations."}
            </p>
          </div>

          <HostConnectors status={consoleStatus} onRefresh={refreshConsole} />

          <div className="int-grid">
            {visibleIntegrations.map((item) => {
              const Icon = item.icon;
              const status = resolveStatus(
                item,
                props.networkIntegrationsAllowed,
              );
              const open = openId === item.id;
              const soon = status === "coming_soon";
              const locked = status === "locked";
              const conn = connection(item.id);
              const connected = Boolean(item.connectable && conn.enabled);

              return (
                <article
                  key={item.id}
                  className="ov-card int-card"
                  data-soon={soon ? "true" : "false"}
                  data-locked={locked ? "true" : "false"}
                  data-open={open ? "true" : "false"}
                  data-connected={connected ? "true" : "false"}
                >
                  <div className="int-card__top">
                    <span className="int-card__glyph" aria-hidden>
                      <CardIcon
                        icon={Icon}
                        tone={item.tone ?? "brand"}
                        size={20}
                      />
                    </span>
                    <StatusPill
                      status={status}
                      connected={connected}
                      {...(item.id === "cwv"
                        ? { enabled: lighthouseFrontend }
                        : item.id === "git"
                          ? { enabled: conn.enabled }
                          : {})}
                    />
                  </div>

                  <h2 className="int-card__name">{item.name}</h2>
                  <p className="int-card__blurb">{item.blurb}</p>

                  {open ? (
                    <div className="int-card__panel">
                      <p className="int-card__details">{item.details}</p>
                      {item.id === "mcp" ? (
                        <McpRuntimePanel
                          status={consoleStatus}
                          onRefresh={refreshConsole}
                        />
                      ) : null}
                      {item.installCommand && item.docsHref ? (
                        <InstallPanel
                          command={item.installCommand}
                          docsHref={item.docsHref}
                          {...(item.cursorInstallHref
                            ? { cursorInstallHref: item.cursorInstallHref }
                            : {})}
                        />
                      ) : null}
                      {item.id === "github" && !locked ? (
                        <GithubConnector
                          config={conn.config ?? {}}
                          enabled={conn.enabled}
                          busy={githubBusy}
                          testMessage={githubTest}
                          networkAllowed={props.networkIntegrationsAllowed}
                          onConfig={(patch) => setConfig("github", patch)}
                          onConnect={() => setEnabled("github", true)}
                          onRequestDisconnect={() =>
                            requestDisconnect("github")
                          }
                          onTest={() => void testGithub()}
                          onNavigateSettings={() =>
                            props.onNavigate("settings")
                          }
                        />
                      ) : null}
                      {item.id === "pagespeed" && !locked ? (
                        <PagespeedConnector
                          config={conn.config ?? {}}
                          enabled={conn.enabled}
                          busy={pagespeedBusy}
                          testMessage={pagespeedTest}
                          networkAllowed={props.networkIntegrationsAllowed}
                          onConfig={(patch) => setConfig("pagespeed", patch)}
                          onConnect={() => setEnabled("pagespeed", true)}
                          onRequestDisconnect={() =>
                            requestDisconnect("pagespeed")
                          }
                          onTest={() => void testPagespeed()}
                          onNavigateSettings={() =>
                            props.onNavigate("settings")
                          }
                        />
                      ) : null}
                      {item.id === "cwv" ? (
                        <div className="int-connect">
                          <label className="int-switch">
                            <input
                              type="checkbox"
                              checked={lighthouseFrontend}
                              onChange={(e) =>
                                setLighthouseEnabled(e.target.checked)
                              }
                            />
                            <span className="int-switch__track" aria-hidden />
                            <span className="int-switch__label">
                              {lighthouseFrontend ? "Enabled" : "Disabled"}
                            </span>
                          </label>
                          <p className="int-connect__hint">
                            When on, the Frontend domain surfaces Lighthouse /
                            Core Web Vitals panels. Local lab runs and report
                            imports need no network.
                          </p>
                        </div>
                      ) : null}
                      {item.id === "git" ? (
                        <div className="int-connect">
                          <label className="int-switch">
                            <input
                              type="checkbox"
                              checked={conn.enabled}
                              onChange={(e) =>
                                setEnabled("git", e.target.checked)
                              }
                            />
                            <span className="int-switch__track" aria-hidden />
                            <span className="int-switch__label">
                              {conn.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </label>
                          <p className="int-connect__hint">
                            Enables remote history fetch (`git fetch`) only.
                            Read-only — Prism never pushes without your consent.
                            DevOps stays available from local overlays.
                          </p>
                        </div>
                      ) : null}
                      {locked ? (
                        <p className="int-connect__hint int-connect__hint--warn">
                          Enable Allow network integrations in{" "}
                          <button
                            type="button"
                            className="set-link"
                            onClick={() => props.onNavigate("settings")}
                          >
                            Settings
                          </button>
                          .
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="int-card__foot">
                    {item.note ? (
                      <span className="int-card__note">
                        <span className="int-card__dot" aria-hidden />
                        {item.note}
                      </span>
                    ) : (
                      <span />
                    )}
                    {soon ? (
                      <a
                        className="int-pill int-pill--soon int-card__btn"
                        href="https://github.com/repo-prism/prism#roadmap"
                        target="_blank"
                        rel="noreferrer"
                        title="See roadmap for upcoming connectors"
                      >
                        On the roadmap
                      </a>
                    ) : locked && !open ? (
                      <button
                        type="button"
                        className="ov-btn ov-btn--ghost int-card__btn"
                        aria-expanded={open}
                        onClick={() => setOpenId(item.id)}
                      >
                        Locked
                      </button>
                    ) : item.connectable && !open ? (
                      <button
                        type="button"
                        className="ov-btn ov-btn--ghost int-card__btn"
                        disabled={locked}
                        title={
                          locked
                            ? "Enable Allow network integrations in Settings"
                            : undefined
                        }
                        onClick={() => setOpenId(item.id)}
                      >
                        {connected ? "Manage" : "Connect"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ov-btn ov-btn--ghost int-card__btn"
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : item.id)}
                      >
                        {open ? "Hide" : "Manage"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      {confirmDisconnect ? (
        <DisconnectModal
          name={
            INTEGRATIONS.find((i) => i.id === confirmDisconnect)?.name ??
            "this integration"
          }
          onCancel={() => setConfirmDisconnect(null)}
          onConfirm={confirmDisconnectNow}
        />
      ) : null}
    </div>
  );
}

function DisconnectModal(props: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  const titleId = useId();
  return (
    <div
      className="int-modal-backdrop"
      role="presentation"
      onClick={props.onCancel}
    >
      <div
        className="int-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="int-modal__head">
          <span className="int-modal__icon" aria-hidden>
            <AlertTriangle size={20} />
          </span>
          <h2 id={titleId} className="int-modal__title">
            Disconnect {props.name}?
          </h2>
        </div>
        <p className="int-modal__body">
          Prism will stop using {props.name} until you reconnect. Your saved
          settings stay in this browser — nothing is deleted.
        </p>
        <div className="int-modal__actions">
          <button
            type="button"
            className="ov-btn ov-btn--ghost"
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ov-btn ov-btn--danger"
            onClick={props.onConfirm}
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill(props: {
  status: Status;
  connected?: boolean;
  /** For toggle-style cards (Remote Git / Lighthouse): Enabled vs Disabled. */
  enabled?: boolean;
}): ReactElement {
  if (typeof props.enabled === "boolean") {
    return props.enabled ? (
      <span className="int-pill int-pill--on">Enabled</span>
    ) : (
      <span className="int-pill int-pill--avail">Disabled</span>
    );
  }
  if (props.connected) {
    return <span className="int-pill int-pill--on">Connected</span>;
  }
  if (props.status === "coming_soon") {
    return <span className="int-pill int-pill--soon">Coming soon</span>;
  }
  if (props.status === "locked") {
    return <span className="int-pill int-pill--locked">Locked</span>;
  }
  return <span className="int-pill int-pill--avail">Available</span>;
}

/** Label row that pairs a field label with an inline InfoTip. */
function LabeledField(props: {
  id: string;
  label: string;
  tip?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="prism-field int-field">
      <span className="prism-field__label int-field__label">
        <label htmlFor={props.id}>{props.label}</label>
        {props.tip ? (
          <InfoTip label={props.label} align="start">
            {props.tip}
          </InfoTip>
        ) : null}
      </span>
      {props.children}
    </div>
  );
}

/** Password-style input with a show/hide (eye) toggle. */
function SecretInput(props: {
  id: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}): ReactElement {
  const [show, setShow] = useState(false);
  return (
    <div className="int-secret">
      <Input
        id={props.id}
        type={show ? "text" : "password"}
        value={props.value}
        placeholder={props.placeholder}
        autoComplete="off"
        className="int-secret__field"
        onChange={(e) => props.onChange(e.target.value)}
      />
      <button
        type="button"
        className="int-secret__eye"
        aria-label={show ? "Hide value" : "Show value"}
        aria-pressed={show}
        onClick={() => setShow((v) => !v)}
      >
        {show ? (
          <EyeOff size={14} aria-hidden />
        ) : (
          <Eye size={14} aria-hidden />
        )}
      </button>
    </div>
  );
}

function NetworkGateHint(props: {
  onNavigateSettings: () => void;
}): ReactElement {
  return (
    <p className="int-connect__hint int-connect__hint--warn">
      Enable Allow network integrations in{" "}
      <button
        type="button"
        className="set-link"
        onClick={props.onNavigateSettings}
      >
        Settings
      </button>{" "}
      to connect.
    </p>
  );
}

/**
 * Copyable install command + docs links (MCP Server / CLI cards). Follows the
 * copy-to-clipboard pattern from AuditLogsPanel's DetailBlock.
 */
/**
 * Live state for the MCP card.
 *
 * The card used to be install-only — a command, a link, and no way to tell a
 * working server from one that never started. Everything here comes from the
 * Console, which is the only thing on the machine that actually knows.
 */
function McpRuntimePanel(props: {
  status: ConsoleStatus | undefined;
  onRefresh: () => void;
}): ReactElement {
  const { status } = props;

  if (!status) {
    return (
      <p className="int-runtime int-runtime--idle">Checking the Console…</p>
    );
  }

  if (!status.console) {
    return (
      <div className="int-runtime int-runtime--idle">
        <p className="int-runtime__line">
          <span className="int-runtime__dot" data-tone="idle" aria-hidden />
          Console not running
        </p>
        <p className="int-connect__hint">
          It starts itself the first time an agent calls a Prism tool. Ask Prism
          anything in chat, then refresh.
        </p>
        <button
          type="button"
          className="int-btn int-btn--test"
          onClick={props.onRefresh}
        >
          Check again
        </button>
      </div>
    );
  }

  return (
    <div className="int-runtime">
      <p className="int-runtime__line">
        <span className="int-runtime__dot" data-tone="live" aria-hidden />
        Connected on port {status.console.port}
        {status.version ? ` · v${status.version}` : ""}
      </p>
      <dl className="int-runtime__facts">
        <div>
          <dt>Tools</dt>
          <dd>{PRISM_TOOL_COUNT}</dd>
        </div>
        <div>
          <dt>Repositories watched</dt>
          <dd>{status.workspaces ?? "—"}</dd>
        </div>
      </dl>
      <p className="int-connect__hint int-install__links">
        <a
          className="set-link int-docs-link"
          href={status.console.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          Open the Console
          <ExternalLink size={12} aria-hidden />
        </a>
        <button
          type="button"
          className="int-runtime__refresh"
          onClick={props.onRefresh}
        >
          Refresh
        </button>
      </p>
    </div>
  );
}

/**
 * What the agent window already has connected (ADR-0049).
 *
 * Prism holds no third-party credentials, so this is the screen where "every
 * org has different connections" stops being an abstraction: it lists what is
 * actually installed in Cursor or Claude Code on this machine, and Prism's
 * skills compose with whatever is here.
 */
function HostConnectors(props: {
  status: ConsoleStatus | undefined;
  onRefresh: () => void;
}): ReactElement | null {
  const { status } = props;

  // Nothing to say until the Console answers, and nothing useful to say when
  // it is not running — the MCP card already explains that case once.
  if (!status || !status.console) return null;

  return (
    <section className="int-hosts" aria-labelledby="int-hosts-title">
      <div className="int-hosts__head">
        <div>
          <h2 className="int-hosts__title" id="int-hosts-title">
            Host connectors
          </h2>
          <p className="int-hosts__sub">
            Prism runs no OAuth and holds no tokens. These are your editor’s
            connectors — Prism’s skills compose with whichever you have.
          </p>
        </div>
        <button
          type="button"
          className="int-runtime__refresh"
          onClick={props.onRefresh}
        >
          Rescan
        </button>
      </div>

      {status.connectors.length === 0 ? (
        <p className="int-hosts__empty">
          None found. Connect Slack, Linear, Notion or Google Calendar in
          Cursor’s or Claude Code’s own settings and rescan.
        </p>
      ) : (
        <ul className="int-hosts__list">
          {status.connectors.map((connector) => (
            <li key={connector.id} className="int-hosts__item">
              <div className="int-hosts__row">
                <span className="int-hosts__name">{connector.label}</span>
                {connector.hosts.map((host) => (
                  <span key={host} className="int-hosts__pill">
                    {host === "cursor" ? "Cursor" : "Claude Code"}
                  </span>
                ))}
                {connector.transport ? (
                  <span className="int-hosts__pill int-hosts__pill--muted">
                    {connector.transport}
                  </span>
                ) : null}
              </div>
              {connector.description ? (
                <p className="int-hosts__desc">{connector.description}</p>
              ) : null}
              {connector.skills.length > 0 ? (
                <p className="int-hosts__skills">
                  {connector.skills.length} skill
                  {connector.skills.length === 1 ? "" : "s"}:{" "}
                  {connector.skills.slice(0, 4).join(", ")}
                  {connector.skills.length > 4 ? "…" : ""}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {status.unreadable.length > 0 ? (
        <p className="int-hosts__warn">
          {status.unreadable.length} location
          {status.unreadable.length === 1 ? "" : "s"} could not be read, so this
          list may be incomplete.
        </p>
      ) : null}
    </section>
  );
}

function InstallPanel(props: {
  command: string;
  docsHref: string;
  cursorInstallHref?: string;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  return (
    <div className="int-install">
      <div className="int-install__cmd-row">
        <code className="int-install__cmd">{props.command}</code>
        <button
          type="button"
          className="int-install__copy"
          onClick={() => {
            void navigator.clipboard.writeText(props.command).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? (
            <Check size={12} aria-hidden />
          ) : (
            <Copy size={12} aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="int-connect__hint int-install__links">
        <a
          className="set-link int-docs-link"
          href={props.docsHref}
          target="_blank"
          rel="noreferrer noopener"
        >
          Install guide
          <ExternalLink size={12} aria-hidden />
        </a>
        {props.cursorInstallHref ? (
          <a className="set-link int-docs-link" href={props.cursorInstallHref}>
            Add to Cursor
          </a>
        ) : null}
      </p>
    </div>
  );
}

function GithubConnector(props: {
  config: Record<string, string>;
  enabled: boolean;
  busy: boolean;
  testMessage: string | null;
  networkAllowed: boolean;
  onConfig: (patch: Record<string, string>) => void;
  onConnect: () => void;
  onRequestDisconnect: () => void;
  onTest: () => void;
  onNavigateSettings: () => void;
}): ReactElement {
  const ownerId = useId();
  const repoId = useId();
  const tokenId = useId();
  const canConnect = props.networkAllowed;

  return (
    <div className="int-connect">
      <LabeledField
        id={ownerId}
        label="Owner"
        tip="The GitHub organization or user that owns the repo — e.g. vercel in github.com/vercel/next.js."
      >
        <Input
          id={ownerId}
          value={props.config.owner ?? ""}
          onChange={(e) => props.onConfig({ owner: e.target.value })}
          placeholder="vercel"
          autoComplete="off"
        />
      </LabeledField>
      <LabeledField
        id={repoId}
        label="Repo"
        tip="Just the repository name — the part after the slash (e.g. next.js), not a full URL. Prism uses GitHub's REST API over https, so no git/ssh URL is needed."
      >
        <Input
          id={repoId}
          value={props.config.repo ?? ""}
          onChange={(e) => props.onConfig({ repo: e.target.value })}
          placeholder="next.js"
          autoComplete="off"
        />
      </LabeledField>
      <LabeledField
        id={tokenId}
        label="Token (optional)"
        tip="Optional. Without a token, Prism uses public, read-only access at GitHub's lower unauthenticated rate limits. Add a token to reach private repos and get higher limits."
      >
        <SecretInput
          id={tokenId}
          value={props.config.token ?? ""}
          placeholder="ghp_… stored only in localStorage"
          onChange={(v) => props.onConfig({ token: v })}
        />
      </LabeledField>
      <p className="int-connect__hint">
        No token? Prism reads public repos only, at GitHub&apos;s lower
        unauthenticated rate limits. A fine-grained or classic token unlocks
        private repos and higher limits. Tokens stay in this browser&apos;s
        localStorage.
      </p>
      {!canConnect ? (
        <NetworkGateHint onNavigateSettings={props.onNavigateSettings} />
      ) : null}
      <div className="int-connect__row">
        <button
          type="button"
          className={
            props.enabled ? "ov-btn ov-btn--danger" : "ov-btn ov-btn--primary"
          }
          disabled={!canConnect}
          onClick={() =>
            props.enabled ? props.onRequestDisconnect() : props.onConnect()
          }
        >
          {props.enabled ? "Disconnect" : "Connect"}
        </button>
        <button
          type="button"
          className="ov-btn int-btn--test"
          disabled={!canConnect || props.busy}
          onClick={props.onTest}
        >
          {props.busy ? "Testing…" : "Test connection"}
        </button>
      </div>
      {props.testMessage ? (
        <p className="int-connect__result ov-mono">{props.testMessage}</p>
      ) : null}
    </div>
  );
}

function PagespeedConnector(props: {
  config: Record<string, string>;
  enabled: boolean;
  busy: boolean;
  testMessage: string | null;
  networkAllowed: boolean;
  onConfig: (patch: Record<string, string>) => void;
  onConnect: () => void;
  onRequestDisconnect: () => void;
  onTest: () => void;
  onNavigateSettings: () => void;
}): ReactElement {
  const keyId = useId();
  const canConnect = props.networkAllowed;

  return (
    <div className="int-connect">
      <LabeledField
        id={keyId}
        label="PageSpeed API key"
        tip="A Google API key with the PageSpeed Insights API enabled. Stored only in this browser's localStorage."
      >
        <SecretInput
          id={keyId}
          value={props.config.apiKey ?? ""}
          placeholder="AIza… stored only in localStorage"
          onChange={(v) => props.onConfig({ apiKey: v })}
        />
      </LabeledField>
      <p className="int-connect__hint">
        <a
          className="set-link int-docs-link"
          href={PAGESPEED_KEY_DOCS}
          target="_blank"
          rel="noreferrer noopener"
        >
          How to create a PageSpeed API key
          <ExternalLink size={12} aria-hidden />
        </a>
      </p>
      {!canConnect ? (
        <NetworkGateHint onNavigateSettings={props.onNavigateSettings} />
      ) : null}
      <div className="int-connect__row">
        <button
          type="button"
          className={
            props.enabled ? "ov-btn ov-btn--danger" : "ov-btn ov-btn--primary"
          }
          disabled={!canConnect}
          onClick={() =>
            props.enabled ? props.onRequestDisconnect() : props.onConnect()
          }
        >
          {props.enabled ? "Disconnect" : "Connect"}
        </button>
        <button
          type="button"
          className="ov-btn int-btn--test"
          disabled={!canConnect || props.busy}
          onClick={props.onTest}
        >
          {props.busy ? "Testing…" : "Test connection"}
        </button>
      </div>
      {props.testMessage ? (
        <p className="int-connect__result ov-mono">{props.testMessage}</p>
      ) : null}
    </div>
  );
}
