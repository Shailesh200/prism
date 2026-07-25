import type { MapLayerId, MapZoomLevel, RepositoryMap } from "@prism/shared";
import { Input, Select, Textarea, ToggleGroup } from "@prism/ui";
import {
  AlertTriangle,
  Eye,
  FileSearch,
  Info,
  Lock,
  ScrollText,
  Settings2,
  Shield,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { AuditLogsPanel } from "./AuditLogsPanel.js";
import { isBrowserShell } from "./is-browser.js";
import {
  AUTO_REINDEX_INTERVAL_OPTIONS,
  MAX_FILE_SIZE_OPTIONS,
  MONO_FONT_OPTIONS,
  SANS_FONT_OPTIONS,
  applyAppearance,
  autoReindexIntervalMs,
  defaultExcludeGlobs,
  loadSettings,
  saveSettings,
  type AutoReindexInterval,
  type MaxFileSizeOption,
  type PrismDensity,
  type PrismMonoFont,
  type PrismSansFont,
  type PrismTheme,
} from "./settings-store.js";

/** Which host is rendering the shell. Controls surface-specific affordances. */
export type SettingsSurface = "extension" | "browser" | "playground";

export type SettingsSection =
  | "general"
  | "indexing"
  | "appearance"
  | "privacy"
  | "audit";

export type SettingsScreenProps = {
  root: string;
  /** Controlled display name shown in the sidebar. */
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  /** Fallback path-derived label when displayName is empty (for subtitle only). */
  repoLabel: string;
  branch?: string | undefined;
  user?: AppSidebarUser | null;
  map: RepositoryMap;
  /** True when root matches playground auto-detect / defaultRoot. */
  autoDetected?: boolean;
  /**
   * Host surface. When `extension`/`browser` the repo-root input is hidden
   * (Prism always indexes the extension's workspace). Falls back to
   * {@link isBrowserShell} when omitted.
   */
  surface?: SettingsSurface;
  zoom: MapZoomLevel;
  layers: readonly MapLayerId[];
  indexing?: boolean;
  initialSection?: SettingsSection;
  /** Pre-select an audit category when opening the Audit section. */
  initialAuditCategory?: string;
  onZoomChange: (zoom: MapZoomLevel) => void;
  onLayersChange: (layers: MapLayerId[]) => void;
  onApplyWorkspace: (path: string) => void;
  onReindex: () => void;
  /** Clears domain cache, audit log, and requests host clear. */
  onClearData?: () => void;
  /**
   * Notify host to start/stop workspace file watcher (extension). The optional
   * `intervalMs` carries the chosen debounce window.
   */
  onAutoReindexChange?: (enabled: boolean, intervalMs?: number) => void;
  allowNetworkIntegrations?: boolean;
  onNetworkIntegrationsChange?: (enabled: boolean) => void;
  /** Notify host that local-only analysis was toggled (host may halt indexing). */
  onLocalOnlyAnalysisChange?: (enabled: boolean) => void;
  onNavigate: (view: AppView) => void;
};

const ZOOM_OPTIONS: readonly { value: MapZoomLevel; label: string }[] = [
  { value: "repo", label: "repo" },
  { value: "package", label: "package" },
  { value: "feature", label: "feature" },
  { value: "file", label: "file" },
  { value: "symbol", label: "symbol" },
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

const CLEAR_DATA_WARNING =
  "This erases all local Prism data for this workspace — the cache database, .prism/remote-ci and .prism/tools, the audit log, stored settings, integrations, and domain-run cache. This cannot be undone.";

/** Modal shape for the confirmation dialog. */
type PendingModal = {
  readonly title: string;
  readonly body: ReactNode;
  readonly confirmLabel: string;
  readonly tone: "danger" | "warning";
  readonly onConfirm: () => void;
};

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
  const [stored, setStored] = useState(loadSettings);
  const [modal, setModal] = useState<PendingModal | null>(null);
  const pathId = useId();
  const excludeId = useId();

  const density = stored.density;
  const theme = stored.theme;
  const monoFont = stored.monoFont;
  const sansFont = stored.sansFont;
  const autoReindex = stored.autoReindex;
  const autoReindexInterval = stored.autoReindexInterval;
  const maxFileSize = stored.maxFileSize;
  const telemetry = stored.telemetry;
  const localOnly = stored.localOnlyAnalysis;
  const networkEnabled =
    props.allowNetworkIntegrations ?? stored.allowNetworkIntegrations;
  const noLimit = maxFileSize === "none";

  // Hide the repo-root input outside the playground: the extension / system
  // browser bridge always indexes the extension's own workspace.
  const showRepoRoot = props.surface
    ? props.surface === "playground"
    : !isBrowserShell();

  useEffect(() => {
    setDraftPath(props.root);
    setEditingPath(false);
  }, [props.root]);

  useEffect(() => {
    if (props.initialSection) setSection(props.initialSection);
  }, [props.initialSection]);

  useEffect(() => {
    applyAppearance({ theme, density, monoFont, sansFont });
  }, [theme, density, monoFont, sansFont]);

  // Prefill the exclude textarea with sensible defaults on first use.
  useEffect(() => {
    const current = loadSettings();
    if (current.excludeGlobs.trim().length === 0) {
      setStored(saveSettings({ excludeGlobs: defaultExcludeGlobs() }));
    }
  }, []);

  const patchSettings = (
    patch: Parameters<typeof saveSettings>[0],
  ): ReturnType<typeof saveSettings> => {
    const next = saveSettings(patch);
    setStored(next);
    return next;
  };

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

  const setAutoReindex = (enabled: boolean) => {
    if (enabled && noLimit) return;
    const next = patchSettings({ autoReindex: enabled });
    props.onAutoReindexChange?.(
      next.autoReindex,
      autoReindexIntervalMs(next.autoReindexInterval),
    );
  };

  const setAutoReindexInterval = (value: AutoReindexInterval) => {
    const next = patchSettings({ autoReindexInterval: value });
    if (next.autoReindex) {
      props.onAutoReindexChange?.(true, autoReindexIntervalMs(value));
    }
  };

  const setMaxFileSize = (value: MaxFileSizeOption) => {
    const next = patchSettings({ maxFileSize: value });
    if (value === "none" && stored.autoReindex) {
      props.onAutoReindexChange?.(false);
    } else if (next.autoReindex !== stored.autoReindex) {
      props.onAutoReindexChange?.(
        next.autoReindex,
        autoReindexIntervalMs(next.autoReindexInterval),
      );
    }
  };

  const setMonoFont = (value: PrismMonoFont) => {
    patchSettings({ monoFont: value });
  };

  const setSansFont = (value: PrismSansFont) => {
    patchSettings({ sansFont: value });
  };

  const commitNetwork = (enabled: boolean) => {
    patchSettings({ allowNetworkIntegrations: enabled });
    props.onNetworkIntegrationsChange?.(enabled);
  };

  const setNetwork = (enabled: boolean) => {
    // Warn on BOTH enabling and disabling network integrations.
    setModal({
      title: enabled
        ? "Allow network integrations?"
        : "Turn off network integrations?",
      body: enabled
        ? "Network integrations let opt-in forge / lab connectors reach external services. Core analysis always stays local; only the connectors you explicitly enable will make network calls."
        : "Turning this off is the master kill switch. Any integrations you already connected will stop syncing until you allow network integrations again.",
      confirmLabel: enabled ? "Allow" : "Turn off",
      tone: "warning",
      onConfirm: () => commitNetwork(enabled),
    });
  };

  const setLocalOnly = (enabled: boolean) => {
    setModal({
      title: enabled
        ? "Enable local-only analysis?"
        : "Disable local-only analysis?",
      body: enabled
        ? "Local-only analysis keeps every Core operation on this machine. Prism will stop live indexing while local-only mode is active; re-index manually when you need a fresh snapshot."
        : "Disabling local-only analysis lets non-local features run. Core analysis itself still never uploads your code, but you're opting out of the strict local guarantee.",
      confirmLabel: enabled ? "Enable" : "Disable",
      tone: "warning",
      onConfirm: () => {
        patchSettings({ localOnlyAnalysis: enabled });
        props.onLocalOnlyAnalysisChange?.(enabled);
      },
    });
  };

  const onClearData = () => {
    if (!props.onClearData) return;
    setModal({
      title: "Clear all Prism data?",
      body: CLEAR_DATA_WARNING,
      confirmLabel: "Clear Data",
      tone: "danger",
      onConfirm: () => {
        props.onClearData?.();
        // Reflect the wipe locally so the UI resets to defaults immediately.
        setStored(loadSettings());
      },
    });
  };

  const sidebarLabel = props.displayName.trim() || props.repoLabel;
  const subtitle = [sidebarLabel, props.branch].filter(Boolean).join(" · ");

  return (
    <div
      className={shellRootClass()}
      data-density={density}
      data-prism-density={density}
    >
      <AppSidebar
        variant={shellNavVariant()}
        active="settings"
        repoLabel={sidebarLabel}
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
                  {showRepoRoot ? (
                    <SettingsRow
                      label="Repository root"
                      help="Absolute path Prism indexes. Change to switch workspaces."
                    >
                      {editingPath ? (
                        <form className="set-path" onSubmit={onSubmitPath}>
                          <Input
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
                  ) : null}
                  <SettingsRow
                    label="Display name"
                    help="Short label shown in the sidebar. Leave blank to use the path-derived name."
                  >
                    <Input
                      className="set-input"
                      value={props.displayName}
                      onChange={(e) =>
                        props.onDisplayNameChange(e.target.value)
                      }
                      placeholder={props.repoLabel}
                      spellCheck={false}
                      aria-label="Display name"
                    />
                  </SettingsRow>
                  {props.onClearData ? (
                    <SettingsRow label="Clear Data" help={CLEAR_DATA_WARNING}>
                      <button
                        type="button"
                        className="ov-btn ov-btn--danger"
                        onClick={onClearData}
                      >
                        Clear Data
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
                      label="Auto Re-Index"
                      help="Watch the workspace and re-index after file changes (debounced)."
                    >
                      <div className="set-control-stack">
                        <Toggle
                          checked={autoReindex && !noLimit}
                          disabled={noLimit}
                          label={autoReindex && !noLimit ? "On" : "Off"}
                          onChange={setAutoReindex}
                        />
                        {autoReindex && !noLimit ? (
                          <label className="set-inline-field">
                            <span className="set-inline-field__label">
                              Debounce
                            </span>
                            <Select
                              options={AUTO_REINDEX_INTERVAL_OPTIONS.map(
                                (o) => ({ value: o.value, label: o.label }),
                              )}
                              value={autoReindexInterval}
                              onChange={(v) =>
                                setAutoReindexInterval(v as AutoReindexInterval)
                              }
                              aria-label="Auto re-index debounce interval"
                            />
                          </label>
                        ) : null}
                        {noLimit ? (
                          <InfoNote>
                            Auto Re-Index is disabled while Max file size is
                            &quot;No limit&quot; — indexing large trees on every
                            change would be too slow.
                          </InfoNote>
                        ) : null}
                      </div>
                    </SettingsRow>
                    <SettingsRow
                      label="Exclude"
                      help="Gitignore-style globs, one per line. Applied on next index when Core ignore API is wired."
                    >
                      <div className="set-control-stack set-control-stack--wide">
                        <Textarea
                          id={excludeId}
                          className="set-textarea"
                          value={stored.excludeGlobs}
                          onChange={(e) =>
                            patchSettings({ excludeGlobs: e.target.value })
                          }
                          rows={4}
                          spellCheck={false}
                          placeholder={"node_modules/**\n.dist/**\n**/*.min.js"}
                          aria-label="Exclude globs"
                        />
                        <InfoNote>
                          Stored locally. Applied on next index when Core ignore
                          API is wired.
                        </InfoNote>
                      </div>
                    </SettingsRow>
                    <SettingsRow
                      label="Max file size"
                      help="Skip files larger than this threshold during indexing."
                    >
                      <div className="set-control-stack">
                        <Select
                          options={MAX_FILE_SIZE_OPTIONS.map((o) => ({
                            value: o.value,
                            label: o.label,
                          }))}
                          value={maxFileSize}
                          onChange={(v) =>
                            setMaxFileSize(v as MaxFileSizeOption)
                          }
                          aria-label="Max file size"
                        />
                        {noLimit ? (
                          <InfoNote>
                            No limit can make indexing slow on large
                            repositories. Auto Re-Index stays off in this mode.
                          </InfoNote>
                        ) : null}
                      </div>
                    </SettingsRow>
                  </SettingsCard>

                  <SettingsCard title="Map defaults">
                    <SettingsRow
                      label="Default zoom"
                      help="Starting zoom level when the repository map reloads."
                    >
                      <div className="set-control-stack">
                        <Select
                          options={ZOOM_OPTIONS}
                          value={props.zoom}
                          onChange={(v) =>
                            props.onZoomChange(v as MapZoomLevel)
                          }
                          aria-label="Default map zoom"
                        />
                      </div>
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
                    help="Light, dark, or follow the system preference."
                  >
                    <ToggleGroup
                      aria-label="Theme"
                      value={theme}
                      onChange={(id) =>
                        patchSettings({ theme: id as PrismTheme })
                      }
                      options={[
                        { id: "light", label: "Light" },
                        { id: "dark", label: "Dark" },
                        { id: "system", label: "System" },
                      ]}
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Density"
                    help="Comfortable vs compact spacing. Stored in this browser only."
                  >
                    <ToggleGroup
                      aria-label="Density"
                      value={density}
                      onChange={(id) =>
                        patchSettings({ density: id as PrismDensity })
                      }
                      options={[
                        { id: "comfortable", label: "Comfortable" },
                        { id: "compact", label: "Compact" },
                      ]}
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="App font"
                    help="Sans family for UI chrome (titles, labels, body)."
                  >
                    <FontSelect
                      value={sansFont}
                      onChange={setSansFont}
                      options={SANS_FONT_OPTIONS}
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Code font"
                    help="Monospace family for paths, metrics, diffs, and map technical labels."
                  >
                    <FontSelect
                      value={monoFont}
                      onChange={setMonoFont}
                      options={MONO_FONT_OPTIONS}
                    />
                  </SettingsRow>
                </SettingsCard>
              ) : null}

              {section === "privacy" ? (
                <SettingsCard title="Privacy">
                  <SettingsRow
                    label="Local-only analysis"
                    help="Keep every Core operation on this machine. Live indexing pauses while enabled."
                  >
                    <div className="set-control-stack">
                      <Toggle
                        checked={localOnly}
                        label={localOnly ? "On" : "Off"}
                        onChange={setLocalOnly}
                      />
                      {localOnly ? (
                        <InfoNote>
                          Indexing stops while local-only mode is on — re-index
                          manually from the Indexing tab when you need a
                          refresh.
                        </InfoNote>
                      ) : null}
                    </div>
                  </SettingsRow>
                  <SettingsRow
                    label="Allow network integrations"
                    help="Master gate for opt-in forge / lab connectors (ADR-0024)."
                  >
                    <Toggle
                      checked={networkEnabled}
                      label={networkEnabled ? "On" : "Off"}
                      onChange={setNetwork}
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="Telemetry"
                    help="Opt-in anonymous local counters. No network upload in v1."
                  >
                    <div className="set-control-stack">
                      <Toggle
                        checked={telemetry}
                        label={telemetry ? "On" : "Off"}
                        onChange={(on) => patchSettings({ telemetry: on })}
                      />
                      {telemetry ? (
                        <InfoNote>
                          Anonymous local counters only in v1 — no network
                          upload until a future release.
                        </InfoNote>
                      ) : null}
                    </div>
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
                <AuditLogsPanel
                  repoLabel={sidebarLabel}
                  root={props.root}
                  {...(props.initialAuditCategory === "index" ||
                  props.initialAuditCategory === "analysis" ||
                  props.initialAuditCategory === "dna" ||
                  props.initialAuditCategory === "git" ||
                  props.initialAuditCategory === "test" ||
                  props.initialAuditCategory === "cache" ||
                  props.initialAuditCategory === "impact" ||
                  props.initialAuditCategory === "integration"
                    ? { initialCategory: props.initialAuditCategory }
                    : {})}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {modal ? (
        <WarningModal
          modal={modal}
          onClose={() => setModal(null)}
          onConfirm={() => {
            modal.onConfirm();
            setModal(null);
          }}
        />
      ) : null}
    </div>
  );
}

function FontSelect<T extends string>(props: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string; stack: string }[];
}): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current =
    props.options.find((o) => o.value === props.value) ?? props.options[0]!;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="set-fontsel" ref={rootRef}>
      <button
        type="button"
        className="set-fontsel__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ fontFamily: current.stack }}
      >
        {current.label}
      </button>
      {open ? (
        <ul className="set-fontsel__menu" role="listbox">
          {props.options.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === props.value}
            >
              <button
                type="button"
                className="set-fontsel__opt"
                data-active={o.value === props.value ? "true" : "false"}
                style={{ fontFamily: o.stack }}
                onClick={() => {
                  props.onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WarningModal(props: {
  modal: PendingModal;
  onClose: () => void;
  onConfirm: () => void;
}): ReactElement {
  const { modal } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <div
      className="set-modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        className="set-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={modal.title}
        data-tone={modal.tone}
      >
        <div className="set-modal__head">
          <span className="set-modal__icon" data-tone={modal.tone}>
            <AlertTriangle size={18} aria-hidden />
          </span>
          <h3 className="set-modal__title">{modal.title}</h3>
          <button
            type="button"
            className="set-modal__close"
            aria-label="Close"
            onClick={props.onClose}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="set-modal__body">{modal.body}</div>
        <div className="set-modal__actions">
          <button
            type="button"
            className="ov-btn ov-btn--ghost"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={
              modal.tone === "danger" ? "ov-btn ov-btn--danger" : "ov-btn"
            }
            onClick={props.onConfirm}
            autoFocus
          >
            {modal.confirmLabel}
          </button>
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

function InfoNote(props: { children: ReactNode }): ReactElement {
  return (
    <p className="set-info" role="note">
      <Info size={13} aria-hidden />
      <span>{props.children}</span>
    </p>
  );
}

function Toggle(props: {
  checked: boolean;
  locked?: boolean;
  disabled?: boolean;
  label: string;
  onChange?: (checked: boolean) => void;
}): ReactElement {
  const interactive =
    Boolean(props.onChange) && !props.locked && !props.disabled;
  const common = {
    className: "set-toggle",
    "data-on": props.checked ? "true" : "false",
    "data-locked": props.locked ? "true" : "false",
    "data-disabled": props.disabled ? "true" : "false",
    title: props.locked
      ? "Locked by product policy"
      : props.disabled
        ? "Unavailable with current settings"
        : undefined,
  } as const;

  const body = (
    <>
      <span className="set-toggle__track" aria-hidden>
        <span className="set-toggle__knob" />
      </span>
      <span className="set-toggle__text">{props.label}</span>
      {props.locked ? <Lock size={11} aria-hidden /> : null}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        {...common}
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        onClick={() => props.onChange?.(!props.checked)}
      >
        {body}
      </button>
    );
  }

  return (
    <span
      {...common}
      role="status"
      aria-label={`${props.label}${props.locked ? " (locked)" : ""}${props.disabled ? " (disabled)" : ""}`}
    >
      {body}
    </span>
  );
}
