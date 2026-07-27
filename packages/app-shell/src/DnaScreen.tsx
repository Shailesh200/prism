import type {
  CodeExplorerReport,
  DnaReport,
  EngineeringHealthReport,
  HealthScore,
  RepositoryMap,
} from "@prism/shared";
import { CardIcon, type CardIconTone, InfoTip, Input } from "@prism/ui";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Code,
  FlaskConical,
  GitBranch,
  Layers,
  Lightbulb,
  Network,
  Package,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import type {
  ComponentType,
  CSSProperties,
  FormEvent,
  ReactElement,
} from "react";
import { useEffect, useId, useState } from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { useAppShellClient } from "./client-context.js";
import { DOMAIN_CATALOG } from "./domain-catalog.js";
import {
  couplingBadge,
  couplingDensity,
  domainDisplayName,
} from "./overview-model.js";
import { describeSignal, signalDetectionTip } from "./stack-signal-meta.js";

const COUPLING_TONE_COLOR: Record<string, string> = {
  emerald: "#10B981",
  amber: "#F59E0B",
  rose: "#F43F5E",
};

const LANG_COLORS = [
  "#00C2C2",
  "#6C63FF",
  "#F59E0B",
  "#10B981",
  "#F43F5E",
  "#94A3B8",
];

type FactorMeta = {
  color: string;
  weight: number;
  icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>;
  blurb: string;
  formula: string;
  improve: readonly string[];
};

/**
 * Explains each health/DNA factor (ADR-0012): what it measures, its formula,
 * and concrete steps to improve — surfaced as the DNA tab's analytics.
 */
const FACTOR_META: Record<string, FactorMeta> = {
  parse_health: {
    color: "#10B981",
    weight: 25,
    icon: ShieldCheck,
    blurb:
      "Share of indexed files the analyzer parsed cleanly. Skipped or failed files mean the other metrics see less of your code.",
    formula: "analyzed files ÷ total files × 100",
    improve: [
      "Fix syntax / parse errors surfaced during indexing.",
      "Add analyzer plugin coverage for unsupported languages.",
      "Exclude generated or vendored files so they don't dilute the ratio.",
    ],
  },
  test_presence: {
    color: "#6C63FF",
    weight: 25,
    icon: FlaskConical,
    blurb:
      "Ratio of test files to source files. Reaches 100 at about 0.5 tests per source file.",
    formula: "min(100, (test files ÷ source files) ÷ 0.5 × 100)",
    improve: [
      "Add unit / integration tests beside untested modules.",
      "Use a domain's ‘untested’ list to target the biggest gaps.",
      "Co-locate *.test.ts / *.spec.ts with the code they cover.",
    ],
  },
  coupling: {
    color: "#F59E0B",
    weight: 25,
    icon: GitBranch,
    blurb:
      "Penalises import / re-export cycles between files (−20 points each; 100 = no cycles). This is NOT the dashboard's ‘Coupling Density’, which measures average dependencies per module (fan-out).",
    formula: "100 − (import cycles × 20)",
    improve: [
      "Break circular imports by extracting shared types/interfaces.",
      "Apply dependency inversion at module boundaries.",
      "Inspect cycles via the dependency graph / getCycles().",
    ],
  },
  modularity: {
    color: "#00C2C2",
    weight: 15,
    icon: Boxes,
    blurb:
      "Rewards clear structure — local packages and inferred feature boundaries.",
    formula: "min(100, 55 + (packages + features) × 10)",
    improve: [
      "Split large modules into workspace packages.",
      "Define clear feature folders / boundaries.",
      "Expose public surfaces through package index files.",
    ],
  },
  diagnostics: {
    color: "#F43F5E",
    weight: 10,
    icon: Activity,
    blurb:
      "Analyzer diagnostics density — fewer reported issues per file scores higher.",
    formula: "100 − (diagnostics ÷ files × 100)",
    improve: [
      "Resolve analyzer-reported diagnostics.",
      "Reduce type errors and unused symbols.",
      "Keep dependencies resolvable so analysis stays clean.",
    ],
  },
};

/** `data_ml_ai` → `Data Ml Ai`; `typescript` → `Typescript`. */
function titleCase(id: string): string {
  return id
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Primary Domain tech row: icon + name chips (same pattern as Frameworks & Libs). */
function PrimaryTechStack(props: {
  signals: readonly {
    id: string;
    domain: string;
    confidence: number;
    evidence?: readonly string[];
  }[];
}): ReactElement {
  const shown = props.signals.slice(0, 5);
  return (
    <div className="dna-primary__stack-wrap">
      <div
        className="dna-primary__stack dna-fw-note dna-fw-note--lg"
        role="list"
      >
        {shown.map((s) => {
          const m = describeSignal(s.id, s.domain);
          const TechIcon = m.icon;
          return (
            <span
              key={s.id}
              role="listitem"
              className="dna-fw-note__item dna-fw-note__item--lg"
              title={signalDetectionTip(s)}
            >
              <TechIcon size={16} aria-hidden />
              {m.label}
            </span>
          );
        })}
        {props.signals.length > 5 ? (
          <span className="dna-fw-note__more">+{props.signals.length - 5}</span>
        ) : null}
      </div>
    </div>
  );
}

export type DnaScreenProps = {
  readonly repoLabel: string;
  readonly branch?: string | undefined;
  readonly health?: HealthScore | null;
  /** Repository map — used for graph-derived metrics (coupling density). */
  readonly map?: RepositoryMap | null;
  /** `analysis` = health metrics deep-dive; `profile` = stack/tech profile. */
  readonly mode?: "analysis" | "profile";
  readonly user?: AppSidebarUser | null;
  readonly dna: DnaReport | null;
  readonly onNavigate: (view: AppView) => void;
  readonly onOpenDomain: (domainId: string) => void;
  /**
   * Open Settings → Audit Logs (falls back to Settings if omitted). Accepts an
   * optional audit category so callers can deep-link to a filtered view
   * (e.g. `index`, `analysis`). Hosts that ignore the argument still open the
   * unfiltered ("All") panel — backwards compatible with `() => void`.
   */
  readonly onOpenAuditLogs?: (category?: string) => void;
};

type BreakdownFactor = {
  readonly id: string;
  readonly label: string;
  readonly score: number;
  readonly note?: string | undefined;
  readonly breakdown?:
    | readonly { label: string; value: string | number }[]
    | undefined;
};

type CheckLogsTarget = {
  readonly category: string;
  readonly title: string;
  readonly hint?: string | undefined;
  readonly factor?: BreakdownFactor | undefined;
};

/**
 * Codebase DNA screen (M-043). Renders the real `getDna()` report: languages,
 * frameworks, detected stack domains, personas, and architecture hints. Theme-
 * adherent (dark tokens), not a pixel copy of the Stitch export.
 */
export function DnaScreen(props: DnaScreenProps): ReactElement {
  const { dna, health } = props;
  const client = useAppShellClient();
  const [breakdownFactor, setBreakdownFactor] =
    useState<BreakdownFactor | null>(null);
  const [checkLogsTarget, setCheckLogsTarget] =
    useState<CheckLogsTarget | null>(null);
  const [engHealth, setEngHealth] = useState<EngineeringHealthReport | null>(
    null,
  );
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [explorerQuery, setExplorerQuery] = useState("");
  const [explorerKind, setExplorerKind] = useState<"symbol" | "file">("symbol");
  const [explorerBusy, setExplorerBusy] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [explorerReport, setExplorerReport] =
    useState<CodeExplorerReport | null>(null);
  const breakdownTitleId = useId();
  const checkLogsTitleId = useId();
  const explorerTitleId = useId();
  const explorerInputId = useId();

  useEffect(() => {
    if (!breakdownFactor && !checkLogsTarget && !explorerOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setBreakdownFactor(null);
        setCheckLogsTarget(null);
        setExplorerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [breakdownFactor, checkLogsTarget, explorerOpen]);

  useEffect(() => {
    if ((props.mode ?? "analysis") !== "analysis") return;
    if (!client.fetchEngineeringHealth) return;
    let cancelled = false;
    void client.fetchEngineeringHealth().then((report) => {
      if (!cancelled) setEngHealth(report);
    });
    return () => {
      cancelled = true;
    };
  }, [client, props.mode, health?.score]);

  const languages = (dna?.languages ?? []).filter(
    (l) => Math.round(l.share * 100) > 0,
  );
  const frameworks = dna?.frameworks ?? [];
  const testRunners = dna?.testRunners ?? [];
  const hints = dna?.architectureHints ?? [];
  const stack = dna?.stack;
  const domains = stack?.domains ?? [];
  const personas = stack?.personas ?? [];
  const signals = stack?.signals ?? [];

  const packages = stack?.packages ?? [];
  const signalById = new Map<string, (typeof signals)[number]>();
  for (const s of signals) {
    const prev = signalById.get(s.id);
    if (prev === undefined) {
      signalById.set(s.id, s);
    } else {
      signalById.set(s.id, {
        ...prev,
        confidence: Math.max(prev.confidence, s.confidence),
        evidence: [...new Set([...prev.evidence, ...s.evidence])],
      });
    }
  }
  const sortedSignals = [...signalById.values()].sort(
    (a, b) => b.confidence - a.confidence,
  );

  const frameworkTip = (id: string): string =>
    signalDetectionTip(signalById.get(id));

  const primaryLang = languages[0];
  const primaryDomainId = dna?.primaryDomain ?? domains[0];

  const domainConfidence = (id: string): number =>
    signals
      .filter((s) => s.domain === id)
      .reduce((m, s) => Math.max(m, s.confidence), 0);

  /** Prefer the aggregated ranked confidence; fall back to max signal. */
  const rankedConfidence = (id: string): number =>
    dna?.rankedDomains.find((r) => r.id === id)?.confidence ??
    domainConfidence(id);

  const domainSignals = (id: string) =>
    signals
      .filter((s) => s.domain === id)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 6);

  const subtitle = [props.repoLabel, props.branch].filter(Boolean).join(" · ");

  const mode = props.mode ?? "analysis";
  const title = mode === "analysis" ? "DNA Analysis" : "Codebase Profile";
  const activeNav: AppView = mode === "analysis" ? "dna" : "profile";
  const isLoading = mode === "analysis" ? health == null : dna === null;
  const loadingLabel =
    mode === "analysis"
      ? "Analyzing codebase DNA…"
      : "Detecting codebase profile…";

  const graph = props.map?.graph;
  const density = graph ? couplingDensity(graph) : null;
  const densityBadge = density === null ? null : couplingBadge(density);
  const densityColor = densityBadge
    ? (COUPLING_TONE_COLOR[densityBadge.tone] ?? "#94A3B8")
    : "#94A3B8";

  const openAuditLogs = (category?: string): void => {
    if (props.onOpenAuditLogs) props.onOpenAuditLogs(category);
    else props.onNavigate("settings");
  };

  /**
   * "Check logs" opens an in-tab modal (factor/category summary). File:line
   * evidence is shown only when present — otherwise an honest empty state.
   */
  const checkLogsBtn = (
    category: string,
    options?: {
      hint?: string;
      factor?: BreakdownFactor;
      title?: string;
    },
  ): ReactElement => (
    <button
      type="button"
      className="dna-metric__logs"
      onClick={() =>
        setCheckLogsTarget({
          category,
          title: options?.title ?? options?.factor?.label ?? "Check logs",
          ...(options?.hint ? { hint: options.hint } : {}),
          ...(options?.factor ? { factor: options.factor } : {}),
        })
      }
      title={
        options?.hint ?? "Show diagnostics captured while computing this metric"
      }
    >
      <ScrollText size={12} aria-hidden />
      Check logs
    </button>
  );

  /** Parse/diagnostics factors originate in indexing; health/DNA factors in dna. */
  const auditCategoryForFactor = (id: string): string =>
    id === "parse_health" || id === "diagnostics" ? "index" : "dna";

  const dnaScore = health ? Math.round(health.score) : null;

  const analysisTiles: {
    label: string;
    value: string;
    note: string;
    brand?: boolean;
    tip: string;
    icon: LucideIcon;
    tone: CardIconTone;
  }[] = health
    ? (() => {
        const sorted = [...health.factors].sort((a, b) => a.score - b.score);
        const weakest = sorted[0];
        const strongest = sorted.at(-1);
        const focus = health.factors.filter((f) => f.score < 70).length;
        const tiles = [
          {
            label: "DNA Score",
            value: `${dnaScore}`,
            note: `Grade ${health.grade}`,
            brand: true,
            tip: "Weighted composite of the five health factors (ADR-0012). Same value as Overview Health Score.",
            icon: Sparkles,
            tone: "brand" as CardIconTone,
          },
          {
            label: "Focus Areas",
            value: `${focus}`,
            note: "factors below 70",
            tip: "Count of health factors scoring below 70 — candidates for improvement.",
            icon: Target,
            tone: "amber" as CardIconTone,
          },
          {
            label: "Weakest Factor",
            value: weakest ? weakest.label : "—",
            note: weakest ? `${Math.round(weakest.score)}/100` : "",
            tip: "Lowest-scoring health factor in the current index.",
            icon: TrendingDown,
            tone: "rose" as CardIconTone,
          },
          {
            label: "Strongest Factor",
            value: strongest ? strongest.label : "—",
            note: strongest ? `${Math.round(strongest.score)}/100` : "",
            tip: "Highest-scoring health factor in the current index.",
            icon: TrendingUp,
            tone: "emerald" as CardIconTone,
          },
        ];
        if (density !== null && densityBadge) {
          tiles.push({
            label: "Coupling Density",
            value: density.toFixed(2),
            note: `${densityBadge.label} · avg deps/module`,
            tip: "Graph fan-out: edges ÷ nodes. Distinct from the Coupling factor (import cycles).",
            icon: Network,
            tone: "violet" as CardIconTone,
          });
        }
        return tiles;
      })()
    : [];

  const breakdownMeta = breakdownFactor
    ? FACTOR_META[breakdownFactor.id]
    : undefined;

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
        active={activeNav}
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        <header className="ov-top">
          <div>
            <div className="ov-top__title">{title}</div>
            <div className="ov-top__sub">{subtitle}</div>
          </div>
          <div className="ov-top__actions">
            <button
              type="button"
              className="ov-btn ov-btn--ghost"
              onClick={() => props.onNavigate("overview")}
            >
              <ArrowLeft size={13} aria-hidden />
              Back to Overview
            </button>
            {mode === "analysis" && client.fetchCodeExplorer ? (
              <button
                type="button"
                className="ov-btn ov-btn--ghost"
                onClick={() => {
                  setExplorerOpen(true);
                  setExplorerError(null);
                }}
              >
                <Search size={13} aria-hidden />
                Explore code
              </button>
            ) : null}
            <button
              type="button"
              className="ov-btn ov-btn--primary"
              onClick={() => props.onNavigate("map")}
            >
              Open Map
            </button>
          </div>
        </header>

        <div className="ov-scroll">
          {isLoading ? (
            <p className="ov-empty">{loadingLabel}</p>
          ) : (
            <>
              {mode === "analysis" && health ? (
                <section className="ov-kpis dna-analysis-kpis">
                  {analysisTiles.map((t) => (
                    <article key={t.label} className="ov-stat">
                      <div className="ov-stat__head">
                        <span className="ov-stat__k">
                          <CardIcon icon={t.icon} tone={t.tone} size={14} />
                          {t.label}
                          <InfoTip label={t.label}>{t.tip}</InfoTip>
                        </span>
                      </div>
                      <div
                        className={`ov-stat__v ov-stat__v--sm${
                          t.brand ? " ov-stat__v--brand" : ""
                        }`}
                      >
                        {t.value}
                      </div>
                      <div className="ov-stat__note">{t.note}</div>
                    </article>
                  ))}
                </section>
              ) : null}

              {mode === "analysis" && engHealth ? (
                <EngHealthCard
                  report={engHealth}
                  {...(client.fetchCodeExplorer
                    ? {
                        onExplore: () => {
                          setExplorerOpen(true);
                          setExplorerError(null);
                        },
                      }
                    : {})}
                />
              ) : null}

              {mode === "profile" ? (
                <>
                  {/* Hero tiles */}
                  <section className="ov-kpis">
                    <article className="ov-stat">
                      <div className="ov-stat__head">
                        <span className="ov-stat__k">
                          <CardIcon icon={Code} tone="brand" size={14} />
                          Primary Language
                          <InfoTip label="Primary Language" align="start">
                            Language with the largest share of indexed source
                            files.
                          </InfoTip>
                        </span>
                      </div>
                      <div className="ov-stat__v ov-stat__v--sm">
                        {primaryLang ? titleCase(primaryLang.id) : "—"}
                      </div>
                      <div className="ov-stat__note">
                        {primaryLang
                          ? `${Math.round(primaryLang.share * 100)}% share`
                          : "no source detected"}
                      </div>
                    </article>

                    {(() => {
                      const tech = primaryDomainId
                        ? domainSignals(primaryDomainId)
                        : [];
                      const openPrimary = (): void => {
                        if (primaryDomainId)
                          props.onOpenDomain(primaryDomainId);
                      };
                      return (
                        <article className="ov-stat dna-primary">
                          <div className="ov-stat__head">
                            <span className="ov-stat__k">
                              <CardIcon
                                icon={Sparkles}
                                tone="violet"
                                size={14}
                              />
                              Primary Domain
                              <InfoTip label="Primary Domain" align="start">
                                Highest-confidence stack domain (e.g. Frontend,
                                Backend, Devops). Tech chips match Frameworks
                                &amp; Libs (icon + name). Use → to open the
                                Domains tab.
                              </InfoTip>
                            </span>
                            {primaryDomainId ? (
                              <button
                                type="button"
                                className="ov-card__open dna-primary__go"
                                aria-label={`Open ${domainDisplayName(primaryDomainId)} domain`}
                                onClick={openPrimary}
                              >
                                <ArrowRight size={15} aria-hidden />
                              </button>
                            ) : null}
                          </div>
                          {tech.length > 0 ? (
                            <PrimaryTechStack signals={tech} />
                          ) : (
                            <div className="ov-stat__v ov-stat__v--sm ov-stat__v--brand">
                              {primaryDomainId
                                ? domainDisplayName(primaryDomainId)
                                : "—"}
                            </div>
                          )}
                          <div className="ov-stat__note">
                            {primaryDomainId
                              ? `${Math.round(rankedConfidence(primaryDomainId) * 100)}% confidence`
                              : "unclassified"}
                          </div>
                        </article>
                      );
                    })()}

                    <article className="ov-stat">
                      <div className="ov-stat__head">
                        <span className="ov-stat__k">
                          <CardIcon icon={Package} tone="amber" size={14} />
                          Frameworks &amp; Libs
                          <InfoTip label="Frameworks & Libs">
                            Frameworks and libraries detected from manifests and
                            import signals. Layout matches Primary Domain (icon
                            + name chips).
                          </InfoTip>
                        </span>
                      </div>
                      {frameworks.length > 0 ? (
                        <div
                          className="dna-fw-note dna-fw-note--lg"
                          role="list"
                        >
                          {frameworks.slice(0, 5).map((fw) => {
                            const m = describeSignal(fw, "");
                            const FwIcon = m.icon;
                            return (
                              <span
                                key={fw}
                                role="listitem"
                                className="dna-fw-note__item dna-fw-note__item--lg"
                                title={frameworkTip(fw)}
                              >
                                <FwIcon size={16} aria-hidden />
                                {m.label}
                              </span>
                            );
                          })}
                          {frameworks.length > 5 ? (
                            <span className="dna-fw-note__more">
                              +{frameworks.length - 5}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="ov-stat__v ov-stat__v--sm">—</div>
                      )}
                      <div className="dna-primary__tags">
                        <span className="dna-tag dna-tag--brand">
                          {frameworks.length} framework
                          {frameworks.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="ov-stat__note">
                        {frameworks.length > 0
                          ? "from manifests & imports"
                          : "none detected"}
                      </div>
                    </article>

                    <article className="ov-stat">
                      <div className="ov-stat__head">
                        <span className="ov-stat__k">
                          <CardIcon
                            icon={FlaskConical}
                            tone="emerald"
                            size={14}
                          />
                          Test Runner
                          <InfoTip label="Test Runner" align="end">
                            Primary test runner detected from config and
                            dependency signals.
                          </InfoTip>
                        </span>
                      </div>
                      <div className="ov-stat__v ov-stat__v--sm">
                        {testRunners[0] ? titleCase(testRunners[0]) : "—"}
                      </div>
                      <div className="ov-stat__note">
                        {testRunners.length > 0
                          ? `${testRunners.length} detected`
                          : "no test markers"}
                      </div>
                    </article>
                  </section>
                </>
              ) : null}

              {mode === "analysis" && health ? (
                <section className="dna-metrics">
                  <div className="dna-metrics__head">
                    <div>
                      <h3 className="dna-section-h">
                        <Activity size={15} aria-hidden />
                        Health Factors — what they mean &amp; how to improve
                      </h3>
                      <p className="dna-section-sub">
                        The five factors behind the Overview&apos;s Codebase DNA
                        score (ADR-0012 weighting), plus graph-derived coupling
                        density.
                      </p>
                    </div>
                    <div className="dna-metrics__overall">
                      <span className="dna-metrics__overall-v">
                        {dnaScore}
                        <span className="dna-metrics__overall-max">/100</span>
                      </span>
                      <span
                        className="dna-metrics__grade"
                        data-grade={health.grade}
                      >
                        Grade {health.grade}
                      </span>
                    </div>
                  </div>

                  <div className="card-masonry">
                    {density !== null && densityBadge ? (
                      <article className="ov-card dna-metric">
                        <div className="dna-metric__top">
                          <span className="dna-metric__name">
                            <Network size={14} aria-hidden />
                            Coupling Density
                            <InfoTip label="Coupling Density">
                              Average dependencies per module (edges ÷ nodes).
                              Complements the cycle-based Coupling factor.
                            </InfoTip>
                          </span>
                          <span
                            className="dna-metric__score"
                            style={{ color: densityColor }}
                          >
                            {density.toFixed(2)}
                          </span>
                        </div>
                        <div className="ov-dna__track">
                          <span
                            className="ov-dna__fill"
                            style={{
                              width: `${Math.min(100, Math.round((density / 1.5) * 100))}%`,
                              background: densityColor,
                            }}
                          />
                        </div>
                        <div className="dna-metric__meta">
                          <span
                            className="dna-metric__weight"
                            style={{ color: densityColor }}
                          >
                            {densityBadge.label} fan-out
                          </span>
                          <span className="dna-metric__note">
                            target &lt; 0.50 · {graph?.edges.length ?? 0} edges
                            ÷ {graph?.nodes.length ?? 0} nodes
                          </span>
                        </div>
                        <p className="dna-metric__blurb">
                          Average dependencies per module — a structural
                          coupling lens that complements the cycle-based{" "}
                          <strong>Coupling</strong> factor. Lower means modules
                          lean on fewer neighbours, so changes stay contained
                          and the graph is easier to reason about.
                        </p>
                        <p className="dna-metric__formula ov-mono">
                          density = edges ÷ nodes
                        </p>
                        <div className="dna-metric__improve">
                          <span className="dna-metric__improve-h">
                            <Lightbulb size={12} aria-hidden />
                            How to improve
                          </span>
                          <ul className="dna-metric__list">
                            <li>
                              Extract shared helpers so many modules stop
                              importing the same hubs.
                            </li>
                            <li>
                              Introduce boundaries/interfaces between features
                              to cut cross-module edges.
                            </li>
                            <li>
                              Split &ldquo;god&rdquo; modules that fan out to
                              many dependencies.
                            </li>
                          </ul>
                        </div>
                        <div className="dna-metric__actions">
                          {checkLogsBtn("analysis", {
                            title: "Coupling Density",
                            hint: "Diagnostics for graph coupling density",
                          })}
                        </div>
                      </article>
                    ) : null}
                    {health.factors.map((f) => {
                      const meta = FACTOR_META[f.id];
                      const color = meta?.color ?? "#94A3B8";
                      const FIcon = meta?.icon ?? Sparkles;
                      const score = Math.round(f.score);
                      const hasBreakdown =
                        (f.breakdown?.length ?? 0) > 0 || meta !== undefined;
                      // Diagnostics is "empty" when the indexer reports zero
                      // analyzer diagnostics (score 100 / note says so).
                      const diagnosticsEmpty =
                        f.id === "diagnostics" &&
                        (/no analyzer diagnostics/i.test(f.note ?? "") ||
                          (f.breakdown?.some(
                            (b) =>
                              b.label.toLowerCase() === "diagnostics" &&
                              Number(b.value) === 0,
                          ) ??
                            false));
                      return (
                        <article key={f.id} className="ov-card dna-metric">
                          <div className="dna-metric__top">
                            <span className="dna-metric__name">
                              <FIcon size={14} aria-hidden />
                              {f.label}
                              {meta ? (
                                <InfoTip label={f.label}>{meta.blurb}</InfoTip>
                              ) : null}
                            </span>
                            <span
                              className="dna-metric__score"
                              style={{ color }}
                            >
                              {score}
                            </span>
                          </div>
                          <div className="ov-dna__track">
                            <span
                              className="ov-dna__fill"
                              style={{ width: `${score}%`, background: color }}
                            />
                          </div>
                          <div className="dna-metric__meta">
                            {meta ? (
                              <span className="dna-metric__weight">
                                {meta.weight}% of score
                              </span>
                            ) : null}
                            {f.note ? (
                              <span className="dna-metric__note">{f.note}</span>
                            ) : null}
                          </div>
                          <p className="dna-metric__blurb">
                            {meta?.blurb ?? ""}
                          </p>
                          {diagnosticsEmpty ? (
                            <p className="dna-metric__empty">
                              <ShieldCheck size={13} aria-hidden />
                              No analyzer diagnostics were captured for the
                              indexed files — either the parse was clean or the
                              indexer did not emit per-file diagnostics. Use
                              &ldquo;Check logs&rdquo; for the factor summary.
                            </p>
                          ) : null}
                          {meta ? (
                            <p className="dna-metric__formula ov-mono">
                              {meta.formula}
                            </p>
                          ) : null}
                          {meta ? (
                            <div className="dna-metric__improve">
                              <span className="dna-metric__improve-h">
                                <Lightbulb size={12} aria-hidden />
                                How to improve
                              </span>
                              <ul className="dna-metric__list">
                                {meta.improve.map((tip) => (
                                  <li key={tip}>{tip}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          <div className="dna-metric__actions">
                            {hasBreakdown ? (
                              <button
                                type="button"
                                className="dna-metric__breakdown"
                                onClick={() =>
                                  setBreakdownFactor({
                                    id: f.id,
                                    label: f.label,
                                    score,
                                    ...(f.note ? { note: f.note } : {}),
                                    ...(f.breakdown
                                      ? { breakdown: f.breakdown }
                                      : {}),
                                  })
                                }
                              >
                                Show Breakdown
                              </button>
                            ) : null}
                            {checkLogsBtn(auditCategoryForFactor(f.id), {
                              title: f.label,
                              factor: {
                                id: f.id,
                                label: f.label,
                                score,
                                ...(f.note ? { note: f.note } : {}),
                                ...(f.breakdown
                                  ? { breakdown: f.breakdown }
                                  : {}),
                              },
                              ...(f.id === "diagnostics"
                                ? {
                                    hint: "Show diagnostics summary for analyzer issues / skipped files",
                                  }
                                : f.id === "parse_health"
                                  ? {
                                      hint: "Show parse-health summary for skipped or failed files",
                                    }
                                  : {}),
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {mode === "profile" ? (
                <>
                  <div className="card-masonry">
                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <ArrowRight
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Architecture Hints
                          <InfoTip label="Architecture Hints">
                            Structural patterns inferred from the stack detector
                            (monorepo, layered layout, etc.).
                          </InfoTip>
                        </span>
                        {hints.length > 0 ? (
                          <span className="ov-card__meta">
                            {hints.length} hints
                          </span>
                        ) : null}
                      </div>
                      {hints.length > 0 ? (
                        <div className="dna-hints">
                          {hints.map((h) => (
                            <span key={h} className="dna-hint">
                              {titleCase(h)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">No architecture hints.</p>
                      )}
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Users
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Inferred Personas
                          <InfoTip label="Inferred Personas">
                            Suggested engineer personas based on detected stack
                            domains and tooling.
                          </InfoTip>
                        </span>
                      </div>
                      {personas.length > 0 ? (
                        <div className="dna-personas">
                          {personas.map((p) => (
                            <div key={p} className="dna-persona">
                              <span className="dna-persona__glyph">
                                <Users size={15} aria-hidden />
                              </span>
                              <span className="dna-persona__name">
                                {titleCase(p)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ov-empty">No personas inferred yet.</p>
                      )}
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Layers
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Language Composition
                          <InfoTip label="Language Composition">
                            Share of indexed source files by language.
                          </InfoTip>
                        </span>
                        {languages.length > 0 ? (
                          <span className="ov-card__meta">
                            {languages.length} languages
                          </span>
                        ) : null}
                      </div>
                      {languages.length > 0 ? (
                        <>
                          <div className="dna-bar">
                            {languages.map((l, i) => (
                              <span
                                key={l.id}
                                className="dna-bar__seg"
                                style={{
                                  width: `${l.share * 100}%`,
                                  background:
                                    LANG_COLORS[i % LANG_COLORS.length],
                                }}
                                title={`${titleCase(l.id)}: ${Math.round(l.share * 100)}%`}
                              />
                            ))}
                          </div>
                          <div className="dna-legend">
                            {languages.map((l, i) => (
                              <div key={l.id} className="dna-legend__row">
                                <span className="dna-legend__name">
                                  <span
                                    className="ov-dot"
                                    style={{
                                      background:
                                        LANG_COLORS[i % LANG_COLORS.length],
                                    }}
                                  />
                                  {titleCase(l.id)}
                                </span>
                                <span className="ov-mono">
                                  {Math.round(l.share * 100)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="ov-empty">No languages detected.</p>
                      )}
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Package
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Frameworks &amp; Libraries
                          <InfoTip label="Frameworks & Libraries">
                            Libraries and frameworks surfaced by the stack
                            detector.
                          </InfoTip>
                        </span>
                        <span className="ov-card__meta">
                          {frameworks.length} detected
                        </span>
                      </div>
                      {frameworks.length > 0 ? (
                        <div className="dna-fw-grid">
                          {frameworks.map((fw) => {
                            const m = describeSignal(fw, "");
                            const FwIcon = m.icon;
                            const tip = frameworkTip(fw);
                            return (
                              <div key={fw} className="dna-fw" title={tip}>
                                <span
                                  className="dna-fw__glyph"
                                  style={{ "--cat": m.color } as CSSProperties}
                                >
                                  <FwIcon size={16} aria-hidden />
                                </span>
                                <div className="dna-fw__body">
                                  <div className="dna-fw__name">
                                    {m.label}
                                    <InfoTip label={m.label}>{tip}</InfoTip>
                                  </div>
                                  <span
                                    className="dna-fw__tag"
                                    style={
                                      { "--cat": m.color } as CSSProperties
                                    }
                                  >
                                    {m.category}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="ov-empty">No frameworks detected.</p>
                      )}
                    </article>

                    {packages.length > 0 ? (
                      <article className="ov-card">
                        <div className="ov-card__head">
                          <span className="ov-card__title">
                            <Boxes
                              size={14}
                              className="ov-card__icon"
                              aria-hidden
                            />
                            Packages
                            <InfoTip label="Packages">
                              Workspace packages and the stack domains detected
                              in each.
                            </InfoTip>
                          </span>
                          <span className="ov-card__meta">
                            {packages.length} in workspace
                          </span>
                        </div>
                        <div className="dna-pkgs">
                          <div className="dna-pkgs__head">
                            <span>Package</span>
                            <span>Domains</span>
                          </div>
                          <div className="dna-pkgs__body">
                            {packages.map((p) => (
                              <div key={p.id} className="dna-pkgs__row">
                                <span
                                  className="ov-mono ov-ellipsis"
                                  title={p.rootDir}
                                >
                                  {p.rootDir === "" ? "(root)" : p.rootDir}
                                </span>
                                <span className="dna-pkgs__domains">
                                  {p.profile.domains.length > 0 ? (
                                    p.profile.domains.map((d) => (
                                      <span key={d} className="dna-pkg-domain">
                                        {domainDisplayName(d)}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="dna-pkgs__none">—</span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </article>
                    ) : null}

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Sparkles
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Stack Domains
                          <InfoTip label="Stack Domains">
                            Detected product domains with confidence and tech
                            signals that triggered them.
                          </InfoTip>
                        </span>
                      </div>
                      <div className="dna-domains">
                        {DOMAIN_CATALOG.map((d) => {
                          const detected = domains.includes(d.id);
                          const tech = domainSignals(d.id);
                          // Lead with the detected tech-stack icon; fall back
                          // to the catalog domain glyph when none matched.
                          const lead = tech[0]
                            ? describeSignal(tech[0].id, tech[0].domain)
                            : null;
                          const NameIcon = lead?.icon ?? d.icon;
                          return (
                            <div
                              key={d.id}
                              className="dna-domain"
                              data-on={detected ? "true" : "false"}
                            >
                              <div className="dna-domain__row">
                                <span className="dna-domain__name">
                                  <NameIcon size={15} aria-hidden />
                                  {domainDisplayName(d.id)}
                                </span>
                                <span className="dna-domain__end">
                                  {detected ? (
                                    <span className="dna-domain__conf ov-mono">
                                      {Math.round(rankedConfidence(d.id) * 100)}
                                      %
                                    </span>
                                  ) : (
                                    <span className="dna-domain__off ov-mono">
                                      —
                                    </span>
                                  )}
                                  {detected ? (
                                    <button
                                      type="button"
                                      className="dna-domain__open"
                                      onClick={() => props.onOpenDomain(d.id)}
                                      aria-label={`Open ${domainDisplayName(d.id)} domain`}
                                      title={`Open ${domainDisplayName(d.id)} domain`}
                                    >
                                      <ArrowRight size={14} aria-hidden />
                                    </button>
                                  ) : null}
                                </span>
                              </div>
                              {detected && tech.length > 0 ? (
                                <div className="dna-domain__tech">
                                  {tech.map((s) => {
                                    const meta = describeSignal(s.id, s.domain);
                                    const TechIcon = meta.icon;
                                    return (
                                      <span
                                        key={s.id}
                                        className="dna-domain__tech-chip"
                                        title={signalDetectionTip(s)}
                                        aria-label={meta.label}
                                      >
                                        <TechIcon size={14} aria-hidden />
                                        {meta.label}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </article>

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <FlaskConical
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Detection Signals
                          <InfoTip label="Detection Signals">
                            % is the stack detector confidence (0–100) for that
                            signal.
                          </InfoTip>
                        </span>
                        <span className="ov-card__meta">
                          {sortedSignals.length} signals
                        </span>
                      </div>
                      {sortedSignals.length > 0 ? (
                        <div className="dna-signals">
                          {sortedSignals.map((s) => {
                            const meta = describeSignal(s.id, s.domain);
                            const Icon = meta.icon;
                            return (
                              <div
                                key={s.id}
                                className="dna-signal"
                                style={{ "--cat": meta.color } as CSSProperties}
                              >
                                <span className="dna-signal__icon" aria-hidden>
                                  <Icon size={16} />
                                </span>
                                <div className="dna-signal__main">
                                  <span className="dna-signal__label ov-ellipsis">
                                    {meta.label}
                                  </span>
                                  <div className="dna-signal__meta">
                                    <span className="dna-signal__cat">
                                      {meta.category}
                                    </span>
                                    {s.evidence.length > 0 ? (
                                      <span
                                        className="dna-signal__ev ov-mono ov-ellipsis"
                                        title={s.evidence.join(", ")}
                                      >
                                        {s.evidence.slice(0, 2).join(", ")}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <span
                                  className="dna-signal__conf ov-mono"
                                  title={`Stack detector confidence: ${Math.round(
                                    s.confidence * 100,
                                  )}% — how strongly the detected evidence indicates this signal (0–100%).`}
                                >
                                  {Math.round(s.confidence * 100)}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="ov-empty">No detection signals.</p>
                      )}
                    </article>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      {breakdownFactor ? (
        <div
          className="dna-modal-backdrop"
          role="presentation"
          onClick={() => setBreakdownFactor(null)}
        >
          <div
            className="dna-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={breakdownTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dna-modal__head">
              <h2 id={breakdownTitleId} className="dna-modal__title">
                {breakdownFactor.label} breakdown
              </h2>
              <button
                type="button"
                className="dna-modal__close"
                aria-label="Close breakdown"
                onClick={() => setBreakdownFactor(null)}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="dna-modal__score ov-mono">
              Score {Math.round(breakdownFactor.score)}/100
              {breakdownMeta ? ` · ${breakdownMeta.weight}% of DNA Score` : ""}
            </p>
            {breakdownMeta ? (
              <p className="dna-modal__formula ov-mono">
                {breakdownMeta.formula}
              </p>
            ) : null}
            {breakdownFactor.breakdown &&
            breakdownFactor.breakdown.length > 0 ? (
              <ul className="dna-modal__rows">
                {breakdownFactor.breakdown.map((row) => (
                  <li key={`${row.label}:${row.value}`}>
                    <span>{row.label}</span>
                    <span className="ov-mono">{row.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ov-empty">
                No numeric breakdown rows for this factor yet.
              </p>
            )}
            {breakdownFactor.note ? (
              <p className="dna-modal__note">{breakdownFactor.note}</p>
            ) : null}
            {breakdownFactor.id === "parse_health" ? (
              <p className="dna-modal__note">
                Skipped or failed files reduce this ratio. Open the audit log to
                see exactly which files were skipped and why.
              </p>
            ) : null}
            <div className="dna-modal__foot">
              <button
                type="button"
                className="dna-metric__logs"
                onClick={() => {
                  openAuditLogs(auditCategoryForFactor(breakdownFactor.id));
                  setBreakdownFactor(null);
                }}
                title="Optional: open Audit Logs for host-captured events"
              >
                <ScrollText size={12} aria-hidden />
                Open audit logs
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {checkLogsTarget ? (
        <div
          className="dna-modal-backdrop"
          role="presentation"
          onClick={() => setCheckLogsTarget(null)}
        >
          <div
            className="dna-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={checkLogsTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dna-modal__head">
              <h2 id={checkLogsTitleId} className="dna-modal__title">
                {checkLogsTarget.title} — logs
              </h2>
              <button
                type="button"
                className="dna-modal__close"
                aria-label="Close check logs"
                onClick={() => setCheckLogsTarget(null)}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="dna-modal__score ov-mono">
              Category{" "}
              <span className="ov-mono">{checkLogsTarget.category}</span>
              {checkLogsTarget.factor
                ? ` · Score ${Math.round(checkLogsTarget.factor.score)}/100`
                : ""}
            </p>
            {checkLogsTarget.hint ? (
              <p className="dna-modal__note">{checkLogsTarget.hint}</p>
            ) : null}
            {checkLogsTarget.factor?.note ? (
              <p className="dna-modal__note">{checkLogsTarget.factor.note}</p>
            ) : null}
            {checkLogsTarget.factor?.breakdown &&
            checkLogsTarget.factor.breakdown.length > 0 ? (
              <ul className="dna-modal__rows">
                {checkLogsTarget.factor.breakdown.map((row) => (
                  <li key={`${row.label}:${row.value}`}>
                    <span>{row.label}</span>
                    <span className="ov-mono">{row.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ov-empty">
                No numeric factor summary rows for this check yet.
              </p>
            )}
            <div className="dna-modal__note" style={{ marginTop: 12 }}>
              <strong>File-level evidence</strong>
              <p className="ov-empty" style={{ marginTop: 6 }}>
                No file-level evidence yet
              </p>
            </div>
            <div className="dna-modal__foot">
              <button
                type="button"
                className="dna-metric__logs"
                onClick={() => {
                  openAuditLogs(checkLogsTarget.category);
                  setCheckLogsTarget(null);
                }}
                title="Optional: open the host Audit Logs panel"
              >
                <ScrollText size={12} aria-hidden />
                Open audit logs
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {explorerOpen ? (
        <div
          className="dna-modal-backdrop"
          role="presentation"
          onClick={() => setExplorerOpen(false)}
        >
          <div
            className="dna-modal dna-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby={explorerTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dna-modal__head">
              <h2 id={explorerTitleId} className="dna-modal__title">
                Code Explorer
              </h2>
              <button
                type="button"
                className="dna-modal__close"
                aria-label="Close explorer"
                onClick={() => setExplorerOpen(false)}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="dna-modal__note">
              Look up a symbol name or file path — usages, ownership, and
              related items from Core{" "}
              <span className="ov-mono">exploreCode</span>.
            </p>
            <form
              className="dna-explorer__form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const q = explorerQuery.trim();
                if (!q || !client.fetchCodeExplorer) return;
                setExplorerBusy(true);
                setExplorerError(null);
                const target =
                  explorerKind === "file"
                    ? { kind: "file" as const, path: q }
                    : { kind: "symbol" as const, name: q };
                void client
                  .fetchCodeExplorer(target)
                  .then((report) => {
                    if (!report) {
                      setExplorerReport(null);
                      setExplorerError("No match in the current index.");
                      return;
                    }
                    setExplorerReport(report);
                  })
                  .catch((err: unknown) => {
                    setExplorerReport(null);
                    setExplorerError(
                      err instanceof Error ? err.message : String(err),
                    );
                  })
                  .finally(() => setExplorerBusy(false));
              }}
            >
              <div className="dna-explorer__kind">
                <button
                  type="button"
                  className="ov-btn ov-btn--ghost"
                  data-active={explorerKind === "symbol" ? "true" : "false"}
                  onClick={() => setExplorerKind("symbol")}
                >
                  Symbol
                </button>
                <button
                  type="button"
                  className="ov-btn ov-btn--ghost"
                  data-active={explorerKind === "file" ? "true" : "false"}
                  onClick={() => setExplorerKind("file")}
                >
                  File path
                </button>
              </div>
              <Input
                id={explorerInputId}
                label={explorerKind === "file" ? "Path" : "Symbol name"}
                value={explorerQuery}
                onChange={(e) => setExplorerQuery(e.target.value)}
                placeholder={
                  explorerKind === "file"
                    ? "packages/core/src/workspace.ts"
                    : "getEngineeringHealth"
                }
                autoComplete="off"
              />
              <button
                type="submit"
                className="ov-btn ov-btn--primary"
                disabled={explorerBusy || !explorerQuery.trim()}
              >
                {explorerBusy ? "Exploring…" : "Explore"}
              </button>
            </form>
            {explorerError ? <p className="ov-empty">{explorerError}</p> : null}
            {explorerReport ? (
              <div className="dna-explorer__result">
                <p className="dna-modal__score ov-mono">
                  {explorerReport.target.kind === "file"
                    ? explorerReport.target.path
                    : explorerReport.target.name}
                  {explorerReport.path ? ` · ${explorerReport.path}` : ""}
                </p>
                <p className="dna-modal__note">{explorerReport.summary}</p>
                <h3 className="dna-section-h">
                  Usages ({explorerReport.usages.length})
                </h3>
                {explorerReport.usages.length > 0 ? (
                  <ul className="dna-modal__rows">
                    {explorerReport.usages.slice(0, 12).map((u) => (
                      <li key={`${u.path}:${u.start}:${u.name}`}>
                        <span className="ov-mono ov-ellipsis">
                          {u.path}:{u.start}
                        </span>
                        <span className="ov-mono">{u.kind}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ov-empty">No usages found.</p>
                )}
                <h3 className="dna-section-h">Ownership</h3>
                {explorerReport.ownership.primary ? (
                  <p className="dna-modal__note">
                    Primary: {explorerReport.ownership.primary.author}
                    {explorerReport.ownership.primary.email
                      ? ` <${explorerReport.ownership.primary.email}>`
                      : ""}
                    {" · "}
                    {explorerReport.ownership.contributors.length} contributor
                    {explorerReport.ownership.contributors.length === 1
                      ? ""
                      : "s"}
                  </p>
                ) : (
                  <p className="ov-empty">
                    No ownership signal (git soft-degrades).
                  </p>
                )}
                <h3 className="dna-section-h">Related</h3>
                <ul className="dna-modal__rows">
                  {(
                    [
                      ["features", explorerReport.related.features],
                      ["tests", explorerReport.related.tests],
                      ["apis", explorerReport.related.apis],
                      ["components", explorerReport.related.components],
                    ] as const
                  ).flatMap(([label, items]) =>
                    items.slice(0, 4).map((item) => (
                      <li key={`${label}:${item.id}`}>
                        <span className="ov-ellipsis">
                          {label}: {item.label}
                        </span>
                        <span className="ov-mono ov-ellipsis">
                          {item.path ?? "—"}
                        </span>
                      </li>
                    )),
                  )}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const ENG_METRIC_IDS = [
  "entropy",
  "architecture_drift",
  "technical_debt",
] as const;

function EngHealthCard(props: {
  report: EngineeringHealthReport;
  onExplore?: () => void;
}): ReactElement {
  const byId = new Map(props.report.metrics.map((m) => [m.id, m]));
  return (
    <article className="ov-card dna-eng">
      <div className="ov-card__head">
        <span className="ov-card__title">
          <Activity size={14} className="ov-card__icon" aria-hidden />
          Engineering Health
          <InfoTip label="Engineering Health">
            Complementary to DNA Score — entropy, architecture drift, and
            technical debt from Core getEngineeringHealth (M-022).
          </InfoTip>
        </span>
        {props.onExplore ? (
          <button
            type="button"
            className="ov-card__open"
            onClick={props.onExplore}
            aria-label="Explore code"
            title="Explore code"
          >
            <Search size={15} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="dna-eng__scores">
        {ENG_METRIC_IDS.map((id) => {
          const m = byId.get(id);
          const score = m ? Math.round(m.score) : null;
          return (
            <div key={id} className="dna-eng__metric">
              <span className="dna-eng__label">
                {m?.label ?? id.replace(/_/g, " ")}
              </span>
              <span className="dna-eng__value ov-mono">
                {score === null ? "—" : score}
              </span>
            </div>
          );
        })}
      </div>
      <p className="dna-eng__summary">{props.report.summary}</p>
      {!props.report.gitAvailable ? (
        <p className="ov-empty dna-eng__git">
          Git soft-degraded for some metrics.
        </p>
      ) : null}
    </article>
  );
}
