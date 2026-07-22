import {
  Code2,
  GitBranch,
  Lock,
  Plug,
  Sparkles,
  Terminal,
  Gauge,
} from "lucide-react";
import { useState, type ComponentType, type ReactElement } from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import "./overview.css";

export type IntegrationsScreenProps = {
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  onNavigate: (view: AppView) => void;
};

type Status = "available" | "coming_soon";

type IntegrationId = "mcp" | "cli" | "vscode" | "cursor" | "cwv" | "forge";

type Integration = {
  id: IntegrationId;
  name: string;
  blurb: string;
  status: Status;
  icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>;
  /** Honest footnote under the card footer (e.g. opt-in). */
  note?: string;
  /** Expandable setup / shipping reality — never a fake connect flow. */
  details: string;
};

/**
 * Catalog mirrors STITCH §4. Statuses match what is shippable today — packages
 * may exist as scaffolds, but we do not claim Connected / live ports.
 */
const INTEGRATIONS: readonly Integration[] = [
  {
    id: "mcp",
    name: "MCP Server",
    blurb: "Expose repo context to LLMs via Model Context Protocol.",
    status: "available",
    icon: Plug,
    details:
      "Scaffold lives in @prism/mcp-server. Full MCP tool surface ships in M-026/M-027. Until then there is no local port to configure from this playground.",
  },
  {
    id: "cli",
    name: "CLI",
    blurb: "Command-line interface for local-first analysis.",
    status: "available",
    icon: Terminal,
    details:
      "Package @prism/cli is scaffolded. Commands land in M-028/M-029. Use Core / this playground for analysis until the CLI is Verified.",
  },
  {
    id: "vscode",
    name: "VS Code Extension",
    blurb: "Inline cartography and blast-radius warnings in the editor.",
    status: "coming_soon",
    icon: Code2,
    details:
      "Tracked as M-030 / M-031. Extension package exists as a shell only.",
  },
  {
    id: "cursor",
    name: "Cursor Extension",
    blurb: "Deep integration with Cursor’s AI coding environment.",
    status: "coming_soon",
    icon: Sparkles,
    details:
      "Tracked as M-032. Packaging overlay only until VS Code shell lands.",
  },
  {
    id: "cwv",
    name: "Lighthouse / CWV ingest",
    blurb: "Map performance metrics back to architectural components.",
    status: "available",
    icon: Gauge,
    details:
      "Contracts and Domain · Web opt-in UI exist. Local Lighthouse lab + report import remain deferred — Connect here will not start a network job.",
  },
  {
    id: "forge",
    name: "GitHub / GitLab metadata",
    blurb: "Overlay PR velocity, issue density, and ownership onto the map.",
    status: "coming_soon",
    icon: GitBranch,
    note: "Opt-in, never automatic",
    details:
      "Read-only forge metadata is deliberately out of Core’s default path. When enabled later, it will require an explicit user opt-in and will never run automatically.",
  },
];

export function IntegrationsScreen(
  props: IntegrationsScreenProps,
): ReactElement {
  const subtitle = "Connect Prism to your tools";
  const [openId, setOpenId] = useState<IntegrationId | null>(null);

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
              explicitly enable an integration.
            </p>
          </div>

          <div className="int-grid">
            {INTEGRATIONS.map((item) => {
              const Icon = item.icon;
              const open = openId === item.id;
              const soon = item.status === "coming_soon";
              return (
                <article
                  key={item.id}
                  className="ov-card int-card"
                  data-soon={soon ? "true" : "false"}
                  data-open={open ? "true" : "false"}
                >
                  <div className="int-card__top">
                    <span className="int-card__glyph" aria-hidden>
                      <Icon size={20} />
                    </span>
                    <StatusPill status={item.status} />
                  </div>

                  <h2 className="int-card__name">{item.name}</h2>
                  <p className="int-card__blurb">{item.blurb}</p>

                  {open ? (
                    <p className="int-card__details">{item.details}</p>
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
                    ) : (
                      <button
                        type="button"
                        className="ov-btn ov-btn--ghost int-card__btn"
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : item.id)}
                      >
                        {open ? "Hide" : "Details"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill(props: { status: Status }): ReactElement {
  if (props.status === "coming_soon") {
    return <span className="int-pill int-pill--soon">Coming soon</span>;
  }
  return <span className="int-pill int-pill--avail">Available</span>;
}
