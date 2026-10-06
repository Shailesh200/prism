import { createRoot } from "react-dom/client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { EmptyState, PrismToastHost, showPrismToast } from "@repo-prism/ui";
import type { ConsoleStatus } from "@repo-prism/shared";
import {
  AppShellClientProvider,
  BlastRadiusScreen,
  DnaScreen,
  ConsoleHubScreen,
  IntegrationsScreen,
  LensesScreen,
  OverviewScreen,
  PrismErrorBoundary,
  PrismTour,
  SettingsScreen,
  TrendsScreen,
  applyAppearance,
  resolveAppView,
  autoReindexIntervalMs,
  parseExcludeGlobs,
  isTourCompleted,
  loadSettings,
  recordAudit,
  saveSettings,
  type AppShellClient,
  type GitStatus,
  type MaxFileSizeOption,
  type SettingsSection,
} from "@repo-prism/app-shell";
import {
  maxFileSizeOptionFromBytes,
  maxFileSizeOptionToBytes,
} from "@repo-prism/shared";
import type {
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
} from "@repo-prism/shared";
import type { AppView, HostToWebview } from "@repo-prism/host-session";
import {
  fetchBackendReport,
  fetchBookmarks,
  fetchDashboard,
  fetchDependencyGraph,
  fetchDomainReport,
  fetchHealthHistory,
  fetchHealthHistoryBackfillStatus,
  fetchImpactBundle,
  fetchPackages,
  applyRename,
  explainArea,
  fetchGuardSession,
  fetchLenses,
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
  fetchChangedPaths,
  runLighthouseLab,
  runBundleAnalyze,
  detectBundleAnalyzeCapability,
  runTests,
  listTests,
  saveBookmark,
  selectPackage,
  listConsent,
  setConsent,
  stageDevopsRemote,
  fetchGithubWorkflows,
  fetchGithubWorkflowRuns,
  fetchGithubRepo,
  fetchGithubAuthenticatedLogin,
  testGithubRepoConnection,
  dispatchGithubWorkflow,
  fetchPagespeedMetrics,
  startHealthHistoryBackfill,
  type DashboardPayload,
} from "./host-client.js";

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
  const [indexing, setIndexing] = useState(false);
  const [displayName, setDisplayName] = useState(
    () => loadSettings().displayName,
  );
  const [networkIntegrationsAllowed, setNetworkIntegrationsAllowed] = useState(
    () => loadSettings().allowNetworkIntegrations,
  );
  // Deep-link targets from host `navigate` messages (M-048 Phase 2/3/4/5).
  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [targetPaths, setTargetPaths] = useState<string[] | null>(null);
  const [blastIntent, setBlastIntent] = useState<"edit" | "delete" | null>(
    null,
  );
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
    postToHost({
      type: "setAutoReindex",
      enabled: s.autoReindex,
      intervalMs: autoReindexIntervalMs(s.autoReindexInterval),
    });
    // Migrate indexing knobs to `.prism/config.json` (P-B6) — only when the
    // file does not exist; a hand-edited / CLI-written file is never
    // clobbered. The host answers `ready` with the file's `prismConfig`
    // values, which hydrate the store below (file is the source of truth).
    postToHost({
      type: "writePrismConfig",
      excludeGlobs: parseExcludeGlobs(s.excludeGlobs),
      maxFileBytes: maxFileSizeOptionToBytes(s.maxFileSize),
      ifAbsent: true,
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
      fetchDomainReport,
      stageDevopsRemote,
      fetchGithubWorkflows,
      fetchGithubWorkflowRuns,
      fetchGithubRepo,
      fetchGithubAuthenticatedLogin,
      testGithubRepoConnection,
      dispatchGithubWorkflow,
      fetchPagespeedMetrics,
      listConsent,
      setConsent,
      fetchChangeReview: (paths, base) => reviewChanges(paths, base),
      fetchChangedPaths,
      fetchExplainArea: (path) => explainArea(path),
      fetchGuardSession: (preExistingChanges) =>
        fetchGuardSession(preExistingChanges),
      fetchLenses,
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
        setTargetPath(msg.targetPath ?? null);
        setTargetPaths(msg.targetPaths ?? null);
        setBlastIntent(msg.intent ?? null);
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
      if ("type" in msg && msg.type === "prismConfig") {
        // Hydrate indexing knobs from `.prism/config.json` (P-B6): the file
        // wins over localStorage so CLI / hand edits show up in Settings.
        const patch: {
          excludeGlobs?: string;
          maxFileSize?: MaxFileSizeOption;
        } = {};
        if (msg.excludeGlobs !== undefined) {
          patch.excludeGlobs = msg.excludeGlobs.join("\n");
        }
        const option = maxFileSizeOptionFromBytes(msg.maxFileBytes);
        if (option !== undefined) {
          patch.maxFileSize = option;
        }
        if (Object.keys(patch).length > 0) {
          saveSettings(patch);
        }
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

  // Fetched here rather than inside each screen: Integrations, Jobs and
  // Workflows all need it, and three independent pollers would ask the same
  // loopback port the same question three times.
  const [consoleStatus, setConsoleStatus] = useState<ConsoleStatus | undefined>(
    undefined,
  );
  const [consoleNonce, setConsoleNonce] = useState(0);
  useEffect(() => {
    let live = true;
    void client.fetchConsoleStatus?.().then((next) => {
      if (live) setConsoleStatus(next);
    });
    return () => {
      live = false;
    };
  }, [client, consoleNonce]);
  const refreshConsoleStatus = useCallback(
    () => setConsoleNonce((n) => n + 1),
    [],
  );

  const onNavigate = useCallback((next: AppView) => {
    const resolved =
      next === "review" ||
      next === "explain" ||
      next === "blast" ||
      next === "guard"
        ? next
        : resolveAppView(next);
    setView(resolved);
    if (resolved !== "settings") setSettingsSection("general");
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
  // A null gitActivity means the host found no git data, not that reading it
  // failed. Reporting "error" told users something was broken when the
  // repository simply is not a git work tree (ADR-0029).
  const gitStatus: GitStatus = gitActivity ? "ready" : "unavailable";

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
        workspacePath={root}
        onNavigate={onNavigate}
        onOpenEnvelope={() => setView("iris")}
        onOpenDna={() => setView("dna")}
        onOpenBlast={(seedPath) => {
          setTargetPath(seedPath ?? null);
          setView("blast");
        }}
        onFocusMapNode={() => {
          setView("impact");
        }}
        onOpenTrends={() => setView("trends")}
        onOpenIntegrations={() => setView("integrations")}
        onOpenSettings={() => setView("settings")}
        onOpenReview={() => setView("review")}
        onOpenExplain={() => setView("explain")}
        onOpenGuard={() => setView("guard")}
        onOpenPath={openFile}
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
        onNavigate={onNavigate}
        onOpenBlast={(seedPath) => {
          setTargetPath(seedPath ?? null);
          setView("blast");
        }}
        onOpenAuditLogs={openAuditLogs}
        trees={
          <EmptyState variant="page" title="Trees">
            Trees run on the Dashboard daemon for this workspace.
          </EmptyState>
        }
      />
    );
  } else if (view === "lenses") {
    body = (
      <LensesScreen
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        onNavigate={onNavigate}
      />
    );
  } else if (view === "iris" || view === "skills") {
    body = (
      <ConsoleHubScreen
        view={view}
        repoLabel={repoLabel}
        workspacePath={root}
        branch={branch}
        user={user}
        status={consoleStatus}
        onRetry={refreshConsoleStatus}
        onNavigate={onNavigate}
      />
    );
  } else if (
    view === "impact" ||
    view === "jobs" ||
    view === "findings" ||
    view === "blast" ||
    view === "review" ||
    view === "explain" ||
    view === "guard"
  ) {
    body = (
      <BlastRadiusScreen
        key="impact"
        root={root}
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        initialFile={targetPath}
        initialIntent={blastIntent}
        initialTab={
          view === "explain"
            ? "explain"
            : view === "review"
              ? "review"
              : view === "guard"
                ? "guard"
                : "blast"
        }
        initialPaths={targetPaths}
        onNavigate={onNavigate}
        onOpenPath={openFile}
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
        workspacePath={root}
        onNavigate={onNavigate}
        fetchHealthHistory={fetchHealthHistory}
        fetchRegionMovers={fetchRegionMovers}
        startHealthHistoryBackfill={startHealthHistoryBackfill}
        fetchHealthHistoryBackfillStatus={fetchHealthHistoryBackfillStatus}
        onNotify={showPrismToast}
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
        {...(consoleStatus ? { consoleStatus } : {})}
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
        onIndexConfigChange={(next) => {
          postToHost({
            type: "writePrismConfig",
            excludeGlobs: parseExcludeGlobs(next.excludeGlobs),
            maxFileBytes: maxFileSizeOptionToBytes(next.maxFileSize),
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
        onNavigate={onNavigate}
      />
    );
  } else {
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
        workspacePath={root}
        onNavigate={onNavigate}
        onOpenEnvelope={() => setView("iris")}
        onOpenDna={() => setView("dna")}
        onOpenBlast={(seedPath) => {
          setTargetPath(seedPath ?? null);
          setView("impact");
        }}
        onOpenTrends={() => setView("trends")}
        onOpenIntegrations={() => setView("integrations")}
        onOpenReview={() => setView("review")}
        onOpenExplain={() => setView("explain")}
        onOpenGuard={() => setView("guard")}
        onOpenSettings={() => setView("settings")}
        onRefresh={() => {
          void loadDashboard();
        }}
        onSyncGit={syncGit}
      />
    );
  }

  return (
    <PrismErrorBoundary label="Prism">
      <PrismToastHost />
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
