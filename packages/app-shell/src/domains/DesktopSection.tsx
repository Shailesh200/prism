import type { DesktopDomainReport } from "@repo-prism/shared";
import {
  buildDesktopBoundaryLinks,
  buildDesktopIpcChannels,
  buildDesktopTiles,
  buildDomainStackSnapshot,
  desktopProcessNodes,
  kindCountOf,
  rankChurnHotspots,
  rankMostDepended,
} from "@repo-prism/shared";
import { EmptyState, InfoTip } from "@repo-prism/ui";
import { AppWindow, Flame, Network, Sparkles } from "lucide-react";
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
  overlayAnalyzeSteps,
  overlayKindCounts,
  shortProcessLabel,
  sortedOverlayFindings,
  type DomainScreenProps,
  type Tile,
} from "./shared.js";

export function DesktopSection(props: DomainScreenProps): ReactElement {
  const { def, overlay, status, lastRunAt, liveDomainReport, subtitle, nodes } =
    useOverlaySession(props);
  const [filter, setFilter] = useState("");

  const desktopDomainReport: DesktopDomainReport | null =
    liveDomainReport?.domain === "desktop" ? liveDomainReport : null;

  const activeDomainReport =
    liveDomainReport?.domain === props.domainId ? liveDomainReport : null;

  const findings = useMemo(() => sortedOverlayFindings(overlay), [overlay]);

  const kindCounts = useMemo(
    () => overlayKindCounts(nodes, desktopDomainReport?.kindCounts),
    [nodes, desktopDomainReport],
  );

  const kindCount = (kind: string): number => kindCountOf(nodes, kind);

  const desktopMostDepended = useMemo(() => {
    if (desktopDomainReport) return desktopDomainReport.mostDepended;
    return rankMostDepended(desktopProcessNodes(nodes), props.depGraph);
  }, [desktopDomainReport, nodes, props.depGraph]);

  const desktopChurn = useMemo(() => {
    if (desktopDomainReport) return desktopDomainReport.churn;
    return rankChurnHotspots(desktopProcessNodes(nodes), props.gitActivity);
  }, [desktopDomainReport, nodes, props.gitActivity]);

  const desktopStack = useMemo(() => {
    if (desktopDomainReport) return desktopDomainReport.stack;
    return buildDomainStackSnapshot(props.dna, "desktop");
  }, [desktopDomainReport, props.dna]);

  const desktopBoundaryLinks = useMemo(() => {
    if (desktopDomainReport) return desktopDomainReport.boundaryLinks;
    return buildDesktopBoundaryLinks(overlay);
  }, [desktopDomainReport, overlay]);

  const desktopIpcChannels = useMemo(() => {
    if (desktopDomainReport) return desktopDomainReport.ipcChannels;
    return buildDesktopIpcChannels(overlay);
  }, [desktopDomainReport, overlay]);

  const desktopTiles = useMemo(() => {
    if (desktopDomainReport) return desktopDomainReport.tiles;
    return buildDesktopTiles(nodes);
  }, [desktopDomainReport, nodes]);

  const filtered = useMemo(
    () => filterOverlayNodes(nodes, filter),
    [nodes, filter],
  );

  const tiles: Tile[] = [
    { label: "Main", value: desktopTiles?.main ?? kindCount("main") },
    {
      label: "Renderer",
      value: desktopTiles?.renderer ?? kindCount("renderer"),
    },
    {
      label: "IPC Files",
      value: desktopTiles?.ipc ?? kindCount("ipc"),
    },
    {
      label:
        (desktopTiles?.tauriConfig ?? kindCount("tauri-config")) > 0 &&
        (desktopTiles?.preload ?? kindCount("preload")) === 0
          ? "Tauri"
          : "Preload",
      value:
        (desktopTiles?.tauriConfig ?? kindCount("tauri-config")) > 0 &&
        (desktopTiles?.preload ?? kindCount("preload")) === 0
          ? (desktopTiles?.tauriConfig ?? kindCount("tauri-config"))
          : (desktopTiles?.preload ?? kindCount("preload")),
    },
  ];

  const analyzeSteps = overlayAnalyzeSteps(def, { isDesktop: true });

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
                surfaceRows={filtered}
                surfaceTotal={nodes.length}
                variant="desktop"
              />
            }
            extras={
              <>
                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Sparkles
                        size={14}
                        className="ov-card__icon"
                        aria-hidden
                      />
                      Desktop Stack
                      <InfoTip label="Desktop Stack">
                        Electron / Tauri frameworks and stack DNA signals for
                        this workspace.
                      </InfoTip>
                    </span>
                    {desktopStack?.detected ? (
                      <span className="ov-card__meta">Detected</span>
                    ) : null}
                  </div>
                  {desktopStack &&
                  (desktopStack.frameworks.length > 0 ||
                    desktopStack.signals.length > 0) ? (
                    <>
                      {desktopStack.frameworks.length > 0 ? (
                        <div className="dm-pipe__tags dm-mobile-stack__fw">
                          {desktopStack.frameworks.map((f) => (
                            <span
                              key={f}
                              className="dm-pipe__ev dm-pipe__ev--dispatch"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {desktopStack.signals.length > 0 ? (
                        <div className="dm-rank">
                          {desktopStack.signals.map((s) => (
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
                      No desktop stack signals in Codebase DNA yet.
                    </EmptyState>
                  )}
                  <p className="dm-note">
                    From stack DNA (Electron / Tauri detectors).
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
                      Boundary Links
                      <InfoTip label="Boundary Links">
                        Structural edges from desktop-boundary (ipc / exposes /
                        loads) between main, preload, and renderer.
                      </InfoTip>
                    </span>
                    <span className="ov-card__meta">
                      {desktopBoundaryLinks.length}
                    </span>
                  </div>
                  {desktopBoundaryLinks.length > 0 ? (
                    <div className="dm-rank">
                      {desktopBoundaryLinks.map((l) => (
                        <div key={l.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {kindLabel(l.fromKind)} → {kindLabel(l.toKind)}
                            </span>
                            <span className="dm-rank__path ov-mono ov-ellipsis">
                              {l.fromLabel} · {l.toLabel}
                            </span>
                          </div>
                          <span className="dm-rank__val ov-mono">{l.kind}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>
                      {kindCount("main") +
                        kindCount("preload") +
                        kindCount("renderer") <
                      2
                        ? "Need at least two of main / preload / renderer process files to infer boundary links."
                        : "Process files detected, but no ipc/exposes/loads edges were inferred — check entry filenames (main.ts, preload.ts, renderer)."}
                    </EmptyState>
                  )}
                  <p className="dm-note">
                    Structural edges only — not per-channel IPC.
                  </p>
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <AppWindow
                        size={14}
                        className="ov-card__icon"
                        aria-hidden
                      />
                      IPC Channels &amp; Risk Callouts
                      <InfoTip label="IPC Channels">
                        Channel names from ipcMain.handle / ipcRenderer.invoke /
                        contextBridge.exposeInMainWorld. Preload exposure is
                        risk medium.
                      </InfoTip>
                    </span>
                    <span className="ov-card__meta">
                      {desktopIpcChannels.length}
                    </span>
                  </div>
                  {desktopIpcChannels.length > 0 ? (
                    <div className="dm-rank">
                      {desktopIpcChannels.map((c) => (
                        <div
                          key={`${c.source}:${c.name}:${c.path}`}
                          className="dm-rank__row"
                        >
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-mono ov-ellipsis">
                              {c.name}
                            </span>
                            <span className="dm-rank__path ov-mono ov-ellipsis">
                              {c.source} · {c.path.split("/").pop() ?? c.path}
                            </span>
                          </div>
                          <span
                            className={`dm-tag${
                              c.risk === "medium" ? " dm-tag--warn" : ""
                            }`}
                          >
                            {c.risk}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState>
                      No ipcMain / ipcRenderer / contextBridge channel names
                      parsed yet.
                    </EmptyState>
                  )}
                </article>

                <article className="ov-card">
                  <div className="ov-card__head">
                    <span className="ov-card__title">
                      <Flame size={14} className="ov-card__icon" aria-hidden />
                      Process Churn Hotspots
                      <InfoTip label="Process Churn Hotspots">
                        Desktop boundary files with the most recent git commits.
                      </InfoTip>
                    </span>
                  </div>
                  {desktopChurn.length > 0 ? (
                    <div className="dm-rank">
                      {desktopChurn.map((row) => (
                        <div key={row.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {shortProcessLabel(row.label, row.kind, row.path)}
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
                      No recent git changes to desktop boundary files.
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
                      Most Depended-on Process Files
                      <InfoTip label="Most Depended-on Process Files">
                        Process / IPC files with highest inbound dependency
                        edges.
                      </InfoTip>
                    </span>
                  </div>
                  {desktopMostDepended.length > 0 ? (
                    <div className="dm-rank">
                      {desktopMostDepended.map((row) => (
                        <div key={row.id} className="dm-rank__row">
                          <div className="dm-rank__main">
                            <span className="dm-rank__name ov-ellipsis">
                              {shortProcessLabel(row.label, row.kind, row.path)}
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
                      No inbound dependencies found for process files.
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
