import type { MobileDomainReport } from "@repo-prism/shared";
import {
  buildMobileNavLinks,
  buildMobileScreenCoverage,
  buildMobileTiles,
  buildDomainStackSnapshot,
  rankChurnHotspots,
  rankMostDepended,
} from "@repo-prism/shared";
import { EmptyState, InfoTip } from "@repo-prism/ui";
import { Flame, Network, Smartphone, Sparkles } from "lucide-react";
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
  overlayAnalyzeSteps,
  overlayKindCounts,
  sortedOverlayFindings,
  type DomainScreenProps,
  type Tile,
} from "./shared.js";

export function MobileSection(props: DomainScreenProps): ReactElement {
  const {
    def,
    overlay,
    status,
    lastRunAt,
    liveDomainReport,
    subtitle,
    nodes,
  } = useOverlaySession(props);
  const [filter, setFilter] = useState("");

  const mobileDomainReport: MobileDomainReport | null =
    liveDomainReport?.domain === "mobile" ? liveDomainReport : null;

  const activeDomainReport =
    liveDomainReport?.domain === props.domainId ? liveDomainReport : null;

  const findings = useMemo(
    () => sortedOverlayFindings(overlay),
    [overlay],
  );

  const kindCounts = useMemo(
    () => overlayKindCounts(nodes, mobileDomainReport?.kindCounts),
    [nodes, mobileDomainReport],
  );

  const screenNodes = useMemo(
    () => nodes.filter((n) => n.kind === "screen"),
    [nodes],
  );
  const navigatorNodes = useMemo(
    () => nodes.filter((n) => n.kind === "navigator"),
    [nodes],
  );
  const expoScreens = useMemo(
    () => screenNodes.filter((n) => n.attrs?.router === "expo"),
    [screenNodes],
  );

  const screenCoverage = useMemo(() => {
    if (mobileDomainReport) {
      return {
        total: mobileDomainReport.screenCoverage.total,
        tested: mobileDomainReport.screenCoverage.tested,
        untestedIds: new Set(mobileDomainReport.screenCoverage.untestedIds),
      };
    }
    const coverage = buildMobileScreenCoverage(screenNodes, props.qa);
    return {
      total: coverage.total,
      tested: coverage.tested,
      untestedIds: new Set(coverage.untestedIds),
    };
  }, [mobileDomainReport, screenNodes, props.qa]);

  const screenMostDepended = useMemo(() => {
    if (mobileDomainReport) return mobileDomainReport.screenMostDepended;
    return rankMostDepended(screenNodes, props.depGraph);
  }, [mobileDomainReport, screenNodes, props.depGraph]);

  const screenChurn = useMemo(() => {
    if (mobileDomainReport) return mobileDomainReport.screenChurn;
    return rankChurnHotspots(screenNodes, props.gitActivity);
  }, [mobileDomainReport, screenNodes, props.gitActivity]);

  const mobileStack = useMemo(() => {
    if (mobileDomainReport) return mobileDomainReport.stack;
    return buildDomainStackSnapshot(props.dna, "mobile");
  }, [mobileDomainReport, props.dna]);

  const mobileNavLinks = useMemo(() => {
    if (mobileDomainReport) return mobileDomainReport.navLinks;
    return buildMobileNavLinks(overlay);
  }, [mobileDomainReport, overlay]);

  const mobileTiles = useMemo(() => {
    if (mobileDomainReport) return mobileDomainReport.tiles;
    if (!screenCoverage) return null;
    return buildMobileTiles(nodes, {
      total: screenCoverage.total,
      tested: screenCoverage.tested,
      untestedIds: [...screenCoverage.untestedIds],
    });
  }, [mobileDomainReport, nodes, screenCoverage]);

  const filtered = useMemo(
    () => filterOverlayNodes(nodes, filter),
    [nodes, filter],
  );
  const surfaceRows = filtered.filter((n) => n.kind === "screen");
  const surfaceTotal = screenNodes.length;

  const tiles: Tile[] = [
    { label: "Screens", value: mobileTiles?.screens ?? screenNodes.length },
    {
      label: "Navigators",
      value: mobileTiles?.navigators ?? navigatorNodes.length,
    },
    {
      label: "Expo Router",
      value: mobileTiles?.expoRouter ?? expoScreens.length,
    },
    {
      label: "Untested",
      value: mobileTiles?.untested ?? screenCoverage?.untestedIds.size ?? 0,
      warn:
        (mobileTiles?.untested ?? screenCoverage?.untestedIds.size ?? 0) > 0,
    },
  ];

  const analyzeSteps = overlayAnalyzeSteps(def, { isMobile: true });

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
              <OverlaySurfaceCard
                def={def}
                filter={filter}
                onFilter={setFilter}
                surfaceRows={surfaceRows}
                surfaceTotal={surfaceTotal}
                variant="mobile"
                screenCoverage={screenCoverage}
              />
            }
            extras={
              <>
                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Smartphone
                        size={14}
                        className="ov-card__icon"
                        aria-hidden
                      />
                      Navigators
                      <InfoTip label="Navigators">
                        Navigator/Router files that compose screens (Expo
                        _layout, React Navigation Navigator.*).
                      </InfoTip>
                    </span>
                    <span className="ov-card__meta">
                      {navigatorNodes.length}
                    </span>
                  </div>
                  {navigatorNodes.length > 0 ? (
                    <div className="dm-rank">
                      {navigatorNodes.map((n) => (
                        <div key={n.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {n.label.split("/").pop() ?? n.label}
                            </span>
                            <span className="dm-rank__path ov-mono ov-ellipsis">
                              {nodePath(n.attrs)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>
                      No navigation.* / Navigator files detected.
                    </EmptyState>
                  )}
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Sparkles
                        size={14}
                        className="ov-card__icon"
                        aria-hidden
                      />
                      Mobile Stack
                    </span>
                    {mobileStack?.detected ? (
                      <span className="ov-card__meta">Detected</span>
                    ) : null}
                  </div>
                  {mobileStack &&
                  (mobileStack.frameworks.length > 0 ||
                    mobileStack.signals.length > 0) ? (
                    <>
                      {mobileStack.frameworks.length > 0 ? (
                        <div className="dm-pipe__tags dm-mobile-stack__fw">
                          {mobileStack.frameworks.map((f) => (
                            <span
                              key={f}
                              className="dm-pipe__ev dm-pipe__ev--dispatch"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {mobileStack.signals.length > 0 ? (
                        <div className="dm-rank">
                          {mobileStack.signals.map((s) => (
                            <div key={s.id} className="dm-rank__row">
                              <div className="dm-rank__main">
                                <span className="dm-rank__name ov-ellipsis">
                                  {s.id}
                                </span>
                                <span className="dm-rank__path ov-mono ov-ellipsis">
                                  {(s.evidence ?? []).slice(0, 2).join(" · ") ||
                                    s.domain}
                                </span>
                              </div>
                              <span className="dm-rank__val ov-mono">
                                {Math.round(s.confidence * 100)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <EmptyState>
                      No mobile stack signals in Codebase DNA yet.
                    </EmptyState>
                  )}
                  <p className="dm-note">
                    From stack DNA (Expo / React Native / Flutter detectors).
                  </p>
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Flame size={14} className="ov-card__icon" aria-hidden />
                      Screen Churn Hotspots
                    </span>
                  </div>
                  {screenChurn.length > 0 ? (
                    <div className="dm-rank">
                      {screenChurn.map((row) => (
                        <div key={row.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {row.path.split("/").pop() || row.label}
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
                    <EmptyState>
                      No recent git changes to screen files.
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
                      Most Depended-on Screens
                      <InfoTip label="Most Depended-on Screens">
                        Screens with highest inbound dependency edges from the
                        file graph.
                      </InfoTip>
                    </span>
                  </div>
                  {screenMostDepended.length > 0 ? (
                    <div className="dm-rank">
                      {screenMostDepended.map((row) => (
                        <div key={row.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {row.path.split("/").pop() || row.label}
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
                      No inbound dependencies found for screens.
                    </EmptyState>
                  )}
                  <p className="dm-note">
                    In-degree from the file dependency graph.
                  </p>
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Network
                        size={14}
                        className="ov-card__icon"
                        aria-hidden
                      />
                      Navigation Topology
                      <InfoTip label="Navigation Topology">
                        Real navigates edges from React Navigation / Expo Router
                        parsing, or screens that share a navigator parent folder
                        when explicit links are limited.
                      </InfoTip>
                    </span>
                    <span className="ov-card__meta">{mobileNavLinks.length}</span>
                  </div>
                  {mobileNavLinks.length > 0 ? (
                    <div className="dm-rank">
                      {mobileNavLinks.slice(0, 16).map((l) => (
                        <div key={l.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {l.fromLabel} → {l.toLabel}
                            </span>
                            <span className="dm-rank__path ov-mono ov-ellipsis">
                              {kindLabel(l.fromKind || "node")} →{" "}
                              {kindLabel(l.toKind || "node")}
                            </span>
                          </div>
                          <span className="dm-rank__val ov-mono">navigates</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>
                      No navigates edges yet — re-run analysis after adding Expo
                      Router links, Stack.Screen registrations, or Screen imports.
                    </EmptyState>
                  )}
                  <p className="dm-note">
                    Platform (iOS/Android) and Deep Link details are not available
                    yet.
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
