import { RepositoryMapView } from "@prism/ui";
import {
  AppShellClientProvider,
  AppSidebar,
  BlastRadiusScreen,
  ChangeReviewScreen,
  DnaScreen,
  DomainScreen,
  DomainsScreen,
  ExplainAreaScreen,
  IntegrationsScreen,
  OverviewScreen,
  PrismErrorBoundary,
  SettingsScreen,
  TestingSecurityScreen,
  TrendsScreen,
  applyAppearance,
  clearAuditLog,
  clearIntegrationsState,
  loadSettings,
  saveSettings,
  withAudit,
  SETTINGS_STORAGE_KEY,
  type AppShellClient,
  type DomainOverlayStatus,
  type ImpactTarget,
  type MapPayload,
  type PrismGitignoreStatus,
  type SettingsSection,
} from "@prism/app-shell";
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
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import {
  applyRename,
  fetchBackendReport,
  fetchCodeExplorer,
  fetchDependencyGraph,
  fetchDna,
  fetchEngineeringHealth,
  fetchGitActivity,
  fetchHealth,
  fetchHealthHistory,
  fetchHealthHistoryBackfillStatus,
  fetchImpactBundle,
  fetchOverlay,
  fetchPresets,
  fetchRegionMovers,
  fetchRepositoryMap,
  fetchSecurityReport,
  fetchSymbolHits,
  fetchTestingReport,
  gitFetch,
  ingestCoverage,
  listTests,
  discoverFrontendRoutes,
  runLighthouseLab,
  runBundleAnalyze,
  detectBundleAnalyzeCapability,
  runTests,
  fetchConsent,
  setConsent,
  stageDevopsRemote,
  startHealthHistoryBackfill,
  type PlaygroundPreset,
} from "./map-client.js";

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
  /** Bumped on Start Indexing so a same-path reindex still refetches. */
  const [indexNonce, setIndexNonce] = useState(0);
  const [view, setView] = useState<
    | "map"
    | "overview"
    | "dna"
    | "profile"
    | "domains"
    | "domain"
    | "testing"
    | "blast"
    | "trends"
    | "integrations"
    | "settings"
    | "review"
    | "explain"
  >("overview");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");
  const [auditCategory, setAuditCategory] = useState<string | undefined>();
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
  const [displayName, setDisplayName] = useState(
    () => loadSettings().displayName,
  );
  const [networkIntegrationsAllowed, setNetworkIntegrationsAllowed] = useState(
    () => loadSettings().allowNetworkIntegrations,
  );

  useEffect(() => {
    const s = loadSettings();
    applyAppearance({
      theme: s.theme,
      density: s.density,
      monoFont: s.monoFont,
      sansFont: s.sansFont,
    });
  }, []);

  const onDisplayNameChange = useCallback((name: string) => {
    setDisplayName(name);
    saveSettings({ displayName: name });
  }, []);

  const onNetworkIntegrationsChange = useCallback((enabled: boolean) => {
    setNetworkIntegrationsAllowed(enabled);
    saveSettings({ allowNetworkIntegrations: enabled });
  }, []);

  const client = useMemo<AppShellClient>(() => {
    const target = root;
    return {
      fetchDashboard: async () => {
        throw new Error("fetchDashboard is not used by playground App");
      },
      fetchRepositoryMap: async (z, layerList) => {
        const next = await fetchRepositoryMap(z, target, layerList);
        const payload: MapPayload = {
          map: next,
          recentChanges: [],
        };
        return payload;
      },
      fetchReindex: async () => {
        await fetchRepositoryMap(zoom, target, layers);
      },
      fetchOverlay: (kind) => fetchOverlay(kind, target),
      fetchBackendReport: () => fetchBackendReport(target),
      fetchTestingReport: () => fetchTestingReport(target),
      fetchSecurityReport: () => fetchSecurityReport(target),
      ingestCoverage: () => ingestCoverage(target),
      runTests: (options) => runTests(target, options),
      listTests: () => listTests(target),
      fetchDependencyGraph: () => fetchDependencyGraph(target),
      fetchImpactBundle: (impactTarget: ImpactTarget) =>
        fetchImpactBundle(impactTarget, target),
      applyRename: (input) => applyRename(input, target),
      fetchSymbolHits: (query) => fetchSymbolHits(query, target),
      fetchGitActivity: () => fetchGitActivity(target),
      gitFetch: () => gitFetch(target),
      fetchHealthHistory: () => fetchHealthHistory(target),
      fetchRegionMovers: () => fetchRegionMovers(target),
      startHealthHistoryBackfill: () => startHealthHistoryBackfill(target),
      fetchHealthHistoryBackfillStatus: () =>
        fetchHealthHistoryBackfillStatus(target),
      fetchEngineeringHealth: () => fetchEngineeringHealth(target),
      fetchCodeExplorer: (exploreTarget) =>
        fetchCodeExplorer(target, exploreTarget),
      runLighthouseLab: (options) => runLighthouseLab(target, options),
      runBundleAnalyze: (options) => runBundleAnalyze(target, options),
      detectBundleAnalyzeCapability: (options) =>
        detectBundleAnalyzeCapability(target, options),
      discoverFrontendRoutes: () => discoverFrontendRoutes(target),
      stageDevopsRemote: (input) => stageDevopsRemote(target, input),
      listConsent: () => fetchConsent(target),
      setConsent: (purpose, granted) => setConsent(target, purpose, granted),
      fetchPrismGitignoreStatus: async (): Promise<PrismGitignoreStatus> => {
        // Degrades gracefully: the dev server may not expose /api/gitignore.
        try {
          const params = new URLSearchParams(target ? { root: target } : {});
          const res = await fetch(`/api/gitignore?${params}`);
          if (!res.ok) return { ignored: null };
          return (await res.json()) as PrismGitignoreStatus;
        } catch {
          return { ignored: null };
        }
      },
    };
  }, [root, zoom, layers]);

  const navigate = useCallback(
    (
      v:
        | "map"
        | "overview"
        | "dna"
        | "profile"
        | "domains"
        | "domain"
        | "testing"
        | "blast"
        | "trends"
        | "integrations"
        | "settings"
        | "review"
        | "explain",
    ) => {
      setView(v);
      if (v !== "settings") setSettingsSection("general");
    },
    [],
  );

  const openAuditLogs = useCallback((category?: string) => {
    setAuditCategory(category);
    setSettingsSection("audit");
    setView("settings");
  }, []);

  const refreshGit = useCallback(async (target: string | null) => {
    if (!target) return;
    setGitStatus("loading");
    const [data] = await Promise.all([
      withAudit(
        {
          category: "git",
          operation: "Git activity scan",
          target,
          command: `git log / git status (${target})`,
        },
        () => fetchGitActivity(target),
        (activity) => ({
          status: activity?.available ? "success" : "warning",
          output: activity?.available
            ? `branch=${activity.summary?.branch ?? "?"} recentFiles=${
                activity.recentFiles.length
              } commits=${activity.recentCommits.length}`
            : "No local git history detected for this workspace.",
        }),
      ),
      fetchHealth(target).then((h) => {
        setHealth(h);
      }),
      fetchDna(target).then((d) => {
        setDna(d);
      }),
    ]);
    setGitActivity(data);
    setGitStatus(data ? "ready" : "error");
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
  }, [zoom, root, layers.join(","), indexNonce]);

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
    setLoading(true);
    setIndexNonce((n) => n + 1);
    setGitActivity(null);
    setHealth(null);
    setDna(null);
    setOverlay(null);
    setSecurityOverlay(null);
    setQaOverlay(null);
    setDepGraph(null);
    setBackendReport(null);
    setOverlayStatus("idle");
    refreshGit(trimmed);
  };

  const onSubmitPath = (event: FormEvent) => {
    event.preventDefault();
    openRoot(draftRoot);
  };

  const rootLabel =
    displayName.trim() ||
    presets.find((p) => p.root === root)?.label ||
    root?.split("/").filter(Boolean).pop() ||
    "Repository";

  const pathDerivedLabel =
    presets.find((p) => p.root === root)?.label ??
    root?.split("/").filter(Boolean).pop() ??
    "Repository";

  const shell = (children: ReactElement): ReactElement => (
    <PrismErrorBoundary label="Prism">
      <AppShellClientProvider client={client}>
        <PrismErrorBoundary label={view} resetKey={view}>
          {children}
        </PrismErrorBoundary>
      </AppShellClientProvider>
    </PrismErrorBoundary>
  );

  if (error && !map) {
    return shell(
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
      </div>,
    );
  }

  if (!map || !root) {
    return shell(
      <div className="prism-boot prism-theme">
        <img src="/brand/prism-mark.png" alt="" width={28} height={28} />
        <p className="prism-boot__brand">Prism</p>
        <p className="prism-boot__msg">
          {loading ? "Indexing repository…" : "Charting repository…"}
        </p>
        {root ? <p className="prism-boot__detail">{rootLabel}</p> : null}
      </div>,
    );
  }

  return shell(
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
            onOpenTesting={() => setView("testing")}
            onOpenBlast={() => setView("blast")}
            onOpenTrends={() => setView("trends")}
            onOpenIntegrations={() => setView("integrations")}
            onOpenSettings={() => {
              setSettingsSection("general");
              setView("settings");
            }}
            onRefresh={() => {
              void refreshGit(root);
            }}
            onSyncGit={() => refreshGit(root)}
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
            onNavigate={navigate}
            onOpenDomain={openDomain}
            onOpenAuditLogs={openAuditLogs}
          />
        ) : view === "domains" ? (
          <DomainsScreen
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            dna={dna}
            onNavigate={navigate}
            onOpenDomain={openDomain}
          />
        ) : view === "testing" ? (
          <TestingSecurityScreen
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            dna={dna}
            onNavigate={navigate}
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
            onNavigate={navigate}
          />
        ) : view === "blast" ? (
          <BlastRadiusScreen
            root={root}
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            onNavigate={navigate}
          />
        ) : view === "review" ? (
          <ChangeReviewScreen
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            onNavigate={navigate}
          />
        ) : view === "explain" ? (
          <ExplainAreaScreen
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            onNavigate={navigate}
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
            onNavigate={navigate}
            fetchHealthHistory={() => fetchHealthHistory(root)}
            fetchRegionMovers={() => fetchRegionMovers(root)}
            startHealthHistoryBackfill={() => startHealthHistoryBackfill(root)}
            fetchHealthHistoryBackfillStatus={() =>
              fetchHealthHistoryBackfillStatus(root)
            }
          />
        ) : view === "integrations" ? (
          <IntegrationsScreen
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            networkIntegrationsAllowed={networkIntegrationsAllowed}
            onNavigate={navigate}
          />
        ) : view === "settings" ? (
          <SettingsScreen
            root={root}
            displayName={displayName}
            onDisplayNameChange={onDisplayNameChange}
            repoLabel={pathDerivedLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            map={map}
            autoDetected={defaultRoot !== null && root === defaultRoot}
            surface="playground"
            zoom={zoom}
            layers={layers}
            indexing={loading}
            initialSection={settingsSection}
            {...(auditCategory ? { initialAuditCategory: auditCategory } : {})}
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
            allowNetworkIntegrations={networkIntegrationsAllowed}
            onNetworkIntegrationsChange={onNetworkIntegrationsChange}
            onClearData={() => {
              domainRuns.current.clear();
              clearAuditLog();
              clearIntegrationsState();
              try {
                const keys: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (k?.startsWith("prism.domain-run.")) keys.push(k);
                }
                for (const k of keys) localStorage.removeItem(k);
                localStorage.removeItem(SETTINGS_STORAGE_KEY);
              } catch {
                /* ignore */
              }
              setDisplayName("");
              setNetworkIntegrationsAllowed(false);
              const fresh = loadSettings();
              applyAppearance({
                theme: fresh.theme,
                density: fresh.density,
                monoFont: fresh.monoFont,
                sansFont: fresh.sansFont,
              });
            }}
            onNavigate={navigate}
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
              onNavigate={navigate}
            />
          </div>
        )}
      </div>
    </div>,
  );
}
