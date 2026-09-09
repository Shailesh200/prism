import type {
  CwvInsight,
  CwvMetric,
  CwvReport,
  DomainReport,
  DomainReportDomain,
  FrontendDomainReport,
} from "@repo-prism/shared";
import {
  CwvReportSchema,
  buildFrontendComponentBreakdown,
  buildFrontendRouteBreakdown,
  mergeFrontendRoutes,
} from "@repo-prism/shared";
import {
  CardIcon,
  EmptyState,
  Input,
  InfoTip,
  relativeTime,
  Select,
} from "@repo-prism/ui";
import {
  Activity,
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FlaskConical,
  Layers,
  ListChecks,
  Loader2,
  Monitor,
  Package,
  Play,
  Settings,
  Smartphone,
  Upload,
} from "lucide-react";
import type { ReactElement, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BundleWeightPanel,
  type BundleWeightPanelHandle,
} from "../BundleWeightPanel.js";
import { useAppShellClient } from "../client-context.js";
import { useConsentGranted } from "../consent-state.js";
import {
  LIGHTHOUSE_CATEGORIES,
  cwvFieldReportFromPagespeedJson,
  cwvReportFromLighthouseJson,
  formatCwvValue,
  heuristicFrontendRoutes,
  metricsFromLighthouseJson,
  ratingClass,
  ratingLabel,
  scoreRating,
} from "../cwv-parse.js";
import {
  isLighthouseEnabledInFrontend,
  loadIntegrationsState,
} from "../integrations-store.js";
import { DomainShell } from "./DomainShell.js";
import { DOMAINS, domainSubtitle, type DomainScreenProps } from "./shared.js";
import {
  domainStoreKey,
  readStore,
  writeStore,
  type CwvSnapshot,
} from "./store.js";

type CwvSource = "local" | "pagespeed";

function cwvRatingSourceLabel(source: CwvSource): string {
  return source === "pagespeed" ? "Field (CrUX)" : "Lab (Lighthouse)";
}

/**
 * Core Web Vitals we would surface once a local Lighthouse lab run (or an
 * imported CWV report) is available. Kept metadata-only — Prism does not
 * fabricate lab numbers, so tiles render an explicit "awaiting data" state.
 */
const CWV_METRICS: {
  id: string;
  name: string;
  goodLabel: string;
  poorLabel: string;
  desc: string;
}[] = [
  {
    id: "LCP",
    name: "Largest Contentful Paint",
    goodLabel: "≤ 2.5s",
    poorLabel: "> 4.0s",
    desc: "Time until the largest visible element (hero image, headline block) finishes rendering. Measures perceived load speed.",
  },
  {
    id: "INP",
    name: "Interaction to Next Paint",
    goodLabel: "≤ 200ms",
    poorLabel: "> 500ms",
    desc: "Responsiveness — the delay between a user interaction (tap/click/keypress) and the next visual update. Replaces FID.",
  },
  {
    id: "CLS",
    name: "Cumulative Layout Shift",
    goodLabel: "≤ 0.1",
    poorLabel: "> 0.25",
    desc: "Visual stability — how much page content unexpectedly shifts during load. Lower is better (unitless score).",
  },
  {
    id: "FCP",
    name: "First Contentful Paint",
    goodLabel: "≤ 1.8s",
    poorLabel: "> 3.0s",
    desc: "Time until the first piece of text or image is painted — the first signal the page is loading.",
  },
  {
    id: "TTFB",
    name: "Time to First Byte",
    goodLabel: "≤ 800ms",
    poorLabel: "> 1.8s",
    desc: "Server responsiveness — time from navigation start until the first byte of the response arrives.",
  },
];

/** Tooltip copy for non-CWV Lighthouse triage metrics. */
const TBT_DESC =
  "Total Blocking Time — the sum of time the main thread was blocked by long tasks during load. A lab proxy for INP (not a Core Web Vital).";

export function FrontendSection(props: DomainScreenProps): ReactElement {
  const def = DOMAINS.frontend!;
  const client = useAppShellClient();
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  // Frontend / CWV state
  const [cwvLocal, setCwvLocal] = useState<CwvReport | null>(null);
  const [cwvPagespeed, setCwvPagespeed] = useState<CwvReport | null>(null);
  const [cwvTbtMs, setCwvTbtMs] = useState<number | null>(null);
  const [labBusy, setLabBusy] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [labFellBack, setLabFellBack] = useState(false);
  /** Per-route Lighthouse console lines during progressive multi-route labs. */
  const [routeLabLogs, setRouteLabLogs] = useState<Record<string, string[]>>(
    {},
  );
  /** Route currently under Lighthouse during a progressive multi-route lab. */
  const [labMeasuringRoute, setLabMeasuringRoute] = useState<string | null>(
    null,
  );
  const labMeasuringRef = useRef<string | null>(null);
  /** Which section route-Analyze menu is open (`cwv` | `lh`). */
  const [labMenuOpen, setLabMenuOpen] = useState<"cwv" | "lh" | null>(null);
  /** Lab device profile for the next run (mobile = simulated Slow-4G). */
  const [labFormFactor, setLabFormFactor] = useState<"mobile" | "desktop">(
    "mobile",
  );
  const [topAnalyzeMenuOpen, setTopAnalyzeMenuOpen] = useState(false);
  const [labSelectMode, setLabSelectMode] = useState(false);
  const [selectedLabRoutes, setSelectedLabRoutes] = useState<string[]>([]);
  const cwvLabMenuRef = useRef<HTMLDivElement | null>(null);
  const lhLabMenuRef = useRef<HTMLDivElement | null>(null);
  const topAnalyzeMenuRef = useRef<HTMLDivElement | null>(null);
  const bundlePanelRef = useRef<BundleWeightPanelHandle | null>(null);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [cwvAccOpen, setCwvAccOpen] = useState(true);
  const [lhAccOpen, setLhAccOpen] = useState(true);
  const [bundleAccOpen, setBundleAccOpen] = useState(true);
  const [insightFilter, setInsightFilter] = useState<string | null>(null);
  const [pagespeedUrl, setPagespeedUrl] = useState("https://example.com");
  const [pagespeedBusy, setPagespeedBusy] = useState(false);
  const [pagespeedError, setPagespeedError] = useState<string | null>(null);
  const [cwvRestored, setCwvRestored] = useState(false);
  const [cwvSource, setCwvSource] = useState<CwvSource>("local");
  const [cwvSettingsOpen, setCwvSettingsOpen] = useState(false);
  const [discoveredRoutes, setDiscoveredRoutes] = useState<string[]>([]);
  const [liveDomainReport, setLiveDomainReport] = useState<DomainReport | null>(
    props.domainReport ?? null,
  );
  const cwvSettingsRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const cwvStoreKey = domainStoreKey(props.repoLabel, "frontend", "cwv");

  const pagespeedAllowed = useConsentGranted("network.pagespeed");
  const packageInstallAllowed = useConsentGranted("network.package-install");
  const integrations = loadIntegrationsState();
  const pagespeedConn = integrations.pagespeed;
  const pagespeedEnabled =
    pagespeedConn?.enabled === true &&
    pagespeedAllowed &&
    Boolean((pagespeedConn.config?.apiKey ?? "").trim());

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Frontend: restore the last CWV report so switching tabs keeps it (#5).
  useEffect(() => {
    if (props.domainId !== "frontend") return;
    const snap = readStore<CwvSnapshot>(cwvStoreKey);
    if (snap) {
      // Snapshots outlive schema additions (e.g. `warnings`) — parse on
      // restore so defaults migrate old payloads forward; drop what no
      // longer validates instead of crashing the screen.
      const localParsed = snap.local
        ? CwvReportSchema.safeParse(snap.local)
        : null;
      const pagespeedParsed = snap.pagespeed
        ? CwvReportSchema.safeParse(snap.pagespeed)
        : null;
      const local = localParsed?.success ? localParsed.data : null;
      const pagespeed = pagespeedParsed?.success ? pagespeedParsed.data : null;
      setCwvLocal(local);
      setCwvPagespeed(pagespeed);
      setCwvTbtMs(
        snap.tbtMs ?? (typeof local?.tbtMs === "number" ? local.tbtMs : null),
      );
      setLabFellBack(snap.fellBack);
      setLastRunAt((prev) => prev ?? snap.at);
    }
    setCwvRestored(true);
  }, [props.domainId, cwvStoreKey]);

  // Frontend: persist the CWV report whenever it changes (after restore).
  useEffect(() => {
    if (props.domainId !== "frontend" || !cwvRestored) return;
    if (!cwvLocal && !cwvPagespeed) return;
    const snapshot: CwvSnapshot = {
      local: cwvLocal,
      pagespeed: cwvPagespeed,
      tbtMs: cwvTbtMs,
      at: lastRunAt ?? Date.now(),
      fellBack: labFellBack,
    };
    writeStore(cwvStoreKey, snapshot);
  }, [
    props.domainId,
    cwvRestored,
    cwvLocal,
    cwvPagespeed,
    cwvTbtMs,
    lastRunAt,
    labFellBack,
    cwvStoreKey,
  ]);

  useEffect(() => {
    setLiveDomainReport(props.domainReport ?? null);
  }, [props.domainReport]);

  // Refresh Core domain report when the open domain (or frontend CWV) changes.
  // Frontend waits for localStorage restore so we do not wipe a host-loaded
  // artifact with an empty lab state on first paint.
  useEffect(() => {
    const fetchReport = client.fetchDomainReport;
    if (!fetchReport) return;
    if (!cwvRestored) return;
    const domain = props.domainId as DomainReportDomain;
    let cancelled = false;
    void fetchReport({
      domain,
      cwvLocal,
      cwvPagespeed,
      cwvPreferredSource: cwvSource,
      loadLatestCwvArtifact: false,
    })
      .then((report) => {
        if (!cancelled && report) setLiveDomainReport(report);
      })
      .catch(() => {
        /* keep host / local fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    cwvRestored,
    props.domainId,
    props.repoLabel,
    cwvLocal,
    cwvPagespeed,
    cwvSource,
  ]);

  const frontendReport: FrontendDomainReport | null =
    liveDomainReport?.domain === "frontend" ? liveDomainReport : null;

  const frontendRoutes = useMemo(() => {
    if (frontendReport) return frontendReport.routes;
    const stack = props.dna?.stack;
    const signals = stack?.signals?.map((s) => s.id) ?? [];
    const evidencePaths = [
      ...(stack?.signals ?? []).flatMap((s) => s.evidence ?? []),
      ...(stack?.packages ?? []).flatMap((p) =>
        (p.profile.signals ?? []).flatMap((s) => s.evidence ?? []),
      ),
    ];
    const heuristic = heuristicFrontendRoutes(signals, evidencePaths);
    return mergeFrontendRoutes(heuristic, discoveredRoutes);
  }, [frontendReport, props.dna, discoveredRoutes]);

  useEffect(() => {
    if (frontendReport) return;
    let cancelled = false;
    const discover = client.discoverFrontendRoutes;
    if (!discover) return;
    void discover()
      .then((routes) => {
        if (!cancelled && Array.isArray(routes) && routes.length > 0) {
          setDiscoveredRoutes(routes);
        }
      })
      .catch(() => {
        /* keep heuristic fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [client, props.repoLabel, frontendReport]);

  // Report actually driving the frontend tiles (respects the CWV source pref).
  const cwvPrimaryReport =
    frontendReport?.cwv.primary ??
    (cwvSource === "pagespeed"
      ? (cwvPagespeed ?? cwvLocal)
      : (cwvLocal ?? cwvPagespeed));

  /**
   * Whether the primary view is backed by the PageSpeed (field/CrUX) report —
   * mirrors `selectPrimaryCwv`. Route rows / summary pills must label the
   * report actually shown, not the preference (a missing PageSpeed report
   * falls back to the local lab and must not be labelled "Field (CrUX)").
   */
  const cwvPrimaryIsField =
    cwvPagespeed !== null && (cwvSource === "pagespeed" || cwvLocal === null);
  const cwvPrimarySourceLabel = cwvRatingSourceLabel(
    cwvPrimaryIsField ? "pagespeed" : "local",
  );

  /**
   * Lab-derived insights: from the local lab when present, else the embedded
   * Lighthouse lab of the PageSpeed response. Never from CrUX field data
   * (CrUX has no audits).
   */
  const labInsights = useMemo(
    () =>
      cwvLocal !== null ? cwvLocal.insights : (cwvPagespeed?.insights ?? []),
    [cwvLocal, cwvPagespeed],
  );

  /** Lighthouse category scores (performance / a11y / best-practices / SEO). */
  const frontendCategories = useMemo(() => {
    const scores =
      frontendReport?.categoryScores ?? cwvPrimaryReport?.categoryScores ?? {};
    return LIGHTHOUSE_CATEGORIES.map((c) => ({
      ...c,
      score: typeof scores[c.id] === "number" ? scores[c.id]! : null,
    })).filter((c) => c.score !== null);
  }, [frontendReport, cwvPrimaryReport]);

  /** Route breakdown: Core report when present, else the shared builder. */
  const routeBreakdown = useMemo(() => {
    if (frontendReport) return frontendReport.routeBreakdown;
    return buildFrontendRouteBreakdown(frontendRoutes, cwvPrimaryReport);
  }, [frontendReport, frontendRoutes, cwvPrimaryReport]);

  /**
   * CWV "Metric breakdown" — per-metric band insights only (`metric-*`).
   * Audit diagnostics / opportunities (`audit-*`, `opp-*`) are Lighthouse
   * findings and live in the Lighthouse accordion instead.
   */
  const insightGroups = useMemo(() => {
    const metricOnly = labInsights.filter((i) => i.id.startsWith("metric-"));
    const filtered =
      insightFilter === null
        ? metricOnly
        : metricOnly.filter((i) => i.metricId === insightFilter);
    return {
      pain: filtered.filter((i) => i.severity === "pain"),
      improve: filtered.filter((i) => i.severity === "improve"),
      good: filtered.filter((i) => i.severity === "good"),
    };
  }, [labInsights, insightFilter]);

  /** Lighthouse audit diagnostics + opportunities from the lab run. */
  const labInsightGroups = useMemo(() => {
    const auditOnly = labInsights.filter((i) => !i.id.startsWith("metric-"));
    return {
      pain: auditOnly.filter((i) => i.severity === "pain"),
      improve: auditOnly.filter((i) => i.severity === "improve"),
      good: auditOnly.filter((i) => i.severity === "good"),
    };
  }, [labInsights]);

  /** Component breakdown: Core report when present, else the shared builder. */
  const componentBreakdown = useMemo(() => {
    if (frontendReport) return frontendReport.componentBreakdown;
    return buildFrontendComponentBreakdown(cwvPrimaryReport);
  }, [frontendReport, cwvPrimaryReport]);

  useEffect(() => {
    if (!cwvSettingsOpen) return;
    const onPointerDown = (event: MouseEvent): void => {
      const root = cwvSettingsRef.current;
      if (!root) return;
      if (event.target instanceof Node && !root.contains(event.target)) {
        setCwvSettingsOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setCwvSettingsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [cwvSettingsOpen]);

  useEffect(() => {
    if (!labMenuOpen && !topAnalyzeMenuOpen) return;
    const onPointerDown = (event: MouseEvent): void => {
      const roots = [
        cwvLabMenuRef.current,
        lhLabMenuRef.current,
        topAnalyzeMenuRef.current,
      ];
      const t = event.target;
      if (!(t instanceof Node)) return;
      if (roots.some((r) => r?.contains(t))) return;
      setLabMenuOpen(null);
      setTopAnalyzeMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setLabMenuOpen(null);
        setTopAnalyzeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [labMenuOpen, topAnalyzeMenuOpen]);

  /** Real Lighthouse unavailable — never invent sample numbers. */
  const applyNoLabAvailable = (reason: string): void => {
    setCwvLocal(null);
    setCwvTbtMs(null);
    setLabMeasuringRoute(null);
    labMeasuringRef.current = null;
    setLabFellBack(true);
    setLabError(reason);
  };

  const appendRouteLabLog = (route: string, message: string): void => {
    const line = message.trim();
    if (!line) return;
    setRouteLabLogs((prev) => {
      const cur = prev[route] ?? [];
      const next = [...cur, line];
      return {
        ...prev,
        [route]: next.length > 120 ? next.slice(-120) : next,
      };
    });
  };

  const runLocalLab = async (routes?: readonly string[]): Promise<void> => {
    setLabBusy(true);
    setLabError(null);
    setLabFellBack(false);
    setRouteLabLogs({});
    setLabMeasuringRoute(null);
    labMeasuringRef.current = null;
    setLabMenuOpen(null);
    setTopAnalyzeMenuOpen(false);
    setLabSelectMode(false);
    // Clear prior tiles / breakdown so re-run doesn't show stale numbers.
    setCwvLocal(null);
    setCwvTbtMs(null);
    setInsightFilter(null);
    try {
      if (!isLighthouseEnabledInFrontend()) {
        applyNoLabAvailable(
          "Enable Lighthouse / CWV under Integrations → Frontend, then retry Run local lab.",
        );
        return;
      }
      if (!packageInstallAllowed) {
        applyNoLabAvailable(
          "Allow “Install measurement tools” in Settings → Privacy. Prism installs the Lighthouse CLI from the npm registry into .prism/tools; system Chrome is used and fixture scores are never shown.",
        );
        return;
      }
      if (!client.runLighthouseLab) {
        applyNoLabAvailable(
          "Local Lighthouse isn’t available in this host. To get real CWV scores: (1) run Prism from the VS Code / Cursor extension, (2) ensure Chrome or Chromium is installed, (3) click Run local lab again — Prism builds + previews a production bundle (dev servers are skipped; they distort lab metrics). Or enable PageSpeed Insights under Integrations for remote lab scores.",
        );
        return;
      }
      let report: CwvReport | null = null;
      try {
        report = await client.runLighthouseLab({
          mode: "run",
          formFactor: labFormFactor,
          ...(routes && routes.length > 0 ? { routes: [...routes] } : {}),
          onProgress: (event) => {
            if (event.measuringRoute !== undefined) {
              labMeasuringRef.current = event.measuringRoute;
              setLabMeasuringRoute(event.measuringRoute);
            }
            if (event.message.trim() && labMeasuringRef.current) {
              appendRouteLabLog(labMeasuringRef.current, event.message);
            }
            if (event.report) {
              setCwvLocal(event.report);
              setCwvTbtMs(
                typeof event.report.tbtMs === "number"
                  ? event.report.tbtMs
                  : null,
              );
              setLabFellBack(false);
              setLabError(null);
            }
          },
        });
      } catch (err: unknown) {
        applyNoLabAvailable(
          err instanceof Error
            ? err.message
            : "Real Lighthouse run failed. Install Chrome/Chromium and serve the app locally, or use PageSpeed Insights from Integrations.",
        );
        return;
      }
      if (!report || report.source === "lab-fixture") {
        applyNoLabAvailable(
          "Real Lighthouse run unavailable (Chrome not found, or no production build could be started). Install Chrome/Chromium and let Prism build + preview a production bundle — dev servers are intentionally skipped because they distort lab metrics. Or connect PageSpeed Insights under Integrations. Sample/dummy lab data is never shown.",
        );
        return;
      }
      setCwvLocal(report);
      setCwvTbtMs(typeof report.tbtMs === "number" ? report.tbtMs : null);
      setLabFellBack(false);
      setLastRunAt(Date.now());
    } catch (err: unknown) {
      applyNoLabAvailable(err instanceof Error ? err.message : String(err));
    } finally {
      setLabMeasuringRoute(null);
      labMeasuringRef.current = null;
      setLabBusy(false);
    }
  };

  const openLabRouteSelect = (source: "cwv" | "lh"): void => {
    setLabMenuOpen(null);
    setTopAnalyzeMenuOpen(false);
    setLabSelectMode(true);
    // Route picker lives under Core Web Vitals; open that accordion, and keep
    // Lighthouse open when the pick was started from there.
    setCwvAccOpen(true);
    if (source === "lh") setLhAccOpen(true);
    setSelectedLabRoutes((prev) =>
      prev.length > 0
        ? prev
        : frontendRoutes.includes("/")
          ? ["/"]
          : frontendRoutes.slice(0, 1),
    );
  };

  const runBundleAnalyzeFromPanel = async (): Promise<void> => {
    setTopAnalyzeMenuOpen(false);
    setLabMenuOpen(null);
    setBundleAccOpen(true);
    setBundleBusy(true);
    try {
      await bundlePanelRef.current?.runAnalyze();
    } finally {
      setBundleBusy(false);
    }
  };

  /** Sequential: local lab (all routes) then Bundle Analyze. */
  const runAnalyseEverything = async (): Promise<void> => {
    setTopAnalyzeMenuOpen(false);
    setCwvAccOpen(true);
    setLhAccOpen(true);
    setBundleAccOpen(true);
    await runLocalLab(frontendRoutes);
    await runBundleAnalyzeFromPanel();
  };

  const frontendBusy = labBusy || bundleBusy;

  const renderRouteAnalyzeMenu = (
    section: "cwv" | "lh",
    menuRef: RefObject<HTMLDivElement | null>,
  ): ReactElement => (
    <div className="dm-lab-menu" ref={menuRef}>
      <button
        type="button"
        className="ov-btn ov-btn--primary"
        disabled={frontendBusy}
        aria-expanded={labMenuOpen === section}
        aria-haspopup="menu"
        onClick={() => {
          setTopAnalyzeMenuOpen(false);
          setLabMenuOpen((v) => (v === section ? null : section));
        }}
      >
        {labBusy ? (
          <Loader2 size={13} aria-hidden className="bw-spin" />
        ) : (
          <FlaskConical size={13} aria-hidden />
        )}
        {labBusy ? "Analyzing…" : "Analyze"}
        <ChevronDown size={13} aria-hidden />
      </button>
      {labMenuOpen === section && !frontendBusy ? (
        <div className="dm-lab-menu__pop" role="menu">
          <button
            type="button"
            className="dm-lab-menu__item"
            role="menuitem"
            onClick={() => void runLocalLab(frontendRoutes)}
          >
            <ListChecks size={14} aria-hidden />
            Analyse all routes
            <span className="dm-lab-menu__meta">
              {frontendRoutes.length} listed
            </span>
          </button>
          <button
            type="button"
            className="dm-lab-menu__item"
            role="menuitem"
            onClick={() => openLabRouteSelect(section)}
          >
            <FlaskConical size={14} aria-hidden />
            Analyse selected routes…
          </button>
          <div className="dm-lab-menu__sep" role="separator" />
          {(["mobile", "desktop"] as const).map((ff) => (
            <button
              key={ff}
              type="button"
              className="dm-lab-menu__item"
              role="menuitemradio"
              aria-checked={labFormFactor === ff}
              onClick={() => setLabFormFactor(ff)}
            >
              {ff === "mobile" ? (
                <Smartphone size={14} aria-hidden />
              ) : (
                <Monitor size={14} aria-hidden />
              )}
              {ff === "mobile" ? "Mobile lab" : "Desktop lab"}
              <span className="dm-lab-menu__meta">
                {labFormFactor === ff ? "selected" : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  /** Pain / needs-work / good columns for a CwvInsight set (CWV + Lighthouse). */
  const renderInsightColumns = (groups: {
    readonly pain: readonly CwvInsight[];
    readonly improve: readonly CwvInsight[];
    readonly good: readonly CwvInsight[];
  }): ReactElement => (
    <div className="cwv-insights__grid">
      {(
        [
          ["pain", "Pain areas", groups.pain],
          ["improve", "Needs work", groups.improve],
          ["good", "Good", groups.good],
        ] as const
      ).map(([key, label, items]) => (
        <div
          key={key}
          className={`cwv-insights__col cwv-insights__col--${key}`}
        >
          <div className="cwv-insights__col-h">
            <span>{label}</span>
            <span className="cwv-insights__count">{items.length}</span>
          </div>
          {items.length === 0 ? (
            <p className="dm-note">None in this band.</p>
          ) : (
            <ul className="cwv-insights__list">
              {items.slice(0, 8).map((i) => (
                <li key={i.id} className="cwv-insights__item">
                  {i.metricId ? (
                    <span className="cwv-insights__metric">{i.metricId}</span>
                  ) : null}
                  <span className="cwv-insights__item-title">{i.title}</span>
                  {i.detail ? (
                    <span className="cwv-insights__item-detail">
                      {i.detail}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );

  const onImportCwv = (file: File | undefined): void => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const json: unknown = JSON.parse(text);
        const parsed = metricsFromLighthouseJson(json);
        if (parsed.metrics.length === 0) {
          setLabError("No LCP/INP/CLS/FCP audits found in that JSON.");
          return;
        }
        setCwvLocal(cwvReportFromLighthouseJson(json, "ingest"));
        setCwvTbtMs(parsed.tbtMs);
        setLabError(null);
        setLabFellBack(false);
        setLastRunAt(Date.now());
      } catch (err: unknown) {
        setLabError(
          err instanceof Error ? err.message : "Failed to parse CWV JSON",
        );
      }
    };
    reader.readAsText(file);
  };

  const fetchPagespeed = async (): Promise<void> => {
    const key = (pagespeedConn?.config?.apiKey ?? "").trim();
    setPagespeedBusy(true);
    setPagespeedError(null);
    try {
      if (!client.fetchPagespeedMetrics) {
        setPagespeedError("PageSpeed is not available in this host.");
        return;
      }
      const result = await client.fetchPagespeedMetrics(key, pagespeedUrl);
      if (!result.ok) {
        setPagespeedError(result.error);
        return;
      }
      // Field (CrUX) metrics for the tiles; the embedded Lighthouse lab run
      // still contributes category scores / insights to the Lighthouse
      // section and TBT to the lab proxy tile.
      const field = cwvFieldReportFromPagespeedJson(result.raw);
      setCwvPagespeed(field);
      if (cwvTbtMs === null) setCwvTbtMs(field.tbtMs ?? null);
      setLastRunAt(Date.now());
    } catch (err: unknown) {
      setPagespeedError(err instanceof Error ? err.message : String(err));
    } finally {
      setPagespeedBusy(false);
    }
  };

  const metricFor = (
    report: CwvReport | null,
    id: string,
  ): CwvMetric | undefined => report?.metrics.find((m) => m.id === id);

  const subtitle = domainSubtitle(props.repoLabel, props.branch);

  return (
    <DomainShell
      repoLabel={props.repoLabel}
      user={props.user ?? null}
      onNavigate={props.onNavigate}
      title={def.title}
      subtitle={subtitle}
      headerActions={
        <div className="dm-lab-menu" ref={topAnalyzeMenuRef}>
          <button
            type="button"
            className="ov-btn ov-btn--primary"
            disabled={frontendBusy}
            aria-expanded={topAnalyzeMenuOpen}
            aria-haspopup="menu"
            title={def.labNote}
            onClick={() => {
              setLabMenuOpen(null);
              setTopAnalyzeMenuOpen((v) => !v);
            }}
          >
            {frontendBusy ? (
              <Loader2 size={13} aria-hidden className="bw-spin" />
            ) : (
              <FlaskConical size={13} aria-hidden />
            )}
            {frontendBusy ? "Analyzing…" : "Analyze"}
            <ChevronDown size={13} aria-hidden />
          </button>
          {topAnalyzeMenuOpen && !frontendBusy ? (
            <div className="dm-lab-menu__pop" role="menu">
              <button
                type="button"
                className="dm-lab-menu__item"
                role="menuitem"
                onClick={() => void runAnalyseEverything()}
              >
                <ListChecks size={14} aria-hidden />
                Analyse Everything
                <span className="dm-lab-menu__meta">lab + bundle</span>
              </button>
              <button
                type="button"
                className="dm-lab-menu__item"
                role="menuitem"
                onClick={() => {
                  setTopAnalyzeMenuOpen(false);
                  setCwvAccOpen(true);
                  void runLocalLab(frontendRoutes);
                }}
              >
                <Activity size={14} aria-hidden />
                Analyse CWV
                <span className="dm-lab-menu__meta">
                  {frontendRoutes.length} routes
                </span>
              </button>
              <button
                type="button"
                className="dm-lab-menu__item"
                role="menuitem"
                onClick={() => {
                  setTopAnalyzeMenuOpen(false);
                  setLhAccOpen(true);
                  void runLocalLab(frontendRoutes);
                }}
              >
                <Monitor size={14} aria-hidden />
                Analyse Lighthouse
                <span className="dm-lab-menu__meta">
                  {frontendRoutes.length} routes
                </span>
              </button>
              <button
                type="button"
                className="dm-lab-menu__item"
                role="menuitem"
                onClick={() => void runBundleAnalyzeFromPanel()}
              >
                <Boxes size={14} aria-hidden />
                Analyse Bundle
              </button>
              <div className="dm-lab-menu__sep" role="separator" />
              {(["mobile", "desktop"] as const).map((ff) => (
                <button
                  key={ff}
                  type="button"
                  className="dm-lab-menu__item"
                  role="menuitemradio"
                  aria-checked={labFormFactor === ff}
                  onClick={() => setLabFormFactor(ff)}
                >
                  {ff === "mobile" ? (
                    <Smartphone size={14} aria-hidden />
                  ) : (
                    <Monitor size={14} aria-hidden />
                  )}
                  {ff === "mobile" ? "Mobile lab" : "Desktop lab"}
                  <span className="dm-lab-menu__meta">
                    {labFormFactor === ff ? "selected" : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      }
    >
      <>
        {lastRunAt !== null || labBusy ? (
          <div className="dm-runbar">
            <span className="dm-runbar__dot" aria-hidden />
            {labBusy
              ? `Lab running (${labFormFactor})… previous results cleared`
              : `Last run ${relativeTime(new Date(lastRunAt!).toISOString())}${
                  cwvLocal
                    ? ` · ${cwvLocal.source === "lab-fixture" ? "lab fixture" : cwvLocal.source}${cwvLocal.formFactor ? ` · ${cwvLocal.formFactor}` : ""}`
                    : ""
                }`}
            {!labBusy && (cwvLocal || cwvPagespeed) ? (
              <span className="dm-runbar__tools">
                <button
                  type="button"
                  className="dm-linkbtn"
                  onClick={() => importInputRef.current?.click()}
                >
                  <Upload size={12} aria-hidden />
                  Import
                </button>
              </span>
            ) : null}
          </div>
        ) : null}

        {labFellBack && labError ? (
          <div className="dm-warnbar" role="status">
            <AlertTriangle size={14} aria-hidden />
            <span>{labError}</span>
          </div>
        ) : labError ? (
          <div className="dm-warnbar" role="status">
            <AlertTriangle size={14} aria-hidden />
            <span>{labError}</span>
          </div>
        ) : null}

        <section className="ov-card ts-acc" aria-label="Core Web Vitals">
          <div className="ts-acc__header">
            <button
              type="button"
              className="ts-acc__trigger"
              aria-expanded={cwvAccOpen}
              onClick={() => setCwvAccOpen((v) => !v)}
            >
              <span className="ts-acc__chevron" aria-hidden>
                {cwvAccOpen ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </span>
              <h2 className="ts-head__title">
                <CardIcon icon={Activity} tone="brand" size={18} />
                Core Web Vitals
                <InfoTip label="Core Web Vitals">
                  Lab or imported Lighthouse metrics (LCP, INP, CLS, FCP, TTFB).
                  Lab runs measure a production build (mobile, simulated
                  throttling, median of 3 passes) — dev servers are skipped.
                  Prism never fabricates field data — numbers come from a local
                  lab run, imported JSON, or opt-in PageSpeed.
                </InfoTip>
              </h2>
            </button>
            <div className="ts-acc__actions">
              <div className="cwv__settings" ref={cwvSettingsRef}>
                <button
                  type="button"
                  className="dm-iconbtn"
                  aria-label="CWV source settings"
                  aria-expanded={cwvSettingsOpen}
                  title="CWV source settings"
                  onClick={() => setCwvSettingsOpen((v) => !v)}
                >
                  <Settings size={15} aria-hidden />
                </button>
                {cwvSettingsOpen ? (
                  <div
                    className="dm-popover"
                    role="dialog"
                    aria-label="CWV source"
                  >
                    <div className="dm-popover__h">CWV source</div>
                    <Select
                      aria-label="CWV data source"
                      value={cwvSource}
                      onChange={(v) => setCwvSource(v as CwvSource)}
                      options={[
                        { value: "local", label: "Local lab / import" },
                        {
                          value: "pagespeed",
                          label: "PageSpeed Insights",
                        },
                      ]}
                    />
                    <p className="dm-popover__note">
                      {pagespeedEnabled
                        ? "PageSpeed runs a network fetch only when selected."
                        : "PageSpeed needs an API key in Integrations + network enabled in Settings."}
                    </p>
                    {!pagespeedEnabled ? (
                      <button
                        type="button"
                        className="ov-btn ov-btn--ghost dm-popover__link"
                        onClick={() => props.onNavigate("integrations")}
                      >
                        <ExternalLink size={13} aria-hidden />
                        Open Integrations
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {renderRouteAnalyzeMenu("cwv", cwvLabMenuRef)}
            </div>
          </div>

          {cwvAccOpen ? (
            <div className="ts-acc__body">
              {cwvLocal && cwvLocal.warnings.length > 0 ? (
                <div className="dm-warnbar" role="alert">
                  <AlertTriangle size={14} aria-hidden />
                  <span>
                    <strong>Unreliable measurement.</strong>{" "}
                    {cwvLocal.warnings.join(" ")}
                  </span>
                </div>
              ) : null}
              <div className="cwv__grid">
                {CWV_METRICS.map((m) => {
                  const local = metricFor(cwvLocal, m.id);
                  const remote = metricFor(cwvPagespeed, m.id);
                  const primary =
                    cwvSource === "pagespeed"
                      ? (remote ?? local)
                      : (local ?? remote);
                  // TBT stands in whenever no lab *or* field INP exists
                  // — the badge says "Lab proxy", so this stays honest
                  // under a field-preferred view too.
                  const tbtFallback =
                    m.id === "INP" && !primary && cwvTbtMs !== null;
                  const displayRating = tbtFallback
                    ? scoreRating(
                        cwvTbtMs! <= 200 ? 1 : cwvTbtMs! <= 600 ? 0.6 : 0.3,
                      )
                    : primary?.rating;
                  const displayValue = tbtFallback
                    ? cwvTbtMs! >= 1000
                      ? `${(cwvTbtMs! / 1000).toFixed(2)}s`
                      : `${Math.round(cwvTbtMs!)}ms`
                    : primary
                      ? formatCwvValue(primary)
                      : "—";
                  const usingField =
                    primary === remote &&
                    remote !== undefined &&
                    (cwvSource === "pagespeed" || local === undefined);
                  const sourceLabel = cwvRatingSourceLabel(
                    usingField ? "pagespeed" : "local",
                  );
                  return (
                    <article
                      key={m.id}
                      className={`cwv-tile${insightFilter === m.id ? " cwv-tile--active" : ""}`}
                      title={m.name}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setInsightFilter((cur) => (cur === m.id ? null : m.id))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setInsightFilter((cur) =>
                            cur === m.id ? null : m.id,
                          );
                        }
                      }}
                    >
                      <div className="cwv-tile__head">
                        <span className="cwv-tile__k">
                          {m.id}
                          <InfoTip label={m.name}>
                            {m.desc} Good {m.goodLabel}; poor {m.poorLabel}.
                            {m.id === "INP"
                              ? " Lab runs often omit INP (needs real interactions); TBT is shown as a lab proxy when available."
                              : ""}
                          </InfoTip>
                        </span>
                        <span
                          className={`cwv-tile__badge ${ratingClass(displayRating)}`}
                        >
                          {tbtFallback
                            ? "Lab proxy"
                            : primary
                              ? `${sourceLabel} · ${ratingLabel(displayRating)}`
                              : "—"}
                        </span>
                      </div>
                      <div
                        className={`cwv-tile__v ${ratingClass(displayRating)}`}
                      >
                        {displayValue}
                      </div>
                      {tbtFallback ? (
                        <div className="cwv-tile__hint">
                          TBT (lab proxy · not field INP)
                        </div>
                      ) : local && remote ? (
                        <div className="cwv-tile__hint">
                          Lab (Lighthouse) {formatCwvValue(local)} · Field
                          (CrUX) {formatCwvValue(remote)}
                        </div>
                      ) : primary ? (
                        <div className="cwv-tile__hint">
                          {sourceLabel} · Good {m.goodLabel} · Poor{" "}
                          {m.poorLabel}
                        </div>
                      ) : (
                        <div className="cwv-tile__hint">
                          Good {m.goodLabel} · Poor {m.poorLabel}
                        </div>
                      )}
                      <div className="cwv-tile__band" aria-hidden>
                        <span className="cwv-tile__seg cwv-tile__seg--good" />
                        <span className="cwv-tile__seg cwv-tile__seg--warn" />
                        <span className="cwv-tile__seg cwv-tile__seg--poor" />
                      </div>
                    </article>
                  );
                })}
                {cwvTbtMs !== null && metricFor(cwvPrimaryReport, "INP") ? (
                  <article className="cwv-tile" title="Total Blocking Time">
                    <div className="cwv-tile__head">
                      <span className="cwv-tile__k">
                        TBT
                        <InfoTip label="Total Blocking Time">
                          {TBT_DESC}
                        </InfoTip>
                      </span>
                      <span
                        className={`cwv-tile__badge ${ratingClass(scoreRating(cwvTbtMs <= 200 ? 1 : cwvTbtMs <= 600 ? 0.6 : 0.3))}`}
                      >
                        Lab
                      </span>
                    </div>
                    <div className="cwv-tile__v">
                      {cwvTbtMs >= 1000
                        ? `${(cwvTbtMs / 1000).toFixed(2)}s`
                        : `${Math.round(cwvTbtMs)}ms`}
                    </div>
                    <div className="cwv-tile__hint">From Lighthouse audit</div>
                  </article>
                ) : null}
              </div>

              <p className="cwv-trust">
                Lab scores from local Chrome / Lighthouse — each run takes the
                median of 3 mobile-simulated passes (more stable LCP). Reliable
                for load triage (LCP, CLS, FCP, TTFB, categories). Field INP /
                CrUX needs PageSpeed or real-user data; lab INP is often empty
                and TBT is used as a proxy.
              </p>

              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  onImportCwv(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />

              <div className="card-masonry">
                {!cwvLocal &&
                !cwvPagespeed &&
                !labBusy &&
                lastRunAt === null ? (
                  <article className="ov-card">
                    <div className="ov-card__head">
                      <span className="ov-card__title">
                        <CardIcon icon={FlaskConical} tone="brand" size={14} />
                        Local lab &amp; import
                        <InfoTip label="Local lab & import">
                          Runs a real local Lighthouse lab (requires
                          Chrome/Chromium and a locally served app). Sample data
                          is never shown — if the lab can’t run, you’ll get
                          steps to enable it, or you can import a Lighthouse /
                          PageSpeed JSON report / use PageSpeed Insights.
                        </InfoTip>
                      </span>
                    </div>
                    <p className="dm-idle__desc" style={{ marginTop: 0 }}>
                      {def.description}
                    </p>
                    <div className="cwv-optin__actions">
                      <button
                        type="button"
                        className="ov-btn ov-btn--ghost"
                        onClick={() => importInputRef.current?.click()}
                      >
                        <Upload size={14} aria-hidden />
                        Import CWV report
                      </button>
                    </div>
                    <p className="dm-note dm-note--wrap">
                      In Chrome DevTools → Lighthouse → export JSON report, or
                      PageSpeed Insights → Download JSON, then import here.
                    </p>
                    {labError ? (
                      <p className="dm-idle__err">{labError}</p>
                    ) : null}
                  </article>
                ) : null}

                {cwvSource === "pagespeed" ? (
                  <article className="ov-card">
                    <div className="ov-card__head">
                      <span className="ov-card__title">
                        <CardIcon icon={Monitor} tone="violet" size={14} />
                        PageSpeed Insights
                        <InfoTip label="PageSpeed Insights">
                          Opt-in network fetch when Integrations · PageSpeed has
                          an API key and Settings allows network integrations.
                        </InfoTip>
                      </span>
                      <span className="ov-card__meta">
                        {pagespeedEnabled ? "Connected" : "Off"}
                      </span>
                    </div>
                    {pagespeedEnabled ? (
                      <>
                        <label className="dm-pipe__field">
                          <span className="dm-pipe__field-k">URL</span>
                          <Input
                            type="url"
                            value={pagespeedUrl}
                            onChange={(e) => setPagespeedUrl(e.target.value)}
                            placeholder="https://…"
                            aria-label="PageSpeed URL"
                          />
                        </label>
                        <button
                          type="button"
                          className="ov-btn ov-btn--primary"
                          disabled={pagespeedBusy}
                          onClick={() => void fetchPagespeed()}
                        >
                          {pagespeedBusy ? "Fetching…" : "Fetch PageSpeed"}
                        </button>
                        {pagespeedError ? (
                          <p className="dm-idle__err">{pagespeedError}</p>
                        ) : null}
                        {cwvPagespeed ? (
                          <p className="dm-note dm-note--wrap">
                            {cwvPagespeed.callout}
                          </p>
                        ) : null}
                        {cwvLocal && cwvPagespeed ? (
                          <p className="dm-note">
                            Tiles above show lab (local / imported) vs field
                            (CrUX) side by side when both are present.
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <EmptyState>
                          Enable PageSpeed under Integrations and Allow network
                          integrations in Settings.
                        </EmptyState>
                        <button
                          type="button"
                          className="ov-btn ov-btn--ghost"
                          onClick={() => props.onNavigate("integrations")}
                        >
                          <ExternalLink size={13} aria-hidden />
                          Open Integrations
                        </button>
                      </>
                    )}
                  </article>
                ) : null}
              </div>

              {(insightGroups.pain.length > 0 ||
                insightGroups.improve.length > 0 ||
                insightGroups.good.length > 0) && (
                <div className="cwv-insights">
                  <div className="cwv-insights__h">
                    Metric breakdown
                    {insightFilter ? (
                      <button
                        type="button"
                        className="dm-linkbtn"
                        onClick={() => setInsightFilter(null)}
                      >
                        Clear {insightFilter} filter
                      </button>
                    ) : (
                      <span className="cwv-insights__hint">
                        Click a CWV tile to filter · per-metric bands from the
                        lab report
                      </span>
                    )}
                  </div>
                  {renderInsightColumns(insightGroups)}
                </div>
              )}

              <div className="dm-routes">
                <div className="dm-routes__head">
                  <span className="dm-routes__title">
                    <CardIcon icon={Layers} tone="brand" size={14} />
                    Routes &amp; components
                    <InfoTip label="Routes & components">
                      Routes are discovered from the workspace (React Router,
                      SEO catalogs, Next pages). Use Analyze on Core Web Vitals
                      or Lighthouse to measure all routes or a selected subset.
                      Soft 404 / not-found pages are skipped. Each route card
                      shows its own lab console while measuring.
                    </InfoTip>
                  </span>
                  <span className="dm-routes__meta">
                    {routeBreakdown.filter((r) => r.measured).length} measured ·{" "}
                    {routeBreakdown.length} listed
                  </span>
                </div>
                {labSelectMode ? (
                  <div
                    className="dm-route-select"
                    role="group"
                    aria-label="Select routes"
                  >
                    <div className="dm-route-select__head">
                      <span>
                        Select routes to measure ({selectedLabRoutes.length}{" "}
                        selected)
                      </span>
                      <div className="dm-route-select__actions">
                        <button
                          type="button"
                          className="dm-linkbtn"
                          onClick={() =>
                            setSelectedLabRoutes([...frontendRoutes])
                          }
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="dm-linkbtn"
                          onClick={() => setSelectedLabRoutes([])}
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          className="dm-linkbtn"
                          onClick={() => setLabSelectMode(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="ov-btn ov-btn--primary"
                          disabled={labBusy || selectedLabRoutes.length === 0}
                          onClick={() => void runLocalLab(selectedLabRoutes)}
                        >
                          <Play size={13} aria-hidden />
                          Run selected
                        </button>
                      </div>
                    </div>
                    <div className="dm-route-select__list">
                      {frontendRoutes.map((route) => {
                        const checked = selectedLabRoutes.includes(route);
                        return (
                          <label
                            key={`sel:${route}`}
                            className="dm-route-select__row"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelectedLabRoutes((prev) =>
                                  checked
                                    ? prev.filter((r) => r !== route)
                                    : [...prev, route],
                                );
                              }}
                            />
                            <span className="ov-mono">{route}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {routeBreakdown.length > 0 ? (
                  <div className="dm-routes__grid">
                    {routeBreakdown.map((r) => {
                      const isMeasuring =
                        labBusy && labMeasuringRoute === r.route;
                      const isQueued =
                        labBusy &&
                        !r.measured &&
                        !isMeasuring &&
                        cwvLocal !== null;
                      const logs = routeLabLogs[r.route] ?? [];
                      return (
                        <article
                          key={r.route}
                          className={`dm-route-card${r.measured ? " dm-route-card--measured" : ""}${isMeasuring ? " dm-route-card--measuring" : ""}`}
                        >
                          <div className="dm-route-card__head">
                            <span className="dm-route-card__path ov-mono">
                              {r.route}
                              {isMeasuring ? (
                                <span className="dm-rank__tag dm-rank__tag--live">
                                  {" "}
                                  measuring…
                                </span>
                              ) : r.measured ? (
                                <span className="dm-rank__tag"> measured</span>
                              ) : isQueued ? (
                                <span className="dm-rank__tag dm-rank__tag--muted">
                                  {" "}
                                  queued
                                </span>
                              ) : (
                                <span className="dm-rank__tag dm-rank__tag--muted">
                                  {" "}
                                  not measured
                                </span>
                              )}
                            </span>
                            <span
                              className={`dm-rank__pill ${isMeasuring ? "dm-rating--live" : ratingClass(r.rating)}`}
                            >
                              {isMeasuring
                                ? "Running"
                                : r.measured
                                  ? `${cwvPrimarySourceLabel} · ${ratingLabel(r.rating)}`
                                  : "—"}
                            </span>
                          </div>
                          {isMeasuring && r.metrics.length === 0 ? (
                            <p className="dm-route__empty dm-route__empty--live">
                              Lighthouse is scoring this route…
                            </p>
                          ) : r.metrics.length > 0 ? (
                            <div className="dm-route__cwv">
                              {CWV_METRICS.map((meta) => {
                                const m = r.metrics.find(
                                  (x) => x.id === meta.id,
                                );
                                if (!m) return null;
                                return (
                                  <article
                                    key={`${r.route}:${meta.id}`}
                                    className="cwv-tile cwv-tile--compact"
                                    title={meta.name}
                                  >
                                    <div className="cwv-tile__head">
                                      <span className="cwv-tile__k">
                                        {meta.id}
                                      </span>
                                      <span
                                        className={`cwv-tile__badge ${ratingClass(m.rating)}`}
                                      >
                                        {cwvPrimarySourceLabel} ·{" "}
                                        {ratingLabel(m.rating)}
                                      </span>
                                    </div>
                                    <div
                                      className={`cwv-tile__v ${ratingClass(m.rating)}`}
                                    >
                                      {formatCwvValue(m)}
                                    </div>
                                    <div className="cwv-tile__hint">
                                      Good {meta.goodLabel} · Poor{" "}
                                      {meta.poorLabel}
                                    </div>
                                    <div className="cwv-tile__band" aria-hidden>
                                      <span className="cwv-tile__seg cwv-tile__seg--good" />
                                      <span className="cwv-tile__seg cwv-tile__seg--warn" />
                                      <span className="cwv-tile__seg cwv-tile__seg--poor" />
                                    </div>
                                  </article>
                                );
                              })}
                              {/* Any non-CWV metrics (e.g. TBT) still surface as tiles */}
                              {r.metrics
                                .filter(
                                  (m) =>
                                    !CWV_METRICS.some(
                                      (meta) => meta.id === m.id,
                                    ),
                                )
                                .map((m) => (
                                  <article
                                    key={`${r.route}:${m.id}`}
                                    className="cwv-tile cwv-tile--compact"
                                    title={m.id}
                                  >
                                    <div className="cwv-tile__head">
                                      <span className="cwv-tile__k">
                                        {m.id}
                                      </span>
                                      <span
                                        className={`cwv-tile__badge ${ratingClass(m.rating)}`}
                                      >
                                        {cwvPrimarySourceLabel} ·{" "}
                                        {ratingLabel(m.rating)}
                                      </span>
                                    </div>
                                    <div
                                      className={`cwv-tile__v ${ratingClass(m.rating)}`}
                                    >
                                      {formatCwvValue(m)}
                                    </div>
                                    <div className="cwv-tile__band" aria-hidden>
                                      <span className="cwv-tile__seg cwv-tile__seg--good" />
                                      <span className="cwv-tile__seg cwv-tile__seg--warn" />
                                      <span className="cwv-tile__seg cwv-tile__seg--poor" />
                                    </div>
                                  </article>
                                ))}
                            </div>
                          ) : (
                            <p className="dm-route__empty">
                              {r.measured
                                ? "Sampled — no per-metric rollup"
                                : isQueued
                                  ? "Waiting in queue — will measure after the current route finishes."
                                  : "Not measured in this lab run. Use Analyze → selected routes to include it, or all routes."}
                            </p>
                          )}
                          {r.notes.length > 0 ? (
                            <ul className="dm-route__notes">
                              {r.notes.map((note) => (
                                <li key={note} title={note}>
                                  {note}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {logs.length > 0 || isMeasuring ? (
                            <details
                              className="dm-route__console"
                              open={isMeasuring}
                            >
                              <summary>
                                Lab console
                                {isMeasuring
                                  ? " · running"
                                  : ` · ${logs.length} lines`}
                              </summary>
                              <pre className="dm-route__console-log">
                                {logs.length > 0
                                  ? logs.join("\n")
                                  : "Waiting for Lighthouse output…"}
                              </pre>
                            </details>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState>
                    No routes discovered yet — open the workspace and ensure the
                    frontend app is indexed.
                  </EmptyState>
                )}
                {componentBreakdown.length > 0 ? (
                  <>
                    <div className="dm-subhead">Components</div>
                    <div className="dm-rank">
                      {componentBreakdown.map((c) => (
                        <div key={`c:${c.key}`} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {c.key}
                            </span>
                            <span className="dm-rank__path">
                              {c.metrics.length > 0
                                ? c.metrics
                                    .slice(0, 3)
                                    .map((m) => `${m.id} ${formatCwvValue(m)}`)
                                    .join(" · ")
                                : "Component"}
                            </span>
                          </div>
                          <span className="dm-rank__val ov-mono">
                            {c.sampleCount > 0 ? `${c.sampleCount}×` : "attr"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="dm-note">
                    Component-level attribution appears when the report includes
                    component rollups or attributions (e.g. fixture /
                    PageSpeed). Lab runs show element selectors on each route
                    card and under Metric breakdown.
                  </p>
                )}
              </div>

              <p className="dm-foot">
                Core Web Vitals are field/lab measurements — Prism never
                fabricates them. Numbers appear here after a local Lighthouse
                run or an imported CWV report.
              </p>
            </div>
          ) : null}
        </section>

        <section className="ov-card ts-acc" aria-label="Lighthouse">
          <div className="ts-acc__header">
            <button
              type="button"
              className="ts-acc__trigger"
              aria-expanded={lhAccOpen}
              onClick={() => setLhAccOpen((v) => !v)}
            >
              <span className="ts-acc__chevron" aria-hidden>
                {lhAccOpen ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </span>
              <h2 className="ts-head__title">
                <CardIcon icon={Monitor} tone="violet" size={18} />
                Lighthouse
                <InfoTip label="Lighthouse">
                  Lab results from a Lighthouse run: category scores (0–100) —
                  performance, accessibility, best practices, SEO — plus audit
                  insights (LCP element, layout-shift nodes, opportunities with
                  estimated savings). Uses the same local lab as Core Web
                  Vitals; field (CrUX) data stays in the CWV section.
                </InfoTip>
              </h2>
            </button>
            <div className="ts-acc__actions">
              {renderRouteAnalyzeMenu("lh", lhLabMenuRef)}
            </div>
          </div>

          {lhAccOpen ? (
            <div className="ts-acc__body">
              {frontendCategories.length > 0 ? (
                <div className="dm-cats" style={{ marginTop: 0 }}>
                  <div className="dm-cats__grid">
                    {frontendCategories.map((c) => {
                      const rating = scoreRating(c.score);
                      return (
                        <article key={c.id} className="dm-cat">
                          <div className="dm-cat__k">
                            {c.label}
                            <InfoTip label={c.label}>{c.desc}</InfoTip>
                          </div>
                          <div className={`dm-cat__v ${ratingClass(rating)}`}>
                            {Math.round((c.score ?? 0) * 100)}
                          </div>
                          <div className="dm-cat__bar" aria-hidden>
                            <span
                              className={`dm-cat__fill ${ratingClass(rating)}`}
                              style={{
                                width: `${(c.score ?? 0) * 100}%`,
                              }}
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="ts-empty">
                  No Lighthouse category scores yet. Use Analyze to run a local
                  lab (same run also fills Core Web Vitals).
                </p>
              )}

              {labInsightGroups.pain.length > 0 ||
              labInsightGroups.improve.length > 0 ||
              labInsightGroups.good.length > 0 ? (
                <div className="cwv-insights">
                  <div className="cwv-insights__h">
                    Lab insights
                    <span className="cwv-insights__hint">
                      {cwvLocal
                        ? "Lighthouse audits from the local lab run (elements, opportunities, savings)"
                        : "Lighthouse audits from the PageSpeed lab run (elements, opportunities, savings)"}
                    </span>
                  </div>
                  {renderInsightColumns(labInsightGroups)}
                </div>
              ) : frontendCategories.length > 0 ? (
                <p className="dm-note">
                  No audit insights in this Lighthouse report.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="ov-card ts-acc" aria-label="Bundle Weight">
          <div className="ts-acc__header">
            <button
              type="button"
              className="ts-acc__trigger"
              aria-expanded={bundleAccOpen}
              onClick={() => setBundleAccOpen((v) => !v)}
            >
              <span className="ts-acc__chevron" aria-hidden>
                {bundleAccOpen ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </span>
              <h2 className="ts-head__title">
                <CardIcon icon={Boxes} tone="amber" size={18} />
                Bundle / Weight
                <InfoTip label="Bundle Weight">
                  Real bundler stats from a local Analyze run (project analyze
                  script when present, else Prism-managed for Next / Vite /
                  Webpack). Prism never invents production sizes from the import
                  graph.
                </InfoTip>
              </h2>
            </button>
            <div className="ts-acc__actions">
              <button
                type="button"
                className="ov-btn ov-btn--primary"
                disabled={frontendBusy}
                title="Run Bundle Analyze for the selected package"
                onClick={() => void runBundleAnalyzeFromPanel()}
              >
                {bundleBusy ? (
                  <Loader2 size={13} aria-hidden className="bw-spin" />
                ) : (
                  <Package size={13} aria-hidden />
                )}
                {bundleBusy ? "Analyzing…" : "Analyze"}
              </button>
            </div>
          </div>

          <div className="ts-acc__body" hidden={!bundleAccOpen}>
            <BundleWeightPanel
              ref={bundlePanelRef}
              repoLabel={props.repoLabel}
              embedded
            />
          </div>
        </section>
      </>
    </DomainShell>
  );
}
