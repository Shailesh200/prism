import {
  AlertTriangle,
  Code2,
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
import { useId, useState, type ReactElement, type ReactNode } from "react";
import { CardIcon, InfoTip, Input, type CardIconTone } from "@prism/ui";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { fetchGithubWorkflows, fetchPagespeedMetrics } from "./github-ci.js";
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
};

const INTEGRATIONS: readonly Integration[] = [
  {
    id: "mcp",
    name: "MCP Server",
    blurb: "Expose repo context to LLMs via Model Context Protocol.",
    status: "coming_soon",
    icon: Plug,
    tone: "violet",
    details:
      "Scaffold lives in @prism/mcp-server. Full MCP tool surface ships in M-026/M-027. Until then there is no local port to configure from this playground.",
  },
  {
    id: "cli",
    name: "CLI",
    blurb: "Command-line interface for local-first analysis.",
    status: "coming_soon",
    icon: Terminal,
    tone: "ink",
    details:
      "Package @prism/cli is scaffolded. Commands land in M-028/M-029. Use Core / this playground for analysis until the CLI is Verified.",
  },
  {
    id: "vscode",
    name: "VS Code Extension",
    blurb: "Inline cartography and blast-radius warnings in the editor.",
    status: "available",
    icon: Code2,
    tone: "brand",
    details:
      "Shipped in M-030 / M-031. Install the Prism VS Code extension to open the same app-shell surfaces inside the editor.",
  },
  {
    id: "cursor",
    name: "Cursor Extension",
    blurb: "Deep integration with Cursor’s AI coding environment.",
    status: "available",
    icon: Sparkles,
    tone: "violet",
    details:
      "Shipped in M-032 as a packaging overlay on the VS Code extension. Open Prism from the Cursor sidebar.",
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
    name: "GitHub / GitLab metadata",
    blurb: "Overlay PR velocity, issue density, and ownership onto the map.",
    status: "coming_soon",
    icon: GitBranch,
    tone: "ink",
    note: "Opt-in",
    details:
      "Broader forge overlays beyond Actions workflows. Prefer the GitHub Actions connector for live CI today.",
  },
  {
    id: "argo",
    name: "Argo CD / Workflows",
    blurb: "GitOps delivery pipelines (scaffold).",
    status: "coming_soon",
    icon: Workflow,
    tone: "rose",
    details:
      "Scaffold only in M-046. Live Argo connectors are deferred past Phase 3 scaffolds.",
  },
  {
    id: "jenkins",
    name: "Jenkins",
    blurb: "Classic CI servers (scaffold).",
    status: "coming_soon",
    icon: Server,
    tone: "ink",
    details:
      "Scaffold only in M-046. Live Jenkins connectors are deferred past Phase 3 scaffolds.",
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

export function IntegrationsScreen(
  props: IntegrationsScreenProps,
): ReactElement {
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
    const result = await fetchGithubWorkflows(
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
    // Minimal PSI call against a stable public URL to validate the key.
    const result = await fetchPagespeedMetrics(key, "https://example.com");
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
    <div className="ov">
      <AppSidebar
        variant="full"
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
                      <button
                        type="button"
                        className="ov-btn ov-btn--ghost int-card__btn"
                        disabled
                      >
                        Soon
                      </button>
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
