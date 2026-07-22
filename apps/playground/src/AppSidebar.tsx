import {
  Boxes,
  Compass,
  Dna,
  GitBranch,
  LayoutGrid,
  Map as MapIcon,
  Plug,
  Settings,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { ReactElement } from "react";
import { Avatar } from "./Avatar.js";
import "./appnav.css";

export type AppView =
  | "overview"
  | "map"
  | "dna"
  | "profile"
  | "domains"
  | "domain"
  | "blast"
  | "trends"
  | "integrations"
  | "settings";

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
};

/**
 * App-level navigation shared by the dashboard and the map. As a `rail` it
 * collapses to an icon strip and cascades open on hover / focus, overlaying the
 * content without stealing layout space.
 */
export function AppSidebar(props: AppSidebarProps): ReactElement {
  return (
    <aside
      className={`appnav appnav--${props.variant}`}
      aria-label="Primary navigation"
    >
      <div className="appnav__logo">
        <img src="/brand/prism-mark.png" alt="" width={22} height={22} />
        <span className="appnav__reveal">Prism</span>
      </div>

      <div className="appnav__repo appnav__reveal">
        <div className="appnav__repo-box">
          <div className="appnav__repo-text">
            <div className="appnav__repo-scope">Local workspace</div>
            <div className="appnav__repo-name">{props.repoLabel}</div>
          </div>
          <GitBranch size={13} aria-hidden />
        </div>
      </div>

      <nav className="appnav__nav">
        <p className="appnav__group appnav__reveal">Workspace</p>
        <button
          type="button"
          className="appnav__item"
          data-active={props.active === "overview" ? "true" : "false"}
          onClick={() => props.onNavigate("overview")}
        >
          <LayoutGrid size={16} aria-hidden />
          <span className="appnav__reveal">Overview</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          data-active={props.active === "map" ? "true" : "false"}
          onClick={() => props.onNavigate("map")}
        >
          <MapIcon size={16} aria-hidden />
          <span className="appnav__reveal">Repository Map</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          data-active={props.active === "profile" ? "true" : "false"}
          onClick={() => props.onNavigate("profile")}
        >
          <Boxes size={16} aria-hidden />
          <span className="appnav__reveal">Codebase Profile</span>
        </button>
        <button
          type="button"
          className="appnav__item"
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
          data-active={props.active === "dna" ? "true" : "false"}
          onClick={() => props.onNavigate("dna")}
        >
          <Dna size={16} aria-hidden />
          <span className="appnav__reveal">DNA Analysis</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          data-active={props.active === "blast" ? "true" : "false"}
          onClick={() => props.onNavigate("blast")}
        >
          <Zap size={16} aria-hidden />
          <span className="appnav__reveal">Blast Radius</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          data-active={props.active === "trends" ? "true" : "false"}
          onClick={() => props.onNavigate("trends")}
        >
          <TrendingUp size={16} aria-hidden />
          <span className="appnav__reveal">Trends</span>
        </button>

        <p className="appnav__group appnav__reveal">Settings</p>
        <button
          type="button"
          className="appnav__item"
          data-active={props.active === "integrations" ? "true" : "false"}
          onClick={() => props.onNavigate("integrations")}
        >
          <Plug size={16} aria-hidden />
          <span className="appnav__reveal">Integrations</span>
        </button>
        <button
          type="button"
          className="appnav__item"
          data-active={props.active === "settings" ? "true" : "false"}
          onClick={() => props.onNavigate("settings")}
        >
          <Settings size={16} aria-hidden />
          <span className="appnav__reveal">Settings</span>
        </button>
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
