import { createRoot } from "react-dom/client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
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
  PrismTour,
  SettingsScreen,
  TestingSecurityScreen,
  TrendsScreen,
  applyAppearance,
  autoReindexIntervalMs,
  clearAuditLog,
  clearIntegrationsState,
  clearTourCompleted,
  isTourCompleted,
  loadSettings,
  recordAudit,
  saveSettings,
  SETTINGS_STORAGE_KEY,
  type AppShellClient,
  type DomainOverlayStatus,
  type SettingsSection,
} from "@prism/app-shell";
import type {
  BackendReport,
  GraphSnapshotDto,
  MapBookmark,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
  UtilityOverlayReport,
} from "@prism/shared";
import type { AppView, HostToWebview } from "../protocol.js";
import {
  fetchBackendReport,
  fetchBookmarks,
  fetchDashboard,
  fetchDependencyGraph,
  fetchHealthHistory,
  fetchHealthHistoryBackfillStatus,
  fetchImpactBundle,
  fetchPackages,
  applyRename,
  explainArea,
  fetchOverlay,
  fetchRegionMovers,
  fetchReindex,
  fetchRepositoryMap,
  fetchSecurityReport,
  fetchSymbolHits,
  fetchTestingReport,
  fetchEngineeringHealth,
  fetchCodeExplorer,
  fetchPrismGitignoreStatus,
  addPrismGitignore,
  gitFetch,
  abortPendingHostRequests,
  handleHostMessage,
  ingestCoverage,
  openFile,
  postToHost,
  discoverFrontendRoutes,
  removeBookmark,
  reviewChanges,
  runLighthouseLab,
  runBundleAnalyze,
  detectBundleAnalyzeCapability,
  runTests,
  listTests,
  saveBookmark,
  selectPackage,
  stageDevopsRemote,
  startHealthHistoryBackfill,
  type DashboardPayload,
} from "./host-client.js";

type DomainRun = {
  overlay: UtilityOverlayReport;
  security: UtilityOverlayReport | null;
  qa: UtilityOverlayReport | null;
  depGraph: GraphSnapshotDto | null;
  backendReport: BackendReport | null;
};

function Status({
  message,
  kind,
  onRetry,
}: {
  message: string;
  kind: "info" | "error" | "loading";
  onRetry?: () => void;
}): ReactElement {
  return (
    <div className="prism-webview-status" data-kind={kind}>
      <div className="prism-webview-status__body">
        <p className="prism-webview-status__message">{message}</p>
        {kind === "error" && onRetry ? (
          <button
            type="button"
            className="prism-webview-status__retry"
            onClick={onRetry}
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

function App(): ReactElement {
  const brand = document.body.getAttribute("data-brand") ?? undefined;
  const [view, setView] = useState<AppView>("overview");
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");
  const [auditCategory, setAuditCategory] = useState<string | undefined>();
  const [boot, setBoot] = useState<{
    message: string;
    kind: "info" | "error" | "loading";
  }>({ message: "Connecting to Prism…", kind: "loading" });
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [zoom, setZoom] = useState<MapZoomLevel>("package");
  const [layers, setLayers] = useState<MapLayerId[]>([
    "architecture",
    "dependency",
  ]);
  const [map, setMap] = useState<RepositoryMap | null>(null);
  const [bookmarks, setBookmarks] = useState<MapBookmark[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [activeDomain, setActiveDomain] = useState("backend");
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
  // Deep-link targets from host `navigate` messages (M-048 Phase 2/3/4/5).
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [targetPaths, setTargetPaths] = useState<string[] | null>(null);
  const [codeLensEnabled, setCodeLensEnabled] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const dashboardRef = useRef<DashboardPayload | null>(null);
  dashboardRef.current = dashboard;

  useEffect(() => {
    const s = loadSettings();
    applyAppearance({
      theme: s.theme,
      density: s.density,
      monoFont: s.monoFont,
      sansFont: s.sansFont,
    });
    if (s.autoReindex) {
      postToHost({
        type: "setAutoReindex",
        enabled: true,
        intervalMs: autoReindexIntervalMs(s.autoReindexInterval),
      });
    }
  }, []);

  const onDisplayNameChange = useCallback((name: string) => {
    setDisplayName(name);
    saveSettings({ displayName: name });
  }, []);

  const onNetworkIntegrationsChange = useCallback((enabled: boolean) => {
    setNetworkIntegrationsAllowed(enabled);
    saveSettings({ allowNetworkIntegrations: enabled });
  }, []);

  const client = useMemo<AppShellClient>(
    () => ({
      fetchDashboard,
      fetchRepositoryMap,
      fetchReindex,
      fetchOverlay,
      fetchBackendReport,
      fetchTestingReport,
      fetchSecurityReport,
      ingestCoverage,
      runTests,
      listTests,
      fetchDependencyGraph: () => fetchDependencyGraph(),
      fetchImpactBundle: (target) => fetchImpactBundle(target),
      applyRename,
      fetchSymbolHits: (query) => fetchSymbolHits(query),
      fetchHealthHistory,
      fetchRegionMovers,
      startHealthHistoryBackfill,
      fetchHealthHistoryBackfillStatus,
      fetchEngineeringHealth,
      fetchCodeExplorer,
      fetchPrismGitignoreStatus,
      addPrismGitignore,
      gitFetch,
      runLighthouseLab,
      runBundleAnalyze,
      detectBundleAnalyzeCapability,
      discoverFrontendRoutes,
      stageDevopsRemote,
      fetchChangeReview: (paths, base) => reviewChanges(paths, base),
      fetchExplainArea: (path) => explainArea(path),
      fetchBookmarks,
      saveBookmark,
      removeBookmark,
      fetchPackages,
      selectPackage,
      openFile,
      postToHost,
    }),
    [],
  );

  const openAuditLogs = useCallback((category?: string) => {
    setAuditCategory(category);
    setSettingsSection("audit");
    setView("settings");
  }, []);

  const loadDashboard = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) {
      setBoot({ message: "Loading workspace…", kind: "loading" });
    }
    try {
      const data = await fetchDashboard();
      setDashboard(data);
      setMap(data.map);
      setBoot({ message: "", kind: "info" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setBoot({ message: msg, kind: "error" });
    }
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      handleHostMessage(msg);
      if ("type" in msg && msg.type === "status") {
        // Only use host status for the initial boot screen. Once we have a
        // dashboard, ignore loading/info flashes from watch/reindex so CodeLens
        // / Review / Explain are not replaced by an "Indexing…" blank.
        setBoot((prev) => {
          if (prev.kind === "loading" && !dashboardRef.current) {
            return { message: msg.message, kind: msg.kind };
          }
          if (msg.kind === "error") {
            return { message: msg.message, kind: "error" };
          }
          return prev;
        });
      }
      if ("type" in msg && msg.type === "navigate") {
        setView(msg.view);
        if (msg.domainId) setActiveDomain(msg.domainId);
        setFocusPath(msg.focusPath ?? null);
        setFocusNodeId(msg.focusNodeId ?? null);
        setTargetPath(msg.targetPath ?? null);
        setTargetPaths(msg.targetPaths ?? null);
      }
      if ("type" in msg && msg.type === "dataRefresh") {
        void loadDashboard({ quiet: true });
      }
      if ("type" in msg && msg.type === "audit") {
        recordAudit(msg.entry);
      }
      if ("type" in msg && msg.type === "codeLensEnabled") {
        setCodeLensEnabled(msg.enabled);
      }
      if ("type" in msg && msg.type === "showTour") {
        setTourOpen(true);
      }
    };
    // A panel reload tears down this webview while requests are still in
    // flight. Failing them explicitly stops their promises leaking and lets
    // callers show an error instead of an indefinite spinner (M-051 Phase 1).
    const onUnload = () => abortPendingHostRequests();

    window.addEventListener("message", onMessage);
    window.addEventListener("pagehide", onUnload);
    postToHost({ type: "ready", view: "overview" });
    void loadDashboard();
    void fetchBookmarks()
      .then(setBookmarks)
      .catch(() => {
        /* bookmarks are optional — keep empty on failure */
      });
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", onUnload);
      abortPendingHostRequests();
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (view !== "map" || !dashboard) return;
    let cancelled = false;
    void fetchRepositoryMap(zoom, layers)
      .then((payload) => {
        if (!cancelled) setMap(payload.map);
      })
      .catch(() => {
        /* keep last map */
      });
    return () => {
      cancelled = true;
    };
  }, [view, zoom, layers, dashboard?.root]);

  const refreshGit = useCallback(async () => {
    await loadDashboard();
  }, [loadDashboard]);

  const syncGit = useCallback(async () => {
    await loadDashboard();
  }, [loadDashboard]);

  const runOverlay = useCallback(
    (kind: string) => {
      if (!dashboard) return;
      const enrichBackend = activeDomain === "backend";
      const enrichMobile = activeDomain === "mobile";
      const enrichDesktop = activeDomain === "desktop";
      setOverlayStatus("loading");
      void Promise.all([
        fetchOverlay(kind),
        enrichBackend
          ? fetchOverlay("security-surface")
          : Promise.resolve(null),
        enrichBackend || enrichMobile
          ? fetchOverlay("qa-test-gaps")
          : Promise.resolve(null),
        enrichBackend || enrichMobile || enrichDesktop
          ? fetchDependencyGraph()
          : Promise.resolve(null),
        enrichBackend ? fetchBackendReport() : Promise.resolve(null),
      ]).then(([main, security, qa, graph, backend]) => {
        setOverlay(main);
        setSecurityOverlay(security);
        setQaOverlay(qa);
        setDepGraph(graph);
        setBackendReport(backend);
        setOverlayStatus(main ? "ready" : "error");
        if (main) {
          domainRuns.current.set(activeDomain, {
            overlay: main,
            security,
            qa,
            depGraph: graph,
            backendReport: backend,
          });
        }
      });
    },
    [dashboard, activeDomain],
  );

  const openDomain = useCallback((domainId: string) => {
    setActiveDomain(domainId);
    const cached = domainRuns.current.get(domainId);
    if (cached) {
      setOverlay(cached.overlay);
      setSecurityOverlay(cached.security);
      setQaOverlay(cached.qa);
      setDepGraph(cached.depGraph);
      setBackendReport(cached.backendReport);
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
  }, []);

  const onNavigate = useCallback((next: AppView) => {
    setView(next);
    if (next !== "settings") setSettingsSection("general");
  }, []);

  // First successful load → in-app tour (unless already completed / skipped).
  useEffect(() => {
    if (!dashboard) return;
    if (isTourCompleted()) return;
    setTourOpen(true);
  }, [dashboard?.root]);

  if (!dashboard || boot.kind === "loading" || boot.kind === "error") {
    return (
      <AppShellClientProvider client={client}>
        <Status
          message={boot.message || "Loading…"}
          kind={boot.kind}
          onRetry={() => void loadDashboard()}
        />
      </AppShellClientProvider>
    );
  }

  const {
    repoLabel: pathRepoLabel,
    root,
    gitActivity,
    health,
    dna,
    branch,
    map: dashMap,
  } = dashboard;
  const repoLabel = displayName.trim() || pathRepoLabel;
  const activeMap = map ?? dashMap;
  const user = gitActivity?.recentCommits[0] ?? null;
  const gitStatus: "loading" | "ready" | "error" = gitActivity
    ? "ready"
    : "error";

  let body: ReactElement;
  if (view === "overview") {
    body = (
      <OverviewScreen
        map={activeMap}
        repoLabel={repoLabel}
        gitActivity={gitActivity}
        gitStatus={gitStatus}
        health={health}
        dna={dna}
        testingScore={dashboard?.testingScore ?? null}
        securityScore={dashboard?.securityScore ?? null}
        onOpenMap={() => setView("map")}
        onOpenDna={() => setView("dna")}
        onOpenProfile={() => setView("profile")}
        onOpenDomains={() => setView("domains")}
        onOpenTesting={() => setView("testing")}
        onOpenBlast={() => setView("blast")}
        onOpenTrends={() => setView("trends")}
        onOpenIntegrations={() => setView("integrations")}
        onOpenSettings={() => setView("settings")}
        onRefresh={() => {
          void refreshGit();
        }}
        onSyncGit={syncGit}
      />
    );
  } else if (view === "dna" || view === "profile") {
    body = (
      <DnaScreen
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        dna={dna}
        health={health}
        map={activeMap}
        mode={view === "profile" ? "profile" : "analysis"}
        onNavigate={onNavigate}
        onOpenDomain={openDomain}
        onOpenAuditLogs={openAuditLogs}
      />
    );
  } else if (view === "domains") {
    body = (
      <DomainsScreen
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        dna={dna}
        onNavigate={onNavigate}
        onOpenDomain={openDomain}
      />
    );
  } else if (view === "testing") {
    body = (
      <TestingSecurityScreen
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        dna={dna}
        onNavigate={onNavigate}
      />
    );
  } else if (view === "domain") {
    body = (
      <DomainScreen
        domainId={activeDomain}
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        overlay={overlay}
        status={overlayStatus}
        security={securityOverlay}
        qa={qaOverlay}
        depGraph={depGraph}
        backendReport={backendReport}
        gitActivity={gitActivity}
        dna={dna}
        onRun={runOverlay}
        onNavigate={onNavigate}
      />
    );
  } else if (view === "blast") {
    body = (
      <BlastRadiusScreen
        root={root}
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        initialFile={targetPath}
        onNavigate={onNavigate}
      />
    );
  } else if (view === "review") {
    body = (
      <ChangeReviewScreen
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        initialPaths={targetPaths}
        onNavigate={onNavigate}
        onOpenFile={openFile}
      />
    );
  } else if (view === "explain") {
    body = (
      <ExplainAreaScreen
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        initialPath={targetPath}
        onNavigate={onNavigate}
      />
    );
  } else if (view === "trends") {
    body = (
      <TrendsScreen
        map={activeMap}
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        gitActivity={gitActivity}
        gitStatus={gitStatus}
        health={health}
        onNavigate={onNavigate}
        fetchHealthHistory={fetchHealthHistory}
        fetchRegionMovers={fetchRegionMovers}
        startHealthHistoryBackfill={startHealthHistoryBackfill}
        fetchHealthHistoryBackfillStatus={fetchHealthHistoryBackfillStatus}
      />
    );
  } else if (view === "integrations") {
    body = (
      <IntegrationsScreen
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        networkIntegrationsAllowed={networkIntegrationsAllowed}
        onNavigate={onNavigate}
      />
    );
  } else if (view === "settings") {
    body = (
      <SettingsScreen
        root={root}
        displayName={displayName}
        onDisplayNameChange={onDisplayNameChange}
        repoLabel={pathRepoLabel}
        branch={branch}
        user={user}
        map={activeMap}
        autoDetected={false}
        surface="extension"
        zoom={zoom}
        layers={layers}
        indexing={indexing}
        initialSection={settingsSection}
        {...(auditCategory ? { initialAuditCategory: auditCategory } : {})}
        onZoomChange={setZoom}
        onLayersChange={(next) => setLayers([...next])}
        onApplyWorkspace={() => undefined}
        onReindex={() => {
          setIndexing(true);
          void fetchReindex()
            .then(() => loadDashboard())
            .finally(() => setIndexing(false));
        }}
        allowNetworkIntegrations={networkIntegrationsAllowed}
        onNetworkIntegrationsChange={onNetworkIntegrationsChange}
        onAutoReindexChange={(enabled, intervalMs) => {
          postToHost({
            type: "setAutoReindex",
            enabled,
            ...(intervalMs !== undefined ? { intervalMs } : {}),
          });
        }}
        onLocalOnlyAnalysisChange={(enabled) => {
          postToHost({ type: "setLocalOnly", enabled });
        }}
        codeLensEnabled={codeLensEnabled}
        onCodeLensChange={(enabled) => {
          setCodeLensEnabled(enabled);
          postToHost({ type: "setCodeLens", enabled });
        }}
        onOpenWalkthrough={() => {
          setTourOpen(true);
        }}
        onClearData={() => {
          domainRuns.current.clear();
          clearAuditLog();
          clearIntegrationsState();
          clearTourCompleted();
          setTourOpen(true);
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
          postToHost({ type: "clearData" });
        }}
        onNavigate={onNavigate}
      />
    );
  } else {
    body = (
      <div className="playground-shell playground-shell--ext">
        <div className="playground-shell__map">
          <div className="playground-map-wrap">
            <div className="playground-map-inner">
              <RepositoryMapView
                map={activeMap}
                bookmarks={bookmarks}
                focusPath={focusPath}
                focusNodeId={focusNodeId}
                {...(brand ? { brandMarkSrc: brand } : {})}
                showBrand={false}
                branch={branch}
                recentChanges={
                  gitActivity?.available ? gitActivity.recentFiles : []
                }
                onZoomChange={(z) => {
                  setZoom(z);
                  postToHost({ type: "zoom", zoom: z });
                }}
                onLayersChange={(next) => {
                  setLayers([...next]);
                  postToHost({ type: "layers", layers: [...next] });
                }}
                onAddBookmark={(label, nodeId) => {
                  void saveBookmark({ label, nodeId, zoom })
                    .then(setBookmarks)
                    .catch(() => {
                      // Fall back to a local-only bookmark if persistence fails.
                      setBookmarks((prev) => [
                        ...prev,
                        {
                          id: `bookmark:${nodeId}:${Date.now()}`,
                          label,
                          nodeId,
                          zoom,
                          createdAt: new Date().toISOString(),
                        },
                      ]);
                    });
                }}
                onOpenPath={(path) => openFile(path)}
              />
            </div>
            <AppSidebar
              variant="rail"
              active="map"
              repoLabel={repoLabel}
              user={user}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <PrismErrorBoundary label="Prism">
      <AppShellClientProvider client={client}>
        <PrismErrorBoundary label={view} resetKey={view}>
          {body}
        </PrismErrorBoundary>
        <PrismTour
          open={tourOpen}
          onClose={() => setTourOpen(false)}
          onNavigate={(next) => {
            if (next === "settings") {
              setSettingsSection("indexing");
            }
            onNavigate(next);
          }}
        />
      </AppShellClientProvider>
    </PrismErrorBoundary>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
