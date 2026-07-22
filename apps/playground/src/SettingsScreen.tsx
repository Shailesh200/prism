import type { MapLayerId, MapZoomLevel, RepositoryMap } from "@prism/shared";
import {
  Eye,
  FileSearch,
  Lock,
  ScrollText,
  Settings2,
  Shield,
} from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { AuditLogsPanel } from "./AuditLogsPanel.js";
import "./overview.css";

export type SettingsSection =
  | "general"
  | "indexing"
  | "appearance"
  | "privacy"
  | "audit";

export type SettingsScreenProps = {
  root: string;
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  map: RepositoryMap;
  /** True when root matches playground auto-detect / defaultRoot. */
  autoDetected?: boolean;
  zoom: MapZoomLevel;
  layers: readonly MapLayerId[];
  indexing?: boolean;
  initialSection?: SettingsSection;
  onZoomChange: (zoom: MapZoomLevel) => void;
  onLayersChange: (layers: MapLayerId[]) => void;
  onApplyWorkspace: (path: string) => void;
  onReindex: () => void;
  onClearDomainCache?: () => void;
  onNavigate: (view: AppView) => void;
};

type Density = "comfortable" | "compact";

const DENSITY_KEY = "prism.playground.density";
const ZOOM_OPTIONS: readonly MapZoomLevel[] = [
  "repo",
  "package",
  "feature",
  "file",
  "symbol",
];
const LAYER_OPTIONS: readonly { id: MapLayerId; label: string }[] = [
  { id: "architecture", label: "Architecture" },
  { id: "dependency", label: "Dependency" },
  { id: "activity", label: "Activity" },
  { id: "ownership", label: "Ownership" },
  { id: "debt", label: "Debt" },
  { id: "risk", label: "Risk" },
  { id: "performance", label: "Performance" },
  { id: "coverage", label: "Coverage" },
];

const SECTIONS: readonly {
  id: SettingsSection;
  label: string;
  icon: typeof Settings2;
}[] = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "indexing", label: "Indexing", icon: FileSearch },
  { id: "appearance", label: "Appearance", icon: Eye },
  { id: "privacy", label: "Privacy", icon: Shield },
  { id: "audit", label: "Audit Logs", icon: ScrollText },
];

function loadDensity(): Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    return v === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function relativeTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const delta = Date.now() - ms;
  const mins = Math.round(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(ms).toLocaleString();
}

export function SettingsScreen(props: SettingsScreenProps): ReactElement {
  const [section, setSection] = useState<SettingsSection>(
    props.initialSection ?? "general",
  );
  const [draftPath, setDraftPath] = useState(props.root);
  const [editingPath, setEditingPath] = useState(false);
  const [density, setDensity] = useState<Density>(loadDensity);
  const pathId = useId();

  useEffect(() => {
    setDraftPath(props.root);
    setEditingPath(false);
  }, [props.root]);

  useEffect(() => {
    if (props.initialSection) setSection(props.initialSection);
  }, [props.initialSection]);

  useEffect(() => {
    document.documentElement.dataset.prismDensity = density;
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* ignore */
    }
  }, [density]);

  const onSubmitPath = (e: FormEvent) => {
    e.preventDefault();
    const next = draftPath.trim();
    if (!next || next === props.root) {
      setEditingPath(false);
      return;
    }
    props.onApplyWorkspace(next);
    setEditingPath(false);
  };

  const toggleLayer = (id: MapLayerId) => {
    const has = props.layers.includes(id);
    if (has && props.layers.length === 1) return;
    const next = has
      ? props.layers.filter((l) => l !== id)
      : [...props.layers, id];
    props.onLayersChange(next);
  };

  const subtitle = [props.repoLabel, props.branch].filter(Boolean).join(" · ");

  return (
    <div className="ov ov--rail" data-density={density}>
      <AppSidebar
        variant="rail"
        active="settings"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        <header className="ov-top">
          <div>
            <div className="ov-top__title">Settings</div>
            <div className="ov-top__sub">
              {subtitle || "Workspace preferences"}
            </div>
          </div>
        </header>

        <div className="ov-scroll set-scroll">
          <div className="set-layout" data-section={section}>
            <nav className="set-nav" aria-label="Settings sections">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="set-nav__item"
                    data-active={section === s.id ? "true" : "false"}
                    onClick={() => setSection(s.id)}
                  >
                    <Icon size={15} aria-hidden />
                    {s.label}
                  </button>
                );
              })}
            </nav>

            <div className="set-panel">
              {section === "general" ? (
                <SettingsCard title="Workspace">
                  <SettingsRow
                    label="Repository root"
                    help="Absolute path Prism indexes. Change to switch workspaces."
                  >
                    {editingPath ? (
                      <form className="set-path" onSubmit={onSubmitPath}>
                        <input
                          id={pathId}
                          className="set-path__input"
                          value={draftPath}
                          onChange={(e) => setDraftPath(e.target.value)}
                          spellCheck={false}
                          aria-label="Repository path"
                          autoFocus
                        />
                        <button type="submit" className="ov-btn">
                          Apply
                        </button>
                        <button
                          type="button"
                          className="ov-btn ov-btn--ghost"
                          onClick={() => {
                            setDraftPath(props.root);
                            setEditingPath(false);
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="set-path-view">
                        <code
                          className="ov-mono set-path-view__mono"
                          title={props.root}
                        >
                          {props.root}
                        </code>
                        {props.autoDetected ? (
                          <span className="set-badge">Auto-detected</span>
                        ) : null}
                        <button
                          type="button"
                          className="ov-btn ov-btn--ghost"
                          onClick={() => setEditingPath(true)}
                        >
                          Change workspace
                        </button>
                      </div>
                    )}
                  </SettingsRow>
                  <SettingsRow
                    label="Display name"
                    help="Short label derived from the path or playground preset."
                  >
                    <span className="set-static">{props.repoLabel}</span>
                  </SettingsRow>
                  {props.onClearDomainCache ? (
                    <SettingsRow
                      label="Domain analysis cache"
                      help="Clears locally cached domain overlay runs for this browser."
                    >
                      <button
                        type="button"
                        className="ov-btn ov-btn--ghost"
                        onClick={props.onClearDomainCache}
                      >
                        Clear cache
                      </button>
                    </SettingsRow>
                  ) : null}
                </SettingsCard>
              ) : null}

              {section === "indexing" ? (
                <>
                  <SettingsCard title="Index">
                    <SettingsRow
                      label="Last indexed"
                      help="Timestamp from the current repository map snapshot."
                    >
                      <span className="set-static ov-mono">
                        {relativeTime(props.map.generatedAt)}
                        <span className="set-muted">
                          {" "}
                          ({new Date(props.map.generatedAt).toLocaleString()})
                        </span>
                      </span>
                    </SettingsRow>
                    <SettingsRow
                      label="Re-index now"
                      help="Rebuilds the map and refreshes health, DNA, and git signals."
                    >
                      <button
                        type="button"
                        className="ov-btn"
                        disabled={props.indexing}
                        onClick={props.onReindex}
                      >
                        {props.indexing ? "Indexing…" : "Re-index now"}
                      </button>
                    </SettingsRow>
                    <SettingsRow
                      label="Re-index on change"
                      help="Watch the filesystem and re-index automatically. Not wired in the playground yet."
                    >
                      <Toggle locked checked={false} label="Off" />
                    </SettingsRow>
                    <SettingsRow
                      label="Include / exclude"
                      help="Core uses built-in ignore rules (.git, node_modules, …). Custom globs are not configurable here yet."
                    >
                      <div className="set-chips">
                        <span className="set-chip">**/*</span>
                        <span className="set-chip set-chip--muted">
                          !node_modules/**
                        </span>
                        <span className="set-chip set-chip--muted">
                          !.git/**
                        </span>
                        <span className="set-chip set-chip--muted">
                          !dist/**
                        </span>
                      </div>
                    </SettingsRow>
                    <SettingsRow
                      label="Max file size"
                      help="Large-file skip threshold is owned by Core indexer defaults."
                    >
                      <span className="set-static set-muted">Core default</span>
                    </SettingsRow>
                  </SettingsCard>

                  <SettingsCard title="Map defaults">
                    <SettingsRow
                      label="Default zoom"
                      help="Starting zoom level when the repository map reloads."
                    >
                      <select
                        className="set-select"
                        value={props.zoom}
                        onChange={(e) =>
                          props.onZoomChange(e.target.value as MapZoomLevel)
                        }
                        aria-label="Default map zoom"
                      >
                        {ZOOM_OPTIONS.map((z) => (
                          <option key={z} value={z}>
                            {z}
                          </option>
                        ))}
                      </select>
                    </SettingsRow>
                    <SettingsRow
                      label="Active layers"
                      help="Layers requested when building the map. Stub layers may show empty."
                    >
                      <div className="set-chips set-chips--wrap">
                        {LAYER_OPTIONS.map((l) => {
                          const on = props.layers.includes(l.id);
                          return (
                            <button
                              key={l.id}
                              type="button"
                              className="set-chip set-chip--btn"
                              data-on={on ? "true" : "false"}
                              onClick={() => toggleLayer(l.id)}
                            >
                              {l.label}
                            </button>
                          );
                        })}
                      </div>
                    </SettingsRow>
                  </SettingsCard>
                </>
              ) : null}

              {section === "appearance" ? (
                <SettingsCard title="Appearance">
                  <SettingsRow
                    label="Theme"
                    help="Playground ships the Prism dark canvas only for now."
                  >
                    <div className="set-seg" role="group" aria-label="Theme">
                      <button
                        type="button"
                        className="set-seg__btn"
                        data-active="true"
                      >
                        Dark
                      </button>
                      <button
                        type="button"
                        className="set-seg__btn"
                        disabled
                        title="System theme follows later"
                      >
                        System
                      </button>
                    </div>
                  </SettingsRow>
                  <SettingsRow
                    label="Density"
                    help="Comfortable vs compact spacing. Stored in this browser only."
                  >
                    <div className="set-seg" role="group" aria-label="Density">
                      <button
                        type="button"
                        className="set-seg__btn"
                        data-active={
                          density === "comfortable" ? "true" : "false"
                        }
                        onClick={() => setDensity("comfortable")}
                      >
                        Comfortable
                      </button>
                      <button
                        type="button"
                        className="set-seg__btn"
                        data-active={density === "compact" ? "true" : "false"}
                        onClick={() => setDensity("compact")}
                      >
                        Compact
                      </button>
                    </div>
                  </SettingsRow>
                  <SettingsRow
                    label="Monospace"
                    help="Paths and metrics use JetBrains Mono."
                  >
                    <span className="set-static ov-mono">JetBrains Mono</span>
                  </SettingsRow>
                </SettingsCard>
              ) : null}

              {section === "privacy" ? (
                <SettingsCard title="Privacy">
                  <SettingsRow
                    label="Local-only analysis"
                    help="Core analysis never leaves this machine. Locked on by design."
                  >
                    <Toggle locked checked label="On" />
                  </SettingsRow>
                  <SettingsRow
                    label="Allow network integrations"
                    help="Opt-in forge / lab integrations stay off until you enable them under Integrations."
                  >
                    <Toggle locked checked={false} label="Off" />
                  </SettingsRow>
                  <SettingsRow
                    label="Telemetry"
                    help="Prism does not phone home. No usage telemetry is collected."
                  >
                    <Toggle locked checked={false} label="Off" />
                  </SettingsRow>
                  <div className="set-privacy-note">
                    <Lock size={14} aria-hidden />
                    <span>
                      Network features are explicit opt-ins — see{" "}
                      <button
                        type="button"
                        className="set-link"
                        onClick={() => props.onNavigate("integrations")}
                      >
                        Integrations
                      </button>
                      .
                    </span>
                  </div>
                </SettingsCard>
              ) : null}

              {section === "audit" ? (
                <AuditLogsPanel repoLabel={props.repoLabel} root={props.root} />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsCard(props: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="ov-card set-card">
      <h2 className="set-card__title">{props.title}</h2>
      <div className="set-card__body">{props.children}</div>
    </section>
  );
}

function SettingsRow(props: {
  label: string;
  help: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="set-row">
      <div className="set-row__copy">
        <div className="set-row__label">{props.label}</div>
        <div className="set-row__help">{props.help}</div>
      </div>
      <div className="set-row__control">{props.children}</div>
    </div>
  );
}

function Toggle(props: {
  checked: boolean;
  locked?: boolean;
  label: string;
}): ReactElement {
  return (
    <span
      className="set-toggle"
      data-on={props.checked ? "true" : "false"}
      data-locked={props.locked ? "true" : "false"}
      title={props.locked ? "Locked by product policy" : undefined}
      role="status"
      aria-label={`${props.label}${props.locked ? " (locked)" : ""}`}
    >
      <span className="set-toggle__track" aria-hidden>
        <span className="set-toggle__knob" />
      </span>
      <span className="set-toggle__text">{props.label}</span>
      {props.locked ? <Lock size={11} aria-hidden /> : null}
    </span>
  );
}
