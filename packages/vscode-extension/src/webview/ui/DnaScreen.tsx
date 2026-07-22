import type { DnaReport, HealthScore, RepositoryMap } from "@prism/shared";
import {
  Activity,
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Cloud,
  Cpu,
  Network,
  Database,
  FlaskConical,
  GitBranch,
  Layers,
  Lightbulb,
  Monitor,
  Package,
  ScrollText,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import type { ComponentType, CSSProperties, ReactElement } from "react";
import {
  SiAngular,
  SiBun,
  SiExpo,
  SiJest,
  SiJupyter,
  SiNestjs,
  SiNextdotjs,
  SiNodedotjs,
  SiNpm,
  SiNuxt,
  SiPnpm,
  SiReact,
  SiSvelte,
  SiTurborepo,
  SiVite,
  SiVitest,
  SiVuedotjs,
  SiYarn,
} from "react-icons/si";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { DOMAIN_CATALOG } from "./domain-catalog.js";
import { couplingBadge, couplingDensity } from "./overview-model.js";
import "./overview.css";

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

type SignalIcon = ComponentType<{
  size?: number | string;
  "aria-hidden"?: boolean;
}>;

/** Signal id prefix → category label + icon + accent (ordered; first wins). */
const SIGNAL_CATEGORIES: {
  prefix: string;
  category: string;
  icon: SignalIcon;
  color: string;
}[] = [
  {
    prefix: "pm-",
    category: "Package Manager",
    icon: Package,
    color: "#00C2C2",
  },
  { prefix: "mono-", category: "Monorepo", icon: Boxes, color: "#3B82F6" },
  {
    prefix: "frontend-",
    category: "Frontend",
    icon: Monitor,
    color: "#6C63FF",
  },
  { prefix: "backend-", category: "Backend", icon: Server, color: "#10B981" },
  { prefix: "mobile-", category: "Mobile", icon: Smartphone, color: "#F59E0B" },
  {
    prefix: "desktop-",
    category: "Desktop",
    icon: AppWindow,
    color: "#38BDF8",
  },
  { prefix: "devops-", category: "DevOps", icon: Cloud, color: "#FB923C" },
  { prefix: "ci-", category: "CI / CD", icon: Cloud, color: "#FB923C" },
  { prefix: "data-", category: "Data / ML", icon: Database, color: "#A855F7" },
  {
    prefix: "test-",
    category: "Testing",
    icon: FlaskConical,
    color: "#F43F5E",
  },
  { prefix: "lang-", category: "Language", icon: Cpu, color: "#94A3B8" },
  { prefix: "runtime-", category: "Runtime", icon: Cpu, color: "#84CC16" },
  { prefix: "nodejs", category: "Runtime", icon: Cpu, color: "#84CC16" },
  { prefix: "node-", category: "Runtime", icon: Cpu, color: "#84CC16" },
];

/** Real brand logos (Simple Icons) per signal id; falls back to category icon. */
const BRAND_ICONS: Record<string, SignalIcon> = {
  "frontend-next": SiNextdotjs,
  "frontend-react": SiReact,
  "frontend-vue": SiVuedotjs,
  "frontend-svelte": SiSvelte,
  "frontend-angular": SiAngular,
  "frontend-nuxt": SiNuxt,
  "frontend-vite": SiVite,
  "backend-nestjs": SiNestjs,
  "mobile-expo": SiExpo,
  "mobile-react-native": SiReact,
  "pm-bun": SiBun,
  "pm-pnpm": SiPnpm,
  "pm-npm": SiNpm,
  "pm-yarn": SiYarn,
  "test-vitest": SiVitest,
  "test-jest": SiJest,
  "data-jupyter": SiJupyter,
  "mono-turbo": SiTurborepo,
  "nodejs-manifest": SiNodedotjs,
};

/** Friendly tech names for signal ids that don't title-case nicely. */
const SIGNAL_LABELS: Record<string, string> = {
  "pm-npm": "npm",
  "pm-pnpm": "pnpm",
  "frontend-next": "Next.js",
  "frontend-nuxt": "Nuxt",
  "frontend-vite": "Vite",
  "frontend-nestjs": "NestJS",
  "backend-nestjs": "NestJS",
  "mobile-react-native": "React Native",
  "data-jupyter": "Jupyter",
  "nodejs-manifest": "Node.js",
};

/** Split a signal id into a heading (tech), a category tag, an icon, accent. */
function describeSignal(
  id: string,
  domain: string,
): { label: string; category: string; icon: SignalIcon; color: string } {
  const match = SIGNAL_CATEGORIES.find((c) => id.startsWith(c.prefix));
  const rest = match ? id.slice(match.prefix.length) : id;
  const label =
    SIGNAL_LABELS[id] ?? (rest === "" ? titleCase(id) : titleCase(rest));
  return {
    label,
    category: match?.category ?? titleCase(domain),
    icon: BRAND_ICONS[id] ?? match?.icon ?? Wrench,
    color: match?.color ?? "#8AA0AA",
  };
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
};

/**
 * Codebase DNA screen (M-043). Renders the real `getDna()` report: languages,
 * frameworks, detected stack domains, personas, and architecture hints. Theme-
 * adherent (dark tokens), not a pixel copy of the Stitch export.
 */
export function DnaScreen(props: DnaScreenProps): ReactElement {
  const { dna, health } = props;

  const languages = dna?.languages ?? [];
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

  const primaryLang = languages[0];
  const primaryDomainId = domains[0];

  const domainConfidence = (id: string): number =>
    signals
      .filter((s) => s.domain === id)
      .reduce((m, s) => Math.max(m, s.confidence), 0);

  const domainEvidence = (id: string): string =>
    signals
      .filter((s) => s.domain === id)
      .map((s) => s.id)
      .slice(0, 4)
      .join(", ");

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

  // Placeholder until Audit Logs ships — will deep-link to the audit entry that
  // computed this metric (exact errors + suggested fixes), filtered by category.
  const checkLogsBtn = (
    <button
      type="button"
      className="dna-metric__logs"
      disabled
      title="Available once Audit Logs ships — will show the exact errors & fixes found while computing this metric"
    >
      <ScrollText size={12} aria-hidden />
      Check logs
      <span className="dna-metric__logs-soon">Soon</span>
    </button>
  );

  const analysisTiles: {
    label: string;
    value: string;
    note: string;
    brand?: boolean;
  }[] = health
    ? (() => {
        const sorted = [...health.factors].sort((a, b) => a.score - b.score);
        const weakest = sorted[0];
        const strongest = sorted.at(-1);
        const focus = health.factors.filter((f) => f.score < 70).length;
        const tiles = [
          {
            label: "DNA Score",
            value: `${health.score}`,
            note: `Grade ${health.grade}`,
            brand: true,
          },
          {
            label: "Focus Areas",
            value: `${focus}`,
            note: "factors below 70",
          },
          {
            label: "Weakest Factor",
            value: weakest ? weakest.label : "—",
            note: weakest ? `${Math.round(weakest.score)}/100` : "",
          },
          {
            label: "Strongest Factor",
            value: strongest ? strongest.label : "—",
            note: strongest ? `${Math.round(strongest.score)}/100` : "",
          },
        ];
        if (density !== null && densityBadge) {
          tiles.push({
            label: "Coupling Density",
            value: density.toFixed(2),
            note: `${densityBadge.label} · avg deps/module`,
          });
        }
        return tiles;
      })()
    : [];

  return (
    <div className="ov">
      <AppSidebar
        variant="full"
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
                <section className="ov-kpis">
                  {analysisTiles.map((t) => (
                    <article key={t.label} className="ov-stat">
                      <div className="ov-stat__head">
                        <span className="ov-stat__k">{t.label}</span>
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

              {mode === "profile" ? (
                <>
                  {/* Hero tiles */}
                  <section className="ov-kpis">
                    <article className="ov-stat">
                      <div className="ov-stat__head">
                        <span className="ov-stat__k">Primary Language</span>
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

                    <article className="ov-stat">
                      <div className="ov-stat__head">
                        <span className="ov-stat__k">Primary Domain</span>
                      </div>
                      <div className="ov-stat__v ov-stat__v--sm ov-stat__v--brand">
                        {primaryDomainId ? titleCase(primaryDomainId) : "—"}
                      </div>
                      <div className="ov-stat__note">
                        {primaryDomainId
                          ? `${Math.round(domainConfidence(primaryDomainId) * 100)}% confidence`
                          : "unclassified"}
                      </div>
                    </article>

                    <article className="ov-stat">
                      <div className="ov-stat__head">
                        <span className="ov-stat__k">
                          Frameworks &amp; Libs
                        </span>
                        <Boxes
                          size={14}
                          className="ov-stat__icon"
                          aria-hidden
                        />
                      </div>
                      <div className="ov-stat__v">{frameworks.length}</div>
                      <div className="ov-stat__note">
                        {dna?.packageManager
                          ? `via ${dna.packageManager}`
                          : "detected"}
                      </div>
                    </article>

                    <article className="ov-stat">
                      <div className="ov-stat__head">
                        <span className="ov-stat__k">Test Runner</span>
                        <FlaskConical
                          size={14}
                          className="ov-stat__icon"
                          aria-hidden
                        />
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
                        {health.score}
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
                        {checkLogsBtn}
                      </article>
                    ) : null}
                    {health.factors.map((f) => {
                      const meta = FACTOR_META[f.id];
                      const color = meta?.color ?? "#94A3B8";
                      const FIcon = meta?.icon ?? Sparkles;
                      const score = Math.round(f.score);
                      return (
                        <article key={f.id} className="ov-card dna-metric">
                          <div className="dna-metric__top">
                            <span className="dna-metric__name">
                              <FIcon size={14} aria-hidden />
                              {f.label}
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
                          {checkLogsBtn}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {mode === "profile" ? (
                <>
                  <article className="ov-card">
                    <div className="ov-card__head">
                      <span className="ov-card__title">
                        <ArrowRight
                          size={14}
                          className="ov-card__icon"
                          aria-hidden
                        />
                        Architecture Hints
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

                  <div className="card-masonry">
                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Layers
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Language Composition
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
                        </span>
                        <span className="ov-card__meta">
                          {frameworks.length} detected
                        </span>
                      </div>
                      {frameworks.length > 0 ? (
                        <div className="dna-fw-grid">
                          {frameworks.map((fw) => (
                            <div key={fw} className="dna-fw">
                              <span className="dna-fw__glyph">
                                <Package size={16} aria-hidden />
                              </span>
                              <div className="dna-fw__body">
                                <div className="dna-fw__name">
                                  {titleCase(fw)}
                                </div>
                                <div className="dna-fw__ev ov-mono">
                                  stack detector
                                </div>
                              </div>
                            </div>
                          ))}
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
                                        {titleCase(d)}
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
                        </span>
                      </div>
                      <div className="dna-domains">
                        {DOMAIN_CATALOG.map((d) => {
                          const detected = domains.includes(d.id);
                          const Icon = d.icon;
                          return (
                            <div
                              key={d.id}
                              className="dna-domain"
                              data-on={detected ? "true" : "false"}
                            >
                              <div className="dna-domain__row">
                                <span className="dna-domain__name">
                                  <Icon size={15} aria-hidden />
                                  {d.shortLabel}
                                </span>
                                {detected ? (
                                  <span className="dna-domain__conf ov-mono">
                                    {Math.round(domainConfidence(d.id) * 100)}%
                                  </span>
                                ) : (
                                  <span className="dna-domain__off ov-mono">
                                    —
                                  </span>
                                )}
                              </div>
                              {detected && domainEvidence(d.id) ? (
                                <div className="dna-domain__ev ov-mono ov-ellipsis">
                                  {domainEvidence(d.id)}
                                </div>
                              ) : null}
                              {detected ? (
                                <button
                                  type="button"
                                  className="dna-domain__link"
                                  onClick={() => props.onOpenDomain(d.id)}
                                >
                                  View domain
                                  <ArrowRight size={12} aria-hidden />
                                </button>
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
                                <span className="dna-signal__conf ov-mono">
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

                    <article className="ov-card">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Users
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Inferred Personas
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
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
