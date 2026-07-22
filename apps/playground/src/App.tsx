import { RepositoryMapView } from "@prism/ui";
import type {
  GitActivity,
  HealthScore,
  MapBookmark,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
} from "@prism/shared";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import {
  fetchGitActivity,
  fetchHealth,
  fetchPresets,
  fetchRepositoryMap,
  type PlaygroundPreset,
} from "./map-client.js";
import { OverviewScreen } from "./OverviewScreen.js";
import { AppSidebar } from "./AppSidebar.js";

export function App(): ReactElement {
  const [zoom, setZoom] = useState<MapZoomLevel>("package");
  const [root, setRoot] = useState<string | null>(null);
  const [draftRoot, setDraftRoot] = useState("");
  const [presets, setPresets] = useState<PlaygroundPreset[]>([]);
  const [map, setMap] = useState<RepositoryMap | null>(null);
  const [bookmarks, setBookmarks] = useState<MapBookmark[]>([]);
  const [layers, setLayers] = useState<MapLayerId[]>([
    "architecture",
    "dependency",
  ]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"map" | "overview">("overview");
  const [gitActivity, setGitActivity] = useState<GitActivity | null>(null);
  const [health, setHealth] = useState<HealthScore | null>(null);
  const [gitStatus, setGitStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  const refreshGit = useCallback((target: string | null) => {
    if (!target) return;
    setGitStatus("loading");
    void fetchGitActivity(target).then((data) => {
      setGitActivity(data);
      setGitStatus(data ? "ready" : "error");
    });
    void fetchHealth(target).then((data) => {
      setHealth(data);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPresets().then((data) => {
      if (cancelled || !data) return;
      setPresets(data.presets);
      setRoot((prev) => prev ?? data.defaultRoot);
      setDraftRoot((prev) => prev || data.defaultRoot);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchRepositoryMap(zoom, root, layers)
      .then((next) => {
        if (!cancelled) setMap(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [zoom, root, layers.join(",")]);

  useEffect(() => {
    if (!root) return;
    refreshGit(root);
  }, [root, refreshGit]);

  const openRoot = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return;
    setDraftRoot(trimmed);
    setRoot(trimmed);
    setZoom("package");
    setBookmarks([]);
    setMap(null);
    setGitActivity(null);
    setHealth(null);
  };

  const onSubmitPath = (event: FormEvent) => {
    event.preventDefault();
    openRoot(draftRoot);
  };

  const activePreset = presets.find((p) => p.root === root)?.id ?? null;
  const rootLabel =
    presets.find((p) => p.root === root)?.label ?? root ?? "Repository";

  if (error && !map) {
    return (
      <div className="prism-boot prism-theme">
        <img src="/brand/prism-mark.png" alt="" width={28} height={28} />
        <p className="prism-boot__brand">Prism</p>
        <p className="prism-boot__msg">Could not load map</p>
        <p className="prism-boot__detail">{error}</p>
        <form
          className="playground-open playground-open--boot"
          onSubmit={onSubmitPath}
        >
          <input
            value={draftRoot}
            onChange={(e) => setDraftRoot(e.target.value)}
            placeholder="/absolute/path/to/repo"
            spellCheck={false}
          />
          <button type="submit">Open</button>
        </form>
      </div>
    );
  }

  if (!map || !root) {
    return (
      <div className="prism-boot prism-theme">
        <img src="/brand/prism-mark.png" alt="" width={28} height={28} />
        <p className="prism-boot__brand">Prism</p>
        <p className="prism-boot__msg">
          {loading ? "Indexing repository…" : "Charting repository…"}
        </p>
        {root ? <p className="prism-boot__detail">{rootLabel}</p> : null}
      </div>
    );
  }

  return (
    <div className="playground-shell">
      <form className="playground-open" onSubmit={onSubmitPath}>
        <span className="playground-open__label">Open</span>
        <div className="playground-open__presets">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-active={activePreset === preset.id ? "true" : "false"}
              onClick={() => openRoot(preset.root)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <input
          value={draftRoot}
          onChange={(e) => setDraftRoot(e.target.value)}
          placeholder="/absolute/path/to/repo"
          spellCheck={false}
          title={root}
        />
        <button type="submit">Go</button>
        {loading ? (
          <span className="playground-open__status">Indexing…</span>
        ) : error ? (
          <span className="playground-open__status playground-open__status--err">
            {error}
          </span>
        ) : (
          <span className="playground-open__status">{rootLabel}</span>
        )}
      </form>

      <div className="playground-shell__map">
        {view === "overview" ? (
          <OverviewScreen
            map={map}
            repoLabel={rootLabel}
            gitActivity={gitActivity}
            gitStatus={gitStatus}
            health={health}
            onOpenMap={() => setView("map")}
            onRefresh={() => refreshGit(root)}
          />
        ) : (
          <div className="playground-map-wrap">
            <div className="playground-map-inner">
              <RepositoryMapView
                map={map}
                bookmarks={bookmarks}
                brandMarkSrc="/brand/prism-mark.png"
                showBrand={false}
                branch={gitActivity?.summary?.branch ?? undefined}
                recentChanges={gitActivity?.recentFiles ?? []}
                onZoomChange={setZoom}
                onLayersChange={(next) => setLayers([...next])}
                onAddBookmark={(label, nodeId) => {
                  const bookmark: MapBookmark = {
                    id: `bookmark:${nodeId}:${Date.now()}`,
                    label,
                    nodeId,
                    zoom,
                    createdAt: new Date().toISOString(),
                  };
                  setBookmarks((prev) => [...prev, bookmark]);
                }}
              />
            </div>
            <AppSidebar
              variant="rail"
              active="map"
              repoLabel={rootLabel}
              user={gitActivity?.recentCommits[0] ?? null}
              onNavigate={(v) => setView(v)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
