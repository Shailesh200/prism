import { PrismToastHost, Select, showPrismToast } from "@repo-prism/ui";
import {
  AppShellClientProvider,
  ConsoleHubScreen,
  BlastRadiusScreen,
  DnaScreen,
  IntegrationsScreen,
  OverviewScreen,
  resolveAppView,
  PrismBootScreen,
  PRISM_BOOT_LOOKUP_STAGES,
  PrismErrorBoundary,
  PrismWakeScreen,
  SettingsScreen,
  TrendsScreen,
  TreesView,
  applyAppearance,
  loadSettings,
  saveSettings,
  withAudit,
  type AppShellClient,
  type AppView,
  type ImpactTarget,
  type JobSummary,
  type MapPayload,
  type PrismGitignoreStatus,
  type SettingsSection,
} from "@repo-prism/app-shell";
import type {
  DnaReport,
  GitActivity,
  HealthScore,
  MapLayerId,
  MapZoomLevel,
  RepositoryMap,
} from "@repo-prism/shared";
import {
  DEFAULT_DISPATCH_URL,
  NO_CONSOLE_STATUS,
  type ConsoleStatus,
  type PrismSurfacesStatus,
} from "@repo-prism/shared";
import {
  useCallback,
  useEffect,
  useMemo,
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
  fetchChangeReview,
  fetchChangedPaths,
  fetchExplainArea,
  fetchGuardSession,
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
  fetchDomainReport,
  runLighthouseLab,
  runBundleAnalyze,
  detectBundleAnalyzeCapability,
  runTests,
  fetchConsent,
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
  type PlaygroundPreset,
} from "./map-client.js";
import {
  irisPaneHash,
  parseIrisPane,
  parsePlaygroundView,
  playgroundHash,
  isWakeHash,
  pickPlaygroundRoot,
  rootFromSearch,
  withRootSearch,
} from "./hash-route.js";

async function persistPlaygroundRoot(root: string): Promise<void> {
  try {
    await fetch("/api/select-root", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root }),
    });
  } catch {
    // Registry write is best-effort; indexing still proceeds.
  }
}

export function App(): ReactElement {
  const [zoom, setZoom] = useState<MapZoomLevel>("package");
  const [root, setRoot] = useState<string | null>(() =>
    rootFromSearch(window.location.search),
  );
  const [draftRoot, setDraftRoot] = useState("");
  const [presets, setPresets] = useState<PlaygroundPreset[]>([]);
  const [defaultRoot, setDefaultRoot] = useState<string | null>(null);
  const [map, setMap] = useState<RepositoryMap | null>(null);
  const [layers, setLayers] = useState<MapLayerId[]>([
    "architecture",
    "dependency",
  ]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Bumped on Start Indexing so a same-path reindex still refetches. */
  const [indexNonce, setIndexNonce] = useState(0);
  const [view, setViewState] = useState<AppView>(
    () => parsePlaygroundView(window.location.hash) ?? "overview",
  );
  const [wake, setWake] = useState(() => isWakeHash(window.location.hash));
  const [irisPane, setIrisPane] = useState<"envelope" | "prepare" | undefined>(
    () => parseIrisPane(window.location.hash),
  );
  const setView = useCallback((v: AppView) => {
    const nextView =
      v === "review" || v === "explain" || v === "blast" || v === "guard"
        ? v
        : resolveAppView(v);
    setViewState(nextView);
    setIrisPane(undefined);
    setWake(false);
    const next = playgroundHash(nextView);
    if (window.location.hash !== next) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${next}`,
      );
    }
  }, []);
  useEffect(() => {
    const onHash = (): void => {
      setWake(isWakeHash(window.location.hash));
      const next = parsePlaygroundView(window.location.hash);
      if (next) setViewState(next);
      setIrisPane(parseIrisPane(window.location.hash));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [blastSeedPath, setBlastSeedPath] = useState<string | null>(null);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");
  const [auditCategory, setAuditCategory] = useState<string | undefined>();
  const [gitActivity, setGitActivity] = useState<GitActivity | null>(null);
  const [health, setHealth] = useState<HealthScore | null>(null);
  const [dna, setDna] = useState<DnaReport | null>(null);
  const [gitStatus, setGitStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [displayName, setDisplayName] = useState(
    () => loadSettings().displayName,
  );
  const [networkIntegrationsAllowed, setNetworkIntegrationsAllowed] = useState(
    () => loadSettings().allowNetworkIntegrations,
  );
  const [dispatchLive, setDispatchLive] = useState<boolean | undefined>();
  const [dispatchUrl, setDispatchUrl] = useState(DEFAULT_DISPATCH_URL);
  const [consoleStatus, setConsoleStatus] = useState<
    ConsoleStatus | undefined
  >();
  const [consoleNonce, setConsoleNonce] = useState(0);
  const [archiveJobs, setArchiveJobs] = useState<readonly JobSummary[]>([]);

  const openIrisPane = useCallback((pane: "envelope" | "prepare") => {
    setViewState("iris");
    setIrisPane(pane);
    setWake(false);
    const next = irisPaneHash(pane);
    if (window.location.hash !== next) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${next}`,
      );
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const read = async (): Promise<void> => {
      try {
        const response = await fetch("/api/surfaces");
        if (!response.ok) throw new Error("surfaces");
        const body = (await response.json()) as PrismSurfacesStatus;
        if (!alive) return;
        setDispatchLive(Boolean(body.dispatch?.live));
        if (body.dispatch?.url) setDispatchUrl(body.dispatch.url);
      } catch {
        if (alive) setDispatchLive(false);
      }
    };
    void read();
    const id = window.setInterval(() => void read(), 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const read = async (): Promise<void> => {
      try {
        const response = await fetch("/api/console");
        if (!response.ok) throw new Error("console");
        const body = (await response.json()) as ConsoleStatus;
        if (!alive) return;
        setConsoleStatus(body);
      } catch {
        if (alive) setConsoleStatus(NO_CONSOLE_STATUS);
      }
    };
    void read();
    return () => {
      alive = false;
    };
  }, [consoleNonce]);
  const refreshConsoleStatus = useCallback(
    () => setConsoleNonce((n) => n + 1),
    [],
  );

  useEffect(() => {
    const url = consoleStatus?.console?.url;
    if (!url) {
      setArchiveJobs([]);
      return;
    }
    let alive = true;
    const read = async (): Promise<void> => {
      try {
        const token = new URL(url).searchParams.get("token") ?? "";
        const res = await fetch(`/api/jobs?token=${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error("jobs");
        const body = (await res.json()) as {
          readonly jobs?: readonly JobSummary[];
        };
        if (alive) setArchiveJobs(body.jobs ?? []);
      } catch {
        if (alive) setArchiveJobs([]);
      }
    };
    void read();
    return () => {
      alive = false;
    };
  }, [consoleStatus?.console?.url]);

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
      fetchChangeReview: (paths, base) =>
        fetchChangeReview(paths, target, base),
      fetchChangedPaths: (base) => fetchChangedPaths(target, base),
      fetchExplainArea: (path) => fetchExplainArea(path, target),
      fetchGuardSession: (preExistingChanges) =>
        fetchGuardSession(preExistingChanges, target),
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
      fetchDomainReport: (options) => fetchDomainReport(target, options),
      stageDevopsRemote: (input) => stageDevopsRemote(target, input),
      fetchGithubWorkflows: (cfg) => fetchGithubWorkflows(target, cfg),
      fetchGithubWorkflowRuns: (cfg, options) =>
        fetchGithubWorkflowRuns(target, cfg, options),
      fetchGithubRepo: (cfg) => fetchGithubRepo(target, cfg),
      fetchGithubAuthenticatedLogin: (token) =>
        fetchGithubAuthenticatedLogin(target, token),
      testGithubRepoConnection: (cfg) => testGithubRepoConnection(target, cfg),
      dispatchGithubWorkflow: (input) => dispatchGithubWorkflow(target, input),
      fetchPagespeedMetrics: (apiKey, url) =>
        fetchPagespeedMetrics(target, apiKey, url),
      listConsent: () => fetchConsent(target),
      setConsent: (purpose, granted) => setConsent(target, purpose, granted),
      fetchPrismGitignoreStatus: async (): Promise<PrismGitignoreStatus> => {
        // `ignored: null` on failure, never `false`: the sidebar warns on
        // `false`, and warning about a check that did not run would be worse
        // than staying quiet.
        try {
          const params = new URLSearchParams(target ? { root: target } : {});
          const res = await fetch(`/api/gitignore?${params}`);
          if (!res.ok) return { ignored: null };
          return (await res.json()) as PrismGitignoreStatus;
        } catch {
          return { ignored: null };
        }
      },
      addPrismGitignore: async (): Promise<PrismGitignoreStatus> => {
        try {
          const res = await fetch("/api/add-gitignore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ root: target }),
          });
          if (!res.ok) return { ignored: null };
          return (await res.json()) as PrismGitignoreStatus;
        } catch {
          return { ignored: null };
        }
      },
    };
  }, [root, zoom, layers]);

  const navigate = useCallback((v: AppView) => {
    setView(v);
    if (v !== "settings") setSettingsSection("general");
  }, []);

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
    const applyPresets = (
      data: NonNullable<Awaited<ReturnType<typeof fetchPresets>>>,
    ): void => {
      setPresets(data.presets);
      setDefaultRoot(data.defaultRoot || null);
      const fromQuery = rootFromSearch(window.location.search);
      setRoot((prev) =>
        pickPlaygroundRoot({
          prev,
          fromQuery,
          defaultRoot: data.defaultRoot || null,
        }),
      );
      setDraftRoot((prev) => prev || fromQuery || data.defaultRoot || "");
      if (!fromQuery && !data.defaultRoot) {
        setLoading(false);
      }
    };
    void fetchPresets().then((data) => {
      if (cancelled || !data) return;
      applyPresets(data);
    });
    const tick = window.setInterval(() => {
      void fetchPresets().then((data) => {
        if (cancelled || !data) return;
        applyPresets(data);
      });
    }, 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
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

  const openRoot = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return;
    setDraftRoot(trimmed);
    setRoot(trimmed);
    window.history.replaceState(
      null,
      "",
      withRootSearch(
        window.location.pathname,
        window.location.search,
        window.location.hash,
        trimmed,
      ),
    );
    void persistPlaygroundRoot(trimmed);
    setZoom("package");
    setMap(null);
    setLoading(true);
    setIndexNonce((n) => n + 1);
    setGitActivity(null);
    setHealth(null);
    setDna(null);
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

  useEffect(() => {
    if (!root) return;
    setDraftRoot(root);
    if (rootFromSearch(window.location.search) !== root) {
      window.history.replaceState(
        null,
        "",
        withRootSearch(
          window.location.pathname,
          window.location.search,
          window.location.hash,
          root,
        ),
      );
    }
  }, [root]);

  const repoOptions = [
    ...presets.map((row) => ({ value: row.root, label: row.label })),
    ...(root && !presets.some((row) => row.root === root)
      ? [{ value: root, label: rootLabel }]
      : []),
  ];
  const selectValue =
    (root && repoOptions.some((row) => row.value === root)
      ? root
      : repoOptions[0]?.value) ?? "";

  const repoPicker = (boot: boolean): ReactElement => (
    <form
      className={
        boot ? "playground-open playground-open--boot" : "playground-open"
      }
      onSubmit={onSubmitPath}
    >
      <div className="playground-open__brand">
        <img src="/brand/prism-mark.png" alt="" width={22} height={22} />
        <span>Prism</span>
      </div>
      <label className="playground-open__label" htmlFor="playground-root">
        Repository
      </label>
      {repoOptions.length > 0 ? (
        <Select
          id="playground-root"
          aria-label="Repository"
          className="playground-open__select"
          value={selectValue}
          options={repoOptions}
          onChange={(next) => openRoot(next)}
        />
      ) : (
        <input
          id="playground-root"
          value={draftRoot}
          onChange={(e) => setDraftRoot(e.target.value)}
          placeholder="Absolute path to repository"
          aria-label="Absolute path to repository"
          spellCheck={false}
        />
      )}
      <button type="submit">{boot ? "Start Indexing" : "Re-Index"}</button>
      {!boot ? (
        loading ? (
          <span className="playground-open__status">Indexing…</span>
        ) : error ? (
          <span className="playground-open__status playground-open__status--err">
            {error}
          </span>
        ) : (
          <span className="playground-open__status">
            {map?.generatedAt
              ? `Last indexed ${new Date(map.generatedAt).toLocaleString()}`
              : rootLabel}
          </span>
        )
      ) : null}
    </form>
  );

  const shell = (children: ReactElement): ReactElement => (
    <PrismErrorBoundary label="Prism">
      <PrismToastHost />
      <AppShellClientProvider client={client}>
        <PrismErrorBoundary label={view} resetKey={view}>
          {children}
        </PrismErrorBoundary>
      </AppShellClientProvider>
    </PrismErrorBoundary>
  );

  const wakeScreen = (
    <div className="wake-page prism-theme">
      <PrismWakeScreen
        here="spectrum"
        dispatchLive={dispatchLive}
        spectrumLive={true}
        {...(root
          ? { spectrumBlurb: `Maps, DNA, blast radius for ${rootLabel}.` }
          : {})}
        onOpenDispatch={() =>
          window.open(dispatchUrl, "_blank", "noopener,noreferrer")
        }
        onOpenSpectrum={() => {
          setWake(false);
          if (selectValue) openRoot(selectValue);
          setView("overview");
        }}
        onClose={() => setView(view)}
      >
        {repoPicker(true)}
      </PrismWakeScreen>
    </div>
  );

  if (error && !map) {
    return shell(
      <div className="prism-boot prism-theme">
        <img src="/brand/prism-mark.png" alt="" width={28} height={28} />
        <p className="prism-boot__brand">Prism</p>
        <p className="prism-boot__msg">Could not load map</p>
        <p className="prism-boot__detail">{error}</p>
        {repoPicker(true)}
      </div>,
    );
  }

  if (wake) {
    return shell(wakeScreen);
  }

  if (!root) {
    return shell(
      loading ? (
        <PrismBootScreen
          title="Looking up repository…"
          hint="Local workspace · no network"
          stages={PRISM_BOOT_LOOKUP_STAGES}
        />
      ) : (
        wakeScreen
      ),
    );
  }

  if (!map) {
    return shell(
      <PrismBootScreen
        title={loading ? "Indexing repository…" : "Charting repository…"}
        detail={rootLabel}
      />,
    );
  }

  return shell(
    <div className="playground-shell">
      {repoPicker(false)}

      <div className="playground-shell__map">
        {view === "overview" ? (
          <OverviewScreen
            map={map}
            repoLabel={rootLabel}
            gitActivity={gitActivity}
            gitStatus={gitStatus}
            health={health}
            dna={dna}
            jobs={archiveJobs}
            workspacePath={root}
            onNavigate={navigate}
            onOpenEnvelope={() => openIrisPane("envelope")}
            onOpenDna={() => setView("dna")}
            onOpenBlast={(seedPath) => {
              setBlastSeedPath(seedPath ?? null);
              setView("blast");
            }}
            onOpenTrends={() => setView("trends")}
            onOpenIntegrations={() => setView("integrations")}
            onOpenReview={() => setView("review")}
            onOpenExplain={() => setView("explain")}
            onOpenGuard={() => setView("guard")}
            onOpenSettings={() => {
              setSettingsSection("general");
              setView("settings");
            }}
            onRefresh={() => {
              void refreshGit(root);
            }}
            onSyncGit={() => refreshGit(root)}
          />
        ) : view === "dna" ? (
          <DnaScreen
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            dna={dna}
            health={health}
            map={map}
            onNavigate={navigate}
            onOpenBlast={(seedPath) => {
              setBlastSeedPath(seedPath ?? null);
              setView("impact");
            }}
            onOpenAuditLogs={openAuditLogs}
            trees={
              <TreesView
                workspacePath={root}
                repoLabel={rootLabel}
                onOpenJob={() => setView("jobs")}
              />
            }
          />
        ) : view === "iris" || view === "jobs" || view === "skills" ? (
          <ConsoleHubScreen
            view={view}
            {...(view === "iris" && irisPane ? { irisPane } : {})}
            repoLabel={rootLabel}
            workspacePath={root}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            status={consoleStatus}
            onRetry={refreshConsoleStatus}
            onNavigate={navigate}
            onIrisPane={(pane) => {
              if (pane) openIrisPane(pane);
              else setView("iris");
            }}
          />
        ) : view === "impact" ||
          view === "blast" ||
          view === "review" ||
          view === "explain" ||
          view === "guard" ? (
          <BlastRadiusScreen
            key="impact"
            root={root}
            repoLabel={rootLabel}
            branch={gitActivity?.summary?.branch}
            user={gitActivity?.recentCommits[0] ?? null}
            initialFile={blastSeedPath}
            initialTab={
              view === "explain"
                ? "explain"
                : view === "review"
                  ? "review"
                  : view === "guard"
                    ? "guard"
                    : "blast"
            }
            onNavigate={navigate}
            onOpenPath={(path) => {
              // Playground has no editor host — surface the path for copy/debug.
              console.info(`[playground] open path: ${path}`);
            }}
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
            jobs={archiveJobs}
            workspacePath={root}
            onNavigate={navigate}
            fetchHealthHistory={() => fetchHealthHistory(root)}
            fetchRegionMovers={() => fetchRegionMovers(root)}
            startHealthHistoryBackfill={() => startHealthHistoryBackfill(root)}
            fetchHealthHistoryBackfillStatus={() =>
              fetchHealthHistoryBackfillStatus(root)
            }
            onNotify={showPrismToast}
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
            {...(consoleStatus ? { consoleStatus } : {})}
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
            onNavigate={navigate}
          />
        ) : (
          <OverviewScreen
            map={map}
            repoLabel={rootLabel}
            gitActivity={gitActivity}
            gitStatus={gitStatus}
            health={health}
            dna={dna}
            jobs={archiveJobs}
            workspacePath={root}
            onNavigate={navigate}
            onOpenEnvelope={() => openIrisPane("envelope")}
            onOpenDna={() => setView("dna")}
            onOpenBlast={(seedPath) => {
              setBlastSeedPath(seedPath ?? null);
              setView("impact");
            }}
            onOpenTrends={() => setView("trends")}
            onOpenIntegrations={() => setView("integrations")}
            onOpenReview={() => setView("review")}
            onOpenExplain={() => setView("explain")}
            onOpenGuard={() => setView("guard")}
            onOpenSettings={() => {
              setSettingsSection("general");
              setView("settings");
            }}
            onRefresh={() => {
              void refreshGit(root);
            }}
            onSyncGit={() => refreshGit(root)}
          />
        )}
      </div>
    </div>,
  );
}
