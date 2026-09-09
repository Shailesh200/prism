import type { BackendDomainReport } from "@repo-prism/shared";
import {
  backendHandlerNodes,
  buildBackendCoverage,
  countDataLayerByKind,
  rankChurnHotspots,
  rankMostDepended,
} from "@repo-prism/shared";
import { CardIcon, EmptyState, InfoTip, SearchableInput } from "@repo-prism/ui";
import type { LucideIcon } from "lucide-react";
import {
  Database,
  FileClock,
  FileWarning,
  Flame,
  FlaskConical,
  Network,
  Plug,
  Server,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Workflow,
} from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";
import { OverlayDomainFrame } from "./DomainShell.js";
import { useOverlaySession } from "./overlay-session.js";
import {
  OverlayReadyView,
  OverlaySurfaceCard,
  filterOverlayNodes,
} from "./overlay-ready.js";
import {
  kindLabel,
  nodePath,
  openBlastFor,
  overlayAnalyzeSteps,
  overlayKindCounts,
  sortedOverlayFindings,
  type DomainScreenProps,
  type Tile,
} from "./shared.js";

export function BackendSection(props: DomainScreenProps): ReactElement {
  const { def, overlay, status, lastRunAt, liveDomainReport, subtitle, nodes } =
    useOverlaySession(props);
  const [filter, setFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [coverageFilter, setCoverageFilter] = useState("");

  const backendDomainReport: BackendDomainReport | null =
    liveDomainReport?.domain === "backend" ? liveDomainReport : null;

  const activeDomainReport =
    liveDomainReport?.domain === props.domainId ? liveDomainReport : null;

  const activeBackendReport =
    backendDomainReport?.backend ?? props.backendReport ?? null;

  const findings = useMemo(() => sortedOverlayFindings(overlay), [overlay]);

  const kindCounts = useMemo(
    () => overlayKindCounts(nodes, backendDomainReport?.kindCounts),
    [nodes, backendDomainReport],
  );

  const coverage = useMemo(() => {
    if (backendDomainReport) return backendDomainReport.coverage;
    return buildBackendCoverage(activeBackendReport);
  }, [backendDomainReport, activeBackendReport]);

  const routeRows = useMemo(() => {
    if (!activeBackendReport) return [];
    const q = routeFilter.trim().toLowerCase();
    const rows = activeBackendReport.endpoints;
    if (!q) return rows;
    return rows.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        e.handlerFile.toLowerCase().includes(q) ||
        String((e as { handlerName?: string }).handlerName ?? "")
          .toLowerCase()
          .includes(q) ||
        e.framework.toLowerCase().includes(q) ||
        e.auth.toLowerCase().includes(q),
    );
  }, [activeBackendReport, routeFilter]);

  const coverageRows = useMemo(() => {
    if (!coverage) return [];
    const q = coverageFilter.trim().toLowerCase();
    if (!q) return coverage.untested;
    return coverage.untested.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        e.handlerFile.toLowerCase().includes(q) ||
        String((e as { handlerName?: string }).handlerName ?? "")
          .toLowerCase()
          .includes(q),
    );
  }, [coverage, coverageFilter]);

  const mostDepended = useMemo(() => {
    if (backendDomainReport) return backendDomainReport.mostDepended;
    return rankMostDepended(backendHandlerNodes(nodes), props.depGraph);
  }, [backendDomainReport, nodes, props.depGraph]);

  const churn = useMemo(() => {
    if (backendDomainReport) return backendDomainReport.churn;
    return rankChurnHotspots(backendHandlerNodes(nodes), props.gitActivity);
  }, [backendDomainReport, nodes, props.gitActivity]);

  const dataLayerGrid = useMemo(() => {
    const counts =
      backendDomainReport?.dataLayerByKind ??
      countDataLayerByKind(activeBackendReport?.dataLayer ?? []);
    const meta: {
      kind: keyof typeof counts;
      label: string;
      icon: LucideIcon;
      tone: "brand" | "violet" | "amber" | "emerald";
    }[] = [
      { kind: "model", label: "Models", icon: Database, tone: "brand" },
      {
        kind: "migration",
        label: "Migrations",
        icon: FileClock,
        tone: "amber",
      },
      { kind: "sql", label: "SQL", icon: Table2, tone: "emerald" },
      { kind: "client", label: "DB Clients", icon: Plug, tone: "violet" },
    ];
    return meta.map((m) => ({ ...m, count: counts[m.kind] ?? 0 }));
  }, [backendDomainReport, activeBackendReport]);

  const securityNodes = props.security?.graph.nodes ?? [];
  const securityFindings = props.security?.findings ?? [];

  const filtered = useMemo(
    () => filterOverlayNodes(nodes, filter),
    [nodes, filter],
  );

  const tiles: Tile[] = [
    {
      label: "Endpoints",
      value: activeBackendReport?.endpoints.length ?? "—",
    },
    {
      label: "Untested",
      value: activeBackendReport ? (coverage?.untested.length ?? 0) : "—",
      warn:
        activeBackendReport !== null && (coverage?.untested.length ?? 0) > 0,
    },
    {
      label: "Frameworks",
      value: activeBackendReport?.frameworksDetected.length ?? "—",
    },
    {
      label: "Data Layer",
      value: activeBackendReport?.dataLayer.length ?? "—",
    },
  ];

  const analyzeSteps = overlayAnalyzeSteps(def, { enriched: true });

  const blast = (path: string): void =>
    openBlastFor(path, props.domainId, props.onNavigate);

  const apiSurfaceCard = (
    <OverlaySurfaceCard
      def={def}
      filter={filter}
      onFilter={setFilter}
      surfaceRows={filtered}
      surfaceTotal={nodes.length}
      variant="backend"
      onBlast={blast}
    />
  );

  const backendRoutesCard = (
    <article className="ov-card">
      <div className="ov-card__head">
        <span className="ov-card__title">
          <Server size={14} className="ov-card__icon" aria-hidden />
          Routes
          <InfoTip label="Routes">
            HTTP endpoints from Core&apos;s backend report (Express / Nest /
            Fastify). Handler prefers function name when extractable.
          </InfoTip>
        </span>
        <SearchableInput
          className="dm-filter-search"
          value={routeFilter}
          onChange={setRouteFilter}
          placeholder="Filter routes…"
          spellCheck={false}
          aria-label="Filter routes"
        />
      </div>
      {activeBackendReport && routeRows.length > 0 ? (
        <div className="dm-surface dm-surface--routes dm-surface--routes-blast">
          <div className="dm-surface__head">
            <span>Method</span>
            <span>Route</span>
            <span>Auth</span>
            <span>Test</span>
            <span className="dm-surface__impact-h">Impact</span>
          </div>
          <div className="dm-surface__body">
            {routeRows.map((e) => (
              <div key={e.id} className="dm-surface__row">
                <span className="dm-kind dm-route__method">{e.method}</span>
                <div className="dm-rank__main">
                  <span className="dm-surface__name ov-mono ov-ellipsis">
                    {e.path}
                  </span>
                  <span
                    className="dm-surface__path ov-mono ov-ellipsis"
                    title={e.handlerFile}
                  >
                    {e.handlerName
                      ? `${e.handlerName} · ${e.handlerFile.split("/").pop()}`
                      : e.handlerFile}
                  </span>
                </div>
                <span
                  className={`dm-tag${
                    e.auth === "public" ? " dm-tag--warn" : ""
                  }`}
                >
                  {e.auth}
                </span>
                <span
                  className={`dm-surface__test${
                    e.tested
                      ? " dm-surface__test--ok"
                      : " dm-surface__test--miss"
                  }`}
                >
                  {e.tested ? "yes" : "no"}
                </span>
                <button
                  type="button"
                  className="dm-blastbtn"
                  aria-label={`Open Blast Radius for ${e.handlerFile}`}
                  title="Open Blast Radius for this handler file"
                  disabled={!e.handlerFile}
                  onClick={() => blast(e.handlerFile)}
                >
                  <Flame size={13} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState>
          {activeBackendReport
            ? routeFilter.trim()
              ? "No routes match the filter."
              : "No Express / Nest / Fastify routes extracted."
            : "Backend report unavailable — re-run analysis."}
        </EmptyState>
      )}
      {activeBackendReport?.summary ? (
        <p className="dm-note">{activeBackendReport.summary}</p>
      ) : null}
    </article>
  );

  return (
    <OverlayDomainFrame
      screen={props}
      def={def}
      subtitle={subtitle}
      overlay={overlay}
      status={status}
      analyzeSteps={analyzeSteps}
      ready={
        overlay ? (
          <OverlayReadyView
            def={def}
            overlay={overlay}
            lastRunAt={lastRunAt}
            activeDomainReport={activeDomainReport}
            tiles={tiles}
            findings={findings}
            compCounts={kindCounts}
            surface={
              <div className="dm-pair card-span-all">
                {apiSurfaceCard}
                {backendRoutesCard}
              </div>
            }
            extras={
              <>
                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <FlaskConical
                        size={14}
                        className="ov-card__icon"
                        aria-hidden
                      />
                      Endpoint Test Coverage
                      <InfoTip label="Endpoint Test Coverage">
                        Untested routes from Core&apos;s backend report — stem
                        match plus import edges when an index is available.
                      </InfoTip>
                    </span>
                    <SearchableInput
                      className="dm-filter-search"
                      value={coverageFilter}
                      onChange={setCoverageFilter}
                      placeholder="Filter untested…"
                      spellCheck={false}
                      aria-label="Filter untested endpoints"
                    />
                  </div>
                  {coverage && coverage.total > 0 ? (
                    coverage.untested.length > 0 ? (
                      coverageRows.length > 0 ? (
                        <div className="dm-findings">
                          {coverageRows.map((e) => (
                            <div
                              key={e.id}
                              className="dm-finding"
                              data-sev="medium"
                            >
                              <div className="dm-finding__row">
                                <FileWarning size={13} aria-hidden />
                                <span className="dm-finding__msg ov-ellipsis">
                                  {e.method} {e.path}
                                  {e.handlerName ? ` (${e.handlerName})` : ""}
                                </span>
                                <span className="dm-tag dm-tag--warn">
                                  no test
                                </span>
                              </div>
                              <span className="dm-finding__path ov-mono ov-ellipsis">
                                {e.handlerFile}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState>
                          No untested endpoints match the filter.
                        </EmptyState>
                      )
                    ) : (
                      <EmptyState>
                        Every extracted route has linked test coverage.
                      </EmptyState>
                    )
                  ) : (
                    <EmptyState>No endpoints to assess.</EmptyState>
                  )}
                  {coverage ? (
                    <p className="dm-note">
                      {coverage.tested}/{coverage.total} covered · from
                      Core&apos;s backend report.
                    </p>
                  ) : null}
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <CardIcon icon={Database} tone="brand" size={14} />
                      Data Layer
                      <InfoTip label="Data Layer">
                        Models, migrations, SQL, and DB clients detected in the
                        workspace.
                      </InfoTip>
                    </span>
                    <span className="ov-card__meta">
                      {activeBackendReport?.dataLayer.length ?? 0}
                    </span>
                  </div>
                  <div className="dm-datalayer-grid">
                    {dataLayerGrid.map((d) => (
                      <div key={d.kind} className="dm-dl-card">
                        <CardIcon icon={d.icon} tone={d.tone} size={16} />
                        <span className="dm-dl-card__count ov-mono">
                          {d.count}
                        </span>
                        <span className="dm-dl-card__label">{d.label}</span>
                      </div>
                    ))}
                  </div>
                  {(activeBackendReport?.dataLayer.length ?? 0) > 0 ? (
                    <div className="dm-rank">
                      {activeBackendReport!.dataLayer.slice(0, 12).map((d) => (
                        <div key={d.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {d.kind}
                            </span>
                            <span className="dm-rank__path ov-mono ov-ellipsis">
                              {d.path}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>
                      No models, migrations, or DB clients detected.
                    </EmptyState>
                  )}
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Plug size={14} className="ov-card__icon" aria-hidden />
                      Env &amp; Integrations
                      <InfoTip label="Env & Integrations">
                        Environment variables and third-party SDK usage detected
                        in source.
                      </InfoTip>
                    </span>
                  </div>
                  {(activeBackendReport?.envVars.length ?? 0) > 0 ||
                  (activeBackendReport?.integrations.length ?? 0) > 0 ? (
                    <div className="dm-split-sections">
                      <div className="dm-split-section">
                        <div className="dm-split-section__head">
                          <span>Environment</span>
                          <span className="ov-card__meta">
                            {activeBackendReport?.envVars.length ?? 0}
                          </span>
                        </div>
                        {(activeBackendReport?.envVars.length ?? 0) > 0 ? (
                          <div className="dm-rank">
                            {(activeBackendReport?.envVars ?? [])
                              .slice(0, 8)
                              .map((v) => (
                                <div
                                  key={`${v.name}:${v.path}`}
                                  className="dm-rank__row"
                                >
                                  <div className="dm-rank__main">
                                    <span className="dm-rank__name ov-mono ov-ellipsis">
                                      {v.name}
                                    </span>
                                    <span className="dm-rank__path ov-mono ov-ellipsis">
                                      {v.path}
                                    </span>
                                  </div>
                                  <span className="dm-tag">env</span>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <EmptyState>No env vars detected.</EmptyState>
                        )}
                      </div>
                      <div className="dm-split-section">
                        <div className="dm-split-section__head">
                          <span>Integrations</span>
                          <span className="ov-card__meta">
                            {activeBackendReport?.integrations.length ?? 0}
                          </span>
                        </div>
                        {(activeBackendReport?.integrations.length ?? 0) > 0 ? (
                          <div className="dm-rank">
                            {(activeBackendReport?.integrations ?? [])
                              .slice(0, 8)
                              .map((i) => (
                                <div key={i.id} className="dm-rank__row">
                                  <div className="dm-rank__main">
                                    <span className="dm-rank__name ov-ellipsis">
                                      {i.name}
                                    </span>
                                    <span className="dm-rank__path ov-mono ov-ellipsis">
                                      {i.path ?? "—"}
                                    </span>
                                  </div>
                                  <span className="dm-tag">sdk</span>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <EmptyState>No third-party SDKs detected.</EmptyState>
                        )}
                      </div>
                    </div>
                  ) : (
                    <EmptyState>
                      No env vars or third-party SDKs detected.
                    </EmptyState>
                  )}
                </article>

                {(activeBackendReport?.background.length ?? 0) > 0 ? (
                  <article className="ov-card">
                    <div className="ov-card__head">
                      <span className="ov-card__title">
                        <Workflow
                          size={14}
                          className="ov-card__icon"
                          aria-hidden
                        />
                        Background Work
                      </span>
                      <span className="ov-card__meta">
                        {activeBackendReport!.background.length}
                      </span>
                    </div>
                    <div className="dm-rank">
                      {activeBackendReport!.background.map((b) => (
                        <div key={b.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {b.kind}
                            </span>
                            <span className="dm-rank__path ov-mono ov-ellipsis">
                              {b.path}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Flame size={14} className="ov-card__icon" aria-hidden />
                      Churn Hotspots
                    </span>
                  </div>
                  {churn.length > 0 ? (
                    <div className="dm-rank">
                      {churn.map((row) => (
                        <div key={row.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {row.label}
                            </span>
                            <span className="dm-rank__path ov-mono ov-ellipsis">
                              {row.path}
                            </span>
                          </div>
                          <span className="dm-rank__val ov-mono">
                            {row.commits} commits
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>No recent git changes to handlers.</EmptyState>
                  )}
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <ShieldCheck
                        size={14}
                        className="ov-card__icon"
                        aria-hidden
                      />
                      Security Surface
                    </span>
                    <span className="ov-card__meta">
                      {securityNodes.length} files
                    </span>
                  </div>
                  {securityFindings.length > 0 ? (
                    <div className="dm-findings">
                      {securityFindings.map((f) => (
                        <div
                          key={f.id}
                          className="dm-finding"
                          data-sev={f.severity}
                        >
                          <div className="dm-finding__row">
                            <ShieldAlert size={13} aria-hidden />
                            <span className="dm-finding__msg">{f.message}</span>
                          </div>
                          {f.path ? (
                            <span className="dm-finding__path ov-mono ov-ellipsis">
                              {f.path}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : securityNodes.length > 0 ? (
                    <div className="dm-rank">
                      {securityNodes.slice(0, 10).map((n) => (
                        <div key={n.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {n.label}
                            </span>
                            <span className="dm-rank__path ov-mono ov-ellipsis">
                              {nodePath(n.attrs)}
                            </span>
                          </div>
                          <span
                            className="dm-kind"
                            style={{
                              color: "#F59E0B",
                              borderColor:
                                "color-mix(in srgb, #F59E0B 34%, transparent)",
                              background:
                                "color-mix(in srgb, #F59E0B 13%, transparent)",
                            }}
                          >
                            {kindLabel(n.kind)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>
                      No auth / security-sensitive files detected.
                    </EmptyState>
                  )}
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Network
                        size={14}
                        className="ov-card__icon"
                        aria-hidden
                      />
                      Most Depended-on
                    </span>
                  </div>
                  {mostDepended.length > 0 ? (
                    <div className="dm-rank">
                      {mostDepended.map((row) => (
                        <div key={row.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {row.label}
                            </span>
                            <span className="dm-rank__path ov-mono ov-ellipsis">
                              {row.path}
                            </span>
                          </div>
                          <span className="dm-rank__val ov-mono">
                            {row.deps} dependents
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>
                      No inbound dependencies found for handlers.
                    </EmptyState>
                  )}
                  <p className="dm-note">
                    In-degree from the file dependency graph.
                  </p>
                </article>
              </>
            }
          />
        ) : null
      }
    />
  );
}
