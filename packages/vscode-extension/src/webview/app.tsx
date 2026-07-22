import { createRoot } from "react-dom/client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { RepositoryMapView } from "@prism/ui";
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
  fetchDashboard,
  fetchDependencyGraph,
  fetchOverlay,
  fetchReindex,
  fetchRepositoryMap,
  handleHostMessage,
  openFile,
  postToHost,
  type DashboardPayload,
} from "./host-client.js";
import { OverviewScreen } from "./ui/OverviewScreen.js";
import { DnaScreen } from "./ui/DnaScreen.js";
import { DomainsScreen } from "./ui/DomainsScreen.js";
import { DomainScreen, type DomainOverlayStatus } from "./ui/DomainScreen.js";
import { BlastRadiusScreen } from "./ui/BlastRadiusScreen.js";
import { TrendsScreen } from "./ui/TrendsScreen.js";
import { IntegrationsScreen } from "./ui/IntegrationsScreen.js";
import { SettingsScreen } from "./ui/SettingsScreen.js";
import { AppSidebar } from "./ui/AppSidebar.js";
import "./ui/overview.css";
import "./ui/appnav.css";

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
}: {
  message: string;
  kind: "info" | "error" | "loading";
}): ReactElement {
  return (
    <div className="prism-webview-status" data-kind={kind}>
      {message}
    </div>
  );
}

function App(): ReactElement {
  const brand = document.body.getAttribute("data-brand") ?? undefined;
  const [view, setView] = useState<AppView>("overview");
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

  const loadDashboard = useCallback(async () => {
    setBoot({ message: "Indexing repository…", kind: "loading" });
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
        setBoot({ message: msg.message, kind: msg.kind });
      }
      if ("type" in msg && msg.type === "navigate") {
        setView(msg.view);
        if (msg.domainId) setActiveDomain(msg.domainId);
      }
    };
    window.addEventListener("message", onMessage);
    postToHost({ type: "ready", view: "overview" });
    void loadDashboard();
    return () => window.removeEventListener("message", onMessage);
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

  const refreshGit = useCallback(() => {
    void loadDashboard();
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
  }, []);

  if (!dashboard || boot.kind === "loading" || boot.kind === "error") {
    return <Status message={boot.message || "Loading…"} kind={boot.kind} />;
  }

  const {
    repoLabel,
    root,
    gitActivity,
    health,
    dna,
    branch,
    map: dashMap,
  } = dashboard;
  const activeMap = map ?? dashMap;
  const user = gitActivity?.recentCommits[0] ?? null;
  const gitStatus: "loading" | "ready" | "error" = gitActivity
    ? "ready"
    : "error";

  if (view === "overview") {
    return (
      <OverviewScreen
        map={activeMap}
        repoLabel={repoLabel}
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
        onRefresh={refreshGit}
      />
    );
  }

  if (view === "dna" || view === "profile") {
    return (
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
      />
    );
  }

  if (view === "domains") {
    return (
      <DomainsScreen
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        dna={dna}
        onNavigate={onNavigate}
        onOpenDomain={openDomain}
      />
    );
  }

  if (view === "domain") {
    return (
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
  }

  if (view === "blast") {
    return (
      <BlastRadiusScreen
        root={root}
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        onNavigate={onNavigate}
      />
    );
  }

  if (view === "trends") {
    return (
      <TrendsScreen
        map={activeMap}
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        gitActivity={gitActivity}
        gitStatus={gitStatus}
        health={health}
        onNavigate={onNavigate}
      />
    );
  }

  if (view === "integrations") {
    return (
      <IntegrationsScreen
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        onNavigate={onNavigate}
      />
    );
  }

  if (view === "settings") {
    return (
      <SettingsScreen
        root={root}
        repoLabel={repoLabel}
        branch={branch}
        user={user}
        map={activeMap}
        autoDetected={false}
        zoom={zoom}
        layers={layers}
        indexing={indexing}
        onZoomChange={setZoom}
        onLayersChange={(next) => setLayers([...next])}
        onApplyWorkspace={() => undefined}
        onReindex={() => {
          setIndexing(true);
          void fetchReindex()
            .then(() => loadDashboard())
            .finally(() => setIndexing(false));
        }}
        onClearDomainCache={() => {
          domainRuns.current.clear();
        }}
        onNavigate={onNavigate}
      />
    );
  }

  // Map view
  return (
    <div className="playground-shell playground-shell--ext">
      <div className="playground-shell__map">
        <div className="playground-map-wrap">
          <div className="playground-map-inner">
            <RepositoryMapView
              map={activeMap}
              bookmarks={bookmarks}
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

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
