import { Tooltip } from "@repo-prism/ui";
import {
  AlertTriangle,
  Compass,
  Dna,
  ExternalLink,
  FileSearch,
  FlaskConical,
  GitBranch,
  GitPullRequest,
  LayoutGrid,
  Map as MapIcon,
  Plug,
  Settings,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import type { AppShellClient } from "./client.js";
import { useAppShellClient } from "./client-context.js";
import { isBrowserShell } from "./is-browser.js";
import { Avatar } from "./Avatar.js";
import type { PrismGitignoreStatus, WorkspacePackageInfo } from "./types.js";

export type AppView =
  | "overview"
  | "map"
  | "dna"
  | "domains"
  | "domain"
  | "testing"
  | "blast"
  | "trends"
  | "integrations"
  | "settings"
  | "review"
  | "explain";

export type AppSidebarUser = {
  readonly author: string;
  readonly email?: string | undefined;
};

export type AppSidebarProps = {
  /** `full` = static (dashboard); `rail` = collapsed strip that expands on hover. */
  readonly variant: "full" | "rail";
  readonly active: AppView;
  readonly repoLabel: string;
  readonly user?: AppSidebarUser | null;
  readonly onNavigate: (view: AppView) => void;
  /** Brand mark URL (webview asWebviewUri). Falls back to /brand path. */
  readonly brandMarkSrc?: string;
};

/**
 * Session cache so the `.prism` gitignore status is fetched once per host,
 * not on every sidebar remount as the user navigates between screens.
 */
let gitignoreStatusPromise: Promise<PrismGitignoreStatus> | null = null;

function usePrismGitignoreStatus(client: AppShellClient): {
  status: PrismGitignoreStatus | null;
  addToGitignore: (() => Promise<void>) | null;
} {
  const [status, setStatus] = useState<PrismGitignoreStatus | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!client.fetchPrismGitignoreStatus) return;
    let cancelled = false;
    if (!gitignoreStatusPromise) {
      gitignoreStatusPromise = client
        .fetchPrismGitignoreStatus()
        .catch<PrismGitignoreStatus>(() => ({ ignored: null }));
    }
    void gitignoreStatusPromise.then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const addToGitignore =
    client.addPrismGitignore && !adding
      ? async (): Promise<void> => {
          if (!client.addPrismGitignore) return;
          setAdding(true);
          try {
            const next = await client.addPrismGitignore();
            gitignoreStatusPromise = Promise.resolve(next);
            setStatus(next);
          } finally {
            setAdding(false);
          }
        }
      : null;

  return { status, addToGitignore };
}

/**
 * Mono-v1 package picker (M-048 Phase 6): lists workspace packages once per
 * host and forwards the selection to Core via `selectPackage`. Hidden when
 * the host doesn't support it or the workspace has 0-1 packages.
 */
function usePackagePicker(client: AppShellClient): {
  packages: WorkspacePackageInfo[];
  selectedId: string | null;
  select: (id: string | null) => void;
} {
  const [packages, setPackages] = useState<WorkspacePackageInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!client.fetchPackages) return;
    let cancelled = false;
    void client
      .fetchPackages()
      .then((list) => {
        if (!cancelled) setPackages(list);
      })
      .catch(() => {
        /* package listing is optional */
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const select = (id: string | null): void => {
    setSelectedId(id);
    void client.selectPackage?.(id);
  };

  return { packages, selectedId, select };
}

/**
 * App-level navigation shared by the dashboard and the map. As a `rail` it
 * collapses to an icon strip and cascades open on hover / focus, overlaying the
 * content without stealing layout space.
 */
export function AppSidebar(props: AppSidebarProps): ReactElement {
  const client = useAppShellClient();
  const { status: gitignoreStatus, addToGitignore } =
    usePrismGitignoreStatus(client);
  const {
    packages,
    selectedId: selectedPackageId,
    select: selectPackageId,
  } = usePackagePicker(client);
  const [gitignoreBusy, setGitignoreBusy] = useState(false);
  const showGitignoreWarning = gitignoreStatus?.ignored === false;
  const brandSrc =
    props.brandMarkSrc ??
    document.body.getAttribute("data-brand") ??
    "/brand/prism-mark.png";

  const onAddGitignore = (): void => {
    if (!addToGitignore || gitignoreBusy) return;
    setGitignoreBusy(true);
    void addToGitignore().finally(() => setGitignoreBusy(false));
  };

  return (
    <aside
      className={`appnav appnav--${props.variant}`}
      aria-label="Primary navigation"
    >
      <div className="appnav__logo" data-prism-tour="welcome">
        <img src={brandSrc} alt="" width={22} height={22} />
        <span className="appnav__reveal">Prism</span>
      </div>
      {!isBrowserShell() && client.postToHost ? (
        <button
          type="button"
          className="appnav__item appnav__item--external appnav__item--below-logo"
          title="Open the same Prism session in your system browser"
          aria-label="Open in browser"
          onClick={() => client.postToHost?.({ type: "openInBrowser" })}
        >
          <ExternalLink size={16} aria-hidden />
          <span className="appnav__reveal">Open in browser</span>
        </button>
      ) : null}

      <div className="appnav__repo appnav__reveal">
        <div className="appnav__repo-box">
          <div className="appnav__repo-text">
            <div className="appnav__repo-scope">Local workspace</div>
            <div className="appnav__repo-name">{props.repoLabel}</div>
          </div>
          <GitBranch size={13} aria-hidden />
        </div>
        {packages.length > 1 ? (
          <select
            className="appnav__pkg-select"
            aria-label="Package"
            value={selectedPackageId ?? ""}
            onChange={(e) => selectPackageId(e.target.value || null)}
          >
            <option value="">All packages ({packages.length})</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name ?? pkg.id}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <nav className="appnav__nav">
        <p className="appnav__group appnav__reveal">Workspace</p>
        <button
          type="button"
          className="appnav__item"
          title="Overview"
          aria-label="Overview"
          data-prism-tour="overview"
          data-active={props.active === "overview" ? "true" : "false"}
          onClick={() => props.onNavigate("overview")}
        >
          <LayoutGrid size={16} aria-hidden />
          <span className="appnav__reveal">Overview</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          title="Repository Map"
          aria-label="Repository Map"
          data-prism-tour="map"
          data-active={props.active === "map" ? "true" : "false"}
          onClick={() => props.onNavigate("map")}
        >
          <MapIcon size={16} aria-hidden />
          <span className="appnav__reveal">Repository Map</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          title="Domains"
          aria-label="Domains"
          data-prism-tour="domains"
          data-active={
            props.active === "domains" || props.active === "domain"
              ? "true"
              : "false"
          }
          onClick={() => props.onNavigate("domains")}
        >
          <Compass size={16} aria-hidden />
          <span className="appnav__reveal">Domains</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          title="Testing & Security"
          aria-label="Testing and Security"
          data-prism-tour="testing"
          data-active={props.active === "testing" ? "true" : "false"}
          onClick={() => props.onNavigate("testing")}
        >
          <FlaskConical size={16} aria-hidden />
          <span className="appnav__reveal">Testing &amp; Security</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          title="DNA Analysis"
          aria-label="DNA Analysis"
          data-prism-tour="dna"
          data-active={props.active === "dna" ? "true" : "false"}
          onClick={() => props.onNavigate("dna")}
        >
          <Dna size={16} aria-hidden />
          <span className="appnav__reveal">DNA Analysis</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          title="Blast Radius"
          aria-label="Blast Radius"
          data-prism-tour="impact"
          data-active={props.active === "blast" ? "true" : "false"}
          onClick={() => props.onNavigate("blast")}
        >
          <Zap size={16} aria-hidden />
          <span className="appnav__reveal">Blast Radius</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          title="Trends"
          aria-label="Trends"
          data-prism-tour="trends"
          data-active={props.active === "trends" ? "true" : "false"}
          onClick={() => props.onNavigate("trends")}
        >
          <TrendingUp size={16} aria-hidden />
          <span className="appnav__reveal">Trends</span>
        </button>

        <p className="appnav__group appnav__reveal">Tools</p>
        <button
          type="button"
          className="appnav__item"
          title="Change Review"
          aria-label="Change Review"
          data-prism-tour="review"
          data-active={props.active === "review" ? "true" : "false"}
          onClick={() => props.onNavigate("review")}
        >
          <GitPullRequest size={16} aria-hidden />
          <span className="appnav__reveal">Change Review</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          title="Explain This Area"
          aria-label="Explain This Area"
          data-prism-tour="explain"
          data-active={props.active === "explain" ? "true" : "false"}
          onClick={() => props.onNavigate("explain")}
        >
          <FileSearch size={16} aria-hidden />
          <span className="appnav__reveal">Explain This Area</span>
        </button>

        <p className="appnav__group appnav__reveal">Settings</p>
        <button
          type="button"
          className="appnav__item"
          title="Integrations"
          aria-label="Integrations"
          data-prism-tour="integrations"
          data-active={props.active === "integrations" ? "true" : "false"}
          onClick={() => props.onNavigate("integrations")}
        >
          <Plug size={16} aria-hidden />
          <span className="appnav__reveal">Integrations</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          title="Settings"
          aria-label="Settings"
          data-prism-tour="settings"
          data-active={props.active === "settings" ? "true" : "false"}
          onClick={() => props.onNavigate("settings")}
        >
          <Settings size={16} aria-hidden />
          <span className="appnav__reveal">Settings</span>
        </button>
      </nav>

      {showGitignoreWarning ? (
        <div className="appnav__warn" role="status">
          <span className="appnav__warn-chip">
            <AlertTriangle size={13} aria-hidden />
            <span className="appnav__warn-text appnav__reveal">
              .prism not gitignored
            </span>
            <span className="appnav__warn-tip appnav__reveal">
              <Tooltip
                label=".prism is tracked by git"
                align="start"
                actions={
                  addToGitignore ? (
                    <button
                      type="button"
                      className="prism-tooltip__action"
                      disabled={gitignoreBusy}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onAddGitignore();
                      }}
                    >
                      {gitignoreBusy ? "Adding…" : "Add to .gitignore"}
                    </button>
                  ) : null
                }
              >
                Prism writes its local cache to <code>.prism/</code>. Add{" "}
                <code>.prism/</code> to your <code>.gitignore</code> so the
                cache isn&apos;t committed.
                {gitignoreStatus?.detail ? ` (${gitignoreStatus.detail})` : ""}
              </Tooltip>
            </span>
          </span>
        </div>
      ) : null}

      <div className="appnav__user">
        {props.user ? (
          <>
            <Avatar
              name={props.user.author}
              email={props.user.email}
              size={28}
            />
            <div className="appnav__user-text appnav__reveal">
              <div className="appnav__user-name">{props.user.author}</div>
              <div className="appnav__user-sub">
                {props.user.email ?? "local git"}
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="appnav__user-dot" aria-hidden />
            <div className="appnav__user-text appnav__reveal">
              <div className="appnav__user-name">Local workspace</div>
              <div className="appnav__user-sub">no git identity</div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
