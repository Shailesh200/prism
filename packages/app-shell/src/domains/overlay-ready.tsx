import type {
  DomainReport,
  GraphNodeDto,
  UtilityOverlayFinding,
  UtilityOverlayReport,
} from "@repo-prism/shared";
import {
  EmptyState,
  InfoTip,
  relativeTime,
  SearchableInput,
} from "@repo-prism/ui";
import { FileWarning, Flame, Layers, ShieldAlert } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import {
  kindColor,
  kindLabel,
  shortProcessLabel,
  type DomainDef,
  type Tile,
} from "./shared.js";

export function OverlayRunbar(props: {
  overlay: UtilityOverlayReport;
  lastRunAt: number | null;
  activeDomainReport: DomainReport | null;
  tools?: ReactNode;
}): ReactElement {
  return (
    <div className="dm-runbar">
      <span className="dm-runbar__dot" aria-hidden />
      Last run{" "}
      {relativeTime(
        new Date(props.lastRunAt ?? props.overlay.generatedAt).toISOString(),
      )}{" "}
      · {props.overlay.summary}
      {props.activeDomainReport
        ? ` · Report computed ${relativeTime(
            new Date(props.activeDomainReport.generatedAt).toISOString(),
          )}`
        : null}
      {props.tools}
    </div>
  );
}

export function OverlayKpis(props: { tiles: readonly Tile[] }): ReactElement {
  return (
    <section className="ov-kpis">
      {props.tiles.map((t) => (
        <article key={t.label} className="ov-stat">
          <div className="ov-stat__head">
            <span className="ov-stat__k">
              {t.label}
              {t.tip ? <InfoTip label={t.label}>{t.tip}</InfoTip> : null}
            </span>
          </div>
          <div className={`ov-stat__v${t.warn ? " dm-stat--warn" : ""}`}>
            {t.value}
          </div>
        </article>
      ))}
    </section>
  );
}

export function OverlayComposition(props: {
  compCounts: readonly (readonly [string, number])[];
  compTotal: number;
}): ReactElement {
  return (
    <article className="ov-card">
      <div className="ov-card__head">
        <span className="ov-card__title">
          <Layers size={14} className="ov-card__icon" aria-hidden />
          Composition
          <InfoTip label="Composition">
            Breakdown of detected node kinds in this overlay run.
          </InfoTip>
        </span>
      </div>
      {props.compCounts.length > 0 ? (
        <div className="dm-comp">
          {props.compCounts.map(([kind, count]) => {
            const pct =
              props.compTotal > 0
                ? Math.round((count / props.compTotal) * 100)
                : 0;
            return (
              <div key={kind} className="dm-comp__row">
                <div className="dm-comp__top">
                  <span className="dm-comp__label">{kindLabel(kind)}</span>
                  <span className="ov-mono dm-comp__count">{count}</span>
                </div>
                <div className="dm-comp__bar">
                  <span
                    className="dm-comp__fill"
                    style={{
                      width: `${pct}%`,
                      background: kindColor(kind),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState>Nothing detected.</EmptyState>
      )}
    </article>
  );
}

export function OverlayFindings(props: {
  findings: readonly UtilityOverlayFinding[];
}): ReactElement {
  return (
    <article className="ov-card">
      <div className="ov-card__head">
        <span className="ov-card__title">
          <FileWarning size={14} className="ov-card__icon" aria-hidden />
          Findings
          <InfoTip label="Findings">
            Heuristic callouts from this overlay (e.g. workflows missing
            concurrency or permissions). Empty means no automated findings — not
            a deep audit pass.
          </InfoTip>
        </span>
        {props.findings.length > 0 ? (
          <span className="ov-card__meta">{props.findings.length}</span>
        ) : null}
      </div>
      {props.findings.length > 0 ? (
        <div className="dm-findings">
          {props.findings.map((f) => (
            <div key={f.id} className="dm-finding" data-sev={f.severity}>
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
      ) : (
        <EmptyState>No automated findings for this overlay run</EmptyState>
      )}
    </article>
  );
}

export function OverlayFoot(props: { sources: string }): ReactElement {
  return (
    <p className="dm-foot">
      Inferred from {props.sources}. Local heuristics only — no network.
    </p>
  );
}

export function OverlayReadyView(props: {
  def: DomainDef;
  overlay: UtilityOverlayReport;
  lastRunAt: number | null;
  activeDomainReport: DomainReport | null;
  tiles: readonly Tile[];
  findings: readonly UtilityOverlayFinding[];
  compCounts: readonly (readonly [string, number])[];
  surface: ReactNode;
  extras?: ReactNode;
  runbarTools?: ReactNode;
}): ReactElement {
  const compTotal = props.compCounts.reduce((acc, [, c]) => acc + c, 0);
  return (
    <>
      <OverlayRunbar
        overlay={props.overlay}
        lastRunAt={props.lastRunAt}
        activeDomainReport={props.activeDomainReport}
        tools={props.runbarTools}
      />
      <OverlayKpis tiles={props.tiles} />
      <div className="card-masonry">
        {props.surface}
        <OverlayComposition
          compCounts={props.compCounts}
          compTotal={compTotal}
        />
        <OverlayFindings findings={props.findings} />
        {props.extras}
      </div>
      <OverlayFoot sources={props.def.sources} />
    </>
  );
}

export type OverlaySurfaceVariant =
  | "generic"
  | "backend"
  | "mobile"
  | "desktop";

export function OverlaySurfaceCard(props: {
  def: DomainDef;
  filter: string;
  onFilter: (value: string) => void;
  surfaceRows: readonly GraphNodeDto[];
  surfaceTotal: number;
  variant: OverlaySurfaceVariant;
  screenCoverage?: {
    total: number;
    tested: number;
    untestedIds: Set<string>;
  } | null;
  onBlast?: (path: string) => void;
}): ReactElement {
  const enriched = props.variant === "backend";
  const isMobile = props.variant === "mobile";
  const isDesktop = props.variant === "desktop";
  const screenCoverage = props.screenCoverage ?? null;
  return (
    <article className="ov-card">
      <div className="ov-card__head">
        <span className="ov-card__title">
          <Layers size={14} className="ov-card__icon" aria-hidden />
          {props.def.surfaceLabel}
          <InfoTip label={props.def.surfaceLabel}>
            Nodes detected by the {props.def.kind ?? "domain"} overlay from{" "}
            {props.def.sources}.
          </InfoTip>
        </span>
        <SearchableInput
          className="dm-filter-search"
          value={props.filter}
          onChange={props.onFilter}
          placeholder={enriched ? "Filter routes or files…" : "Filter…"}
          spellCheck={false}
          aria-label={
            enriched
              ? "Filter routes and detected nodes"
              : "Filter detected nodes"
          }
        />
      </div>
      {props.surfaceRows.length > 0 ? (
        <div
          className={`dm-surface${isMobile ? " dm-surface--mobile" : ""}${enriched ? " dm-surface--blast" : ""}`}
        >
          <div className="dm-surface__head">
            {isMobile ? (
              <>
                <span>Screen</span>
                <span>File</span>
                <span>Router</span>
                <span>Tests</span>
              </>
            ) : (
              <>
                <span>Kind</span>
                <span>Name</span>
                <span>File</span>
                {enriched ? (
                  <span className="dm-surface__impact-h">Impact</span>
                ) : null}
              </>
            )}
          </div>
          <div className="dm-surface__body">
            {props.surfaceRows.map((n) => {
              const path = String(n.attrs?.path ?? "");
              const base =
                path
                  .split("/")
                  .pop()
                  ?.replace(/\.[^.]+$/, "") ?? n.label;
              const tested =
                screenCoverage !== null &&
                !screenCoverage.untestedIds.has(n.id);
              return (
                <div key={n.id} className="dm-surface__row">
                  {isMobile ? (
                    <>
                      <span className="dm-surface__name ov-ellipsis">
                        {base}
                      </span>
                      <span
                        className="dm-surface__path ov-mono ov-ellipsis"
                        title={path}
                      >
                        {path || "—"}
                      </span>
                      <span className="dm-surface__router ov-mono">
                        {n.attrs?.router === "expo" ? "expo" : "—"}
                      </span>
                      <span
                        className={`dm-surface__test${
                          tested
                            ? " dm-surface__test--ok"
                            : " dm-surface__test--miss"
                        }`}
                      >
                        {screenCoverage ? (tested ? "yes" : "no") : "—"}
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className="dm-kind"
                        style={{
                          color: kindColor(n.kind),
                          borderColor: `color-mix(in srgb, ${kindColor(n.kind)} 34%, transparent)`,
                          background: `color-mix(in srgb, ${kindColor(n.kind)} 13%, transparent)`,
                        }}
                      >
                        {kindLabel(n.kind)}
                      </span>
                      <span className="dm-surface__name ov-ellipsis">
                        {isDesktop
                          ? shortProcessLabel(n.label, n.kind, path)
                          : n.label}
                      </span>
                      <span
                        className="dm-surface__path ov-mono ov-ellipsis"
                        title={path}
                      >
                        {path || "—"}
                      </span>
                      {enriched ? (
                        <button
                          type="button"
                          className="dm-blastbtn"
                          aria-label={`Open Blast Radius for ${path || n.label}`}
                          title="Open Blast Radius for this file"
                          disabled={!path}
                          onClick={() => props.onBlast?.(path)}
                        >
                          <Flame size={13} aria-hidden />
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState>
          {props.surfaceTotal === 0
            ? "No surface markers detected in this workspace."
            : "No nodes match the filter."}
        </EmptyState>
      )}
      {isMobile && screenCoverage ? (
        <p className="dm-note">
          Tests: filename heuristic vs qa-test-gaps ({screenCoverage.tested}/
          {screenCoverage.total} matched).
        </p>
      ) : null}
    </article>
  );
}

export function filterOverlayNodes(
  nodes: readonly GraphNodeDto[],
  filter: string,
): readonly GraphNodeDto[] {
  const q = filter.trim().toLowerCase();
  if (q === "") return nodes;
  return nodes.filter(
    (n) =>
      n.label.toLowerCase().includes(q) ||
      String(n.attrs?.path ?? "")
        .toLowerCase()
        .includes(q) ||
      n.kind.toLowerCase().includes(q),
  );
}
