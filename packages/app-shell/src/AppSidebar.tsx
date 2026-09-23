import { Select } from "@repo-prism/ui";
import {
  Aperture,
  BookOpen,
  Dna,
  ExternalLink,
  GitBranch,
  LayoutGrid,
  ListTodo,
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
import {
  DASHBOARD_VIEW_LABELS,
  resolveAppView,
  type AppView,
  type DashboardView,
} from "./dashboard-views.js";
import type { WorkspacePackageInfo } from "./types.js";

export type { AppView, DashboardView } from "./dashboard-views.js";

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

const NAV_ICONS: Record<DashboardView, ReactElement> = {
  overview: <LayoutGrid size={16} aria-hidden />,
  iris: <Aperture size={16} aria-hidden />,
  jobs: <ListTodo size={16} aria-hidden />,
  skills: <BookOpen size={16} aria-hidden />,
  dna: <Dna size={16} aria-hidden />,
  trends: <TrendingUp size={16} aria-hidden />,
  impact: <Zap size={16} aria-hidden />,
  integrations: <Plug size={16} aria-hidden />,
  settings: <Settings size={16} aria-hidden />,
};

const WORKSPACE_VIEWS: readonly DashboardView[] = [
  "overview",
  "iris",
  "jobs",
  "skills",
  "dna",
  "trends",
];

const TOOL_VIEWS: readonly DashboardView[] = ["impact"];

const SETTINGS_VIEWS: readonly DashboardView[] = ["integrations", "settings"];

function NavItem(props: {
  readonly id: DashboardView;
  readonly active: AppView;
  readonly onNavigate: (view: AppView) => void;
}): ReactElement {
  const label = DASHBOARD_VIEW_LABELS[props.id];
  const current = resolveAppView(props.active) === props.id;
  return (
    <button
      type="button"
      className="appnav__item"
      title={label}
      aria-label={label}
      data-prism-tour={props.id}
      data-active={current ? "true" : "false"}
      onClick={() => props.onNavigate(props.id)}
    >
      {NAV_ICONS[props.id]}
      <span className="appnav__reveal">{label}</span>
    </button>
  );
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
  const {
    packages,
    selectedId: selectedPackageId,
    select: selectPackageId,
  } = usePackagePicker(client);
  const brandSrc =
    props.brandMarkSrc ??
    document.body.getAttribute("data-brand") ??
    "/brand/prism-mark.png";

  return (
    <aside
      className={`appnav appnav--${props.variant}`}
      aria-label="Primary navigation"
    >
      {isBrowserShell() ? null : (
        <div className="appnav__logo" data-prism-tour="welcome">
          <img src={brandSrc} alt="" width={22} height={22} />
          <span className="appnav__reveal">Prism</span>
        </div>
      )}
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
          <Select
            className="appnav__pkg-select"
            aria-label="Package"
            value={selectedPackageId ?? ""}
            onChange={(next) => selectPackageId(next || null)}
            options={[
              { value: "", label: `All packages (${packages.length})` },
              ...packages.map((pkg) => ({
                value: pkg.id,
                label: pkg.name ?? pkg.id,
              })),
            ]}
          />
        ) : null}
      </div>

      <nav className="appnav__nav">
        <p className="appnav__group appnav__reveal">Workspace</p>
        {WORKSPACE_VIEWS.map((id) => (
          <NavItem
            key={id}
            id={id}
            active={props.active}
            onNavigate={props.onNavigate}
          />
        ))}

        <span className="appnav__rule" aria-hidden />
        <p className="appnav__group appnav__reveal">Tools</p>
        {TOOL_VIEWS.map((id) => (
          <NavItem
            key={id}
            id={id}
            active={props.active}
            onNavigate={props.onNavigate}
          />
        ))}

        <span className="appnav__rule" aria-hidden />
        <p className="appnav__group appnav__reveal">Settings</p>
        {SETTINGS_VIEWS.map((id) => (
          <NavItem
            key={id}
            id={id}
            active={props.active}
            onNavigate={props.onNavigate}
          />
        ))}
      </nav>

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
