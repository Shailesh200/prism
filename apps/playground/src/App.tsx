import { RepositoryMapView } from "@prism/ui";
import type {
  DnaReport,
  GitActivity,
  GraphSnapshotDto,
  HealthScore,
  MapBookmark,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
  UtilityOverlayReport,
  BackendReport,
} from "@prism/shared";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import {
  fetchBackendReport,
  fetchDependencyGraph,
  fetchDna,
  fetchGitActivity,
  fetchHealth,
  fetchOverlay,
  fetchPresets,
  fetchRepositoryMap,
  type PlaygroundPreset,
} from "./map-client.js";
import { OverviewScreen } from "./OverviewScreen.js";
import { AppSidebar } from "./AppSidebar.js";
import { DnaScreen } from "./DnaScreen.js";
import { DomainsScreen } from "./DomainsScreen.js";
import { DomainScreen, type DomainOverlayStatus } from "./DomainScreen.js";
import { BlastRadiusScreen } from "./BlastRadiusScreen.js";
import { TrendsScreen } from "./TrendsScreen.js";
import { IntegrationsScreen } from "./IntegrationsScreen.js";
import { SettingsScreen } from "./SettingsScreen.js";

/** A cached domain analysis run so re-opening a domain doesn't re-analyze. */
type DomainRun = {
  overlay: UtilityOverlayReport;
  security: UtilityOverlayReport | null;
  qa: UtilityOverlayReport | null;
  depGraph: GraphSnapshotDto | null;
  backendReport: BackendReport | null;
};

function domainRunKey(root: string, domainId: string): string {
  return `prism.domain-run.${root}.${domainId}`;
}

function loadDomainRun(root: string, domainId: string): DomainRun | null {
  try {
    const raw = localStorage.getItem(domainRunKey(root, domainId));
    return raw ? (JSON.parse(raw) as DomainRun) : null;
  } catch {
    return null;
  }
}

function saveDomainRun(root: string, domainId: string, run: DomainRun): void {
  try {
    localStorage.setItem(domainRunKey(root, domainId), JSON.stringify(run));
  } catch {
    // Ignore quota / serialization failures — cache is best-effort.
  }
}

export function App(): ReactElement {
  const [zoom, setZoom] = useState<MapZoomLevel>("package");
  const [root, setRoot] = useState<string | null>(null);
  const [draftRoot, setDraftRoot] = useState("");
  const [presets, setPresets] = useState<PlaygroundPreset[]>([]);
  const [defaultRoot, setDefaultRoot] = useState<string | null>(null);
  const [map, setMap] = useState<RepositoryMap | null>(null);
  const [bookmarks, setBookmarks] = useState<MapBookmark[]>([]);
  const [layers, setLayers] = useState<MapLayerId[]>([
    "architecture",
    "dependency",
  ]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<
    | "map"
    | "overview"
    | "dna"
    | "profile"
    | "domains"
    | "domain"
    | "blast"
    | "trends"
    | "integrations"
    | "settings"
  >("overview");
  const [gitActivity, setGitActivity] = useState<GitActivity | null>(null);
  const [health, setHealth] = useState<HealthScore | null>(null);
  const [dna, setDna] = useState<DnaReport | null>(null);
  const [gitStatus, setGitStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [activeDomain, setActiveDomain] = useState<string>("backend");
  const [overlay, setOverlay] = useState<UtilityOverlayReport | null>(null);
  const [overlayStatus, setOverlayStatus] =
    useState<DomainOverlayStatus>("idle");
  const [securityOverlay, setSecurityOverlay] =
    useState<UtilityOverlayReport | null>(null);
  const [qaOverlay, setQaOverlay] = useState<UtilityOverlayReport | null>(null);
  const [depGraph, setDepGraph] = useState<GraphSnapshotDto | null>(null);
  const [backendReport, setBackendReport] = useState<BackendReport | null>(
    null,
  );
  const domainRuns = useRef<Map<string, DomainRun>>(new Map());

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
    void fetchDna(target).then((data) => {
      setDna(data);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPresets().then((data) => {
      if (cancelled || !data) return;
      setPresets(data.presets);
      setDefaultRoot(data.defaultRoot);
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

  const runOverlay = useCallback(
    (kind: string) => {
      if (!root) return;
      const enrichBackend = activeDomain === "backend";
      const enrichMobile = activeDomain === "mobile";
      const enrichDesktop = activeDomain === "desktop";
      setOverlayStatus("loading");
      void Promise.all([
        fetchOverlay(kind, root),
        enrichBackend
          ? fetchOverlay("security-surface", root)
          : Promise.resolve(null),
        enrichBackend || enrichMobile
          ? fetchOverlay("qa-test-gaps", root)
          : Promise.resolve(null),
        enrichBackend || enrichMobile || enrichDesktop
          ? fetchDependencyGraph(root)
          : Promise.resolve(null),
        enrichBackend ? fetchBackendReport(root) : Promise.resolve(null),
      ]).then(([main, security, qa, graph, backend]) => {
        setOverlay(main);
        setSecurityOverlay(security);
        setQaOverlay(qa);
        setDepGraph(graph);
        setBackendReport(backend);
        setOverlayStatus(main ? "ready" : "error");
        if (main) {
          const run: DomainRun = {
            overlay: main,
            security,
            qa,
            depGraph: graph,
            backendReport: backend,
          };
          domainRuns.current.set(domainRunKey(root, activeDomain), run);
          saveDomainRun(root, activeDomain, run);
        }
      });
    },
    [root, activeDomain],
  );

  const openDomain = useCallback(
    (domainId: string) => {
      setActiveDomain(domainId);
      const cached = root
        ? (domainRuns.current.get(domainRunKey(root, domainId)) ??
          loadDomainRun(root, domainId))
        : null;
      if (cached && (domainId !== "backend" || "backendReport" in cached)) {
        setOverlay(cached.overlay);
        setSecurityOverlay(cached.security);
        setQaOverlay(cached.qa);
        setDepGraph(cached.depGraph);
        setBackendReport(cached.backendReport ?? null);
        setOverlayStatus("ready");
      } else {
        setOverlay(null);
        setSecurityOverlay(null);
        setQaOverlay(null);
        setDepGraph(null);
        setBackendReport(null);
        setOverlayStatus("idle");
      }
      setView("domain");
    },
    [root],
  );

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
    setDna(null);
    setOverlay(null);
    setSecurityOverlay(null);
    setQaOverlay(null);
    setDepGraph(null);
    setBackendReport(null);
    setOverlayStatus("idle");
  };

  const onSubmitPath = (event: FormEvent) => {
    event.preventDefault();
    openRoot(draftRoot);
  };

  const rootLabel =
    presets.find((p) => p.root === root)?.label ??
    root?.split("/").filter(Boolean).pop() ??
    "Repository";

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
            placeholder="Absolute path to repository"
            aria-label="Absolute path to repository"
            spellCheck={false}
          />
          <button type="submit">Start Indexing</button>
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
        <label className="playground-open__label" htmlFor="playground-root">
          Repository path
        </label>
        <input
          id="playground-root"
          value={draftRoot}
          onChange={(e) => setDraftRoot(e.target.value)}
          placeholder="Absolute path to repository (auto-detected)"
          spellCheck={false}
          title={root}
        />
        <button type="submit">Start Indexing</button>
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
            dna={dna}
            onOpenMap={() => setView("map")}
            onOpenDna={() => setView("dna")}
            onOpenProfile={() => setView("profile")}
            onOpenDomains={() => setView("domains")}
            onOpenBlast={() => setView("blast")}
            onOpenTrends={() => setView("trends")}
            onOpenIntegrations={() => setView("integrations")}
            onOpenSettings={() => setView("settings")}
            onRefresh={() => refreshGit(root)}
          />
        ) : view === "dna" || view === "profile" ? (
          <DnaScreen
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            dna={dna}
            health={health}
            map={map}
            mode={view === "profile" ? "profile" : "analysis"}
            onNavigate={(v) => setView(v)}
            onOpenDomain={openDomain}
          />
        ) : view === "domains" ? (
          <DomainsScreen
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            dna={dna}
            onNavigate={(v) => setView(v)}
            onOpenDomain={openDomain}
          />
        ) : view === "domain" ? (
          <DomainScreen
            domainId={activeDomain}
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            overlay={overlay}
            status={overlayStatus}
            security={securityOverlay}
            qa={qaOverlay}
            depGraph={depGraph}
            backendReport={backendReport}
            gitActivity={gitActivity}
            dna={dna}
            onRun={runOverlay}
            onNavigate={(v) => setView(v)}
          />
        ) : view === "blast" ? (
          <BlastRadiusScreen
            root={root}
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            onNavigate={(v) => setView(v)}
          />
        ) : view === "trends" ? (
          <TrendsScreen
            map={map}
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            gitActivity={gitActivity}
            gitStatus={gitStatus}
            health={health}
            onNavigate={(v) => setView(v)}
          />
        ) : view === "integrations" ? (
          <IntegrationsScreen
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            onNavigate={(v) => setView(v)}
          />
        ) : view === "settings" ? (
          <SettingsScreen
            root={root}
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            map={map}
            autoDetected={defaultRoot !== null && root === defaultRoot}
            zoom={zoom}
            layers={layers}
            indexing={loading}
            onZoomChange={setZoom}
            onLayersChange={(next) => setLayers([...next])}
            onApplyWorkspace={openRoot}
            onReindex={() => {
              setLoading(true);
              void fetchRepositoryMap(zoom, root, layers)
                .then((next) => setMap(next))
                .finally(() => setLoading(false));
              refreshGit(root);
            }}
            onClearDomainCache={() => {
              domainRuns.current.clear();
              try {
                const prefix = `prism.domain-run.${root}.`;
                const keys: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (k?.startsWith(prefix)) keys.push(k);
                }
                for (const k of keys) localStorage.removeItem(k);
              } catch {
                /* ignore */
              }
            }}
            onNavigate={(v) => setView(v)}
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
