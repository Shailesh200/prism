import { InfoTip, Text } from "@repo-prism/ui";
import type { RepositoryMap } from "@repo-prism/shared";
import { ArrowRight, Layers, Zap } from "lucide-react";
import { useMemo, type ReactElement } from "react";
import {
  connectedNodeLabel,
  deriveMostConnected,
  deriveRegions,
  scoreColor,
} from "./overview-model.js";

export function GraphInsightCards(props: {
  readonly map: RepositoryMap;
  readonly onOpenBlast?: (seedPath?: string) => void;
}): ReactElement {
  const regionResult = useMemo(
    () => deriveRegions(props.map.graph),
    [props.map.graph],
  );
  const regions = regionResult.regions;
  const connected = useMemo(
    () => deriveMostConnected(props.map.graph, 5),
    [props.map.graph],
  );
  const maxDegree = Math.max(1, ...connected.map((r) => r.degree));

  return (
    <div className="ov-grid ov-grid--2 dna-graph-insights">
      <article className="ov-card">
        <div className="ov-card__head">
          <Text variant="card" as="span" className="ov-card__title">
            <Layers size={14} className="ov-card__icon" aria-hidden />
            Region Health
            <InfoTip label="Region Health">
              Lower scores mean heavier dependency load — start decoupling there
              first.
            </InfoTip>
          </Text>
        </div>
        <div className="ov-table">
          <div className="ov-table__head">
            <span>Region</span>
            <span className="ov-table__num">Files</span>
            <span className="ov-table__num">Score</span>
          </div>
          {regions.map((r) => (
            <div key={r.id} className="ov-table__row">
              <span className="ov-table__region">
                <span className="ov-dot" style={{ background: r.color }} />
                <span className="ov-mono ov-ellipsis" title={r.label}>
                  {r.label}
                </span>
              </span>
              <span className="ov-table__num ov-mono">{r.files}</span>
              <span
                className="ov-table__num ov-mono"
                style={{
                  color: r.score === null ? undefined : scoreColor(r.score),
                }}
              >
                {r.score ?? "—"}
              </span>
            </div>
          ))}
        </div>
        {regionResult.truncated ? (
          <p className="ov-stat__note" style={{ marginTop: 8 }}>
            Showing {regions.length} of {regionResult.totalCount} regions
          </p>
        ) : null}
      </article>

      <article className="ov-card">
        <div className="ov-card__head">
          <Text variant="card" as="span" className="ov-card__title">
            <Zap size={14} className="ov-card__icon" aria-hidden />
            Most Connected
            <InfoTip label="Most Connected">
              Click a node to open Blast Radius for that seed — high degree
              means a wider change surface.
            </InfoTip>
          </Text>
          {props.onOpenBlast ? (
            <button
              type="button"
              className="ov-card__open"
              onClick={() => props.onOpenBlast?.()}
              aria-label="Open Blast Radius"
            >
              <ArrowRight size={15} aria-hidden />
            </button>
          ) : null}
        </div>
        {connected.length > 0 ? (
          <>
            <div className="ov-bars">
              {connected.slice(0, 3).map((r) => {
                const seed =
                  r.kind === "file"
                    ? r.id.startsWith("file:")
                      ? r.id.slice("file:".length)
                      : r.label
                    : undefined;
                const open = (): void => {
                  props.onOpenBlast?.(seed);
                };
                return (
                  <button
                    key={r.id}
                    type="button"
                    className="ov-bars__col ov-bars__col--btn"
                    onClick={open}
                    disabled={!props.onOpenBlast}
                    title={`Open blast radius for ${connectedNodeLabel(r)}`}
                  >
                    <div className="ov-bars__track">
                      <span
                        className="ov-bars__fill"
                        style={{
                          height: `${(r.degree / maxDegree) * 100}%`,
                          background: r.color,
                        }}
                      />
                    </div>
                    <div
                      className="ov-bars__x ov-ellipsis"
                      title={connectedNodeLabel(r)}
                    >
                      {connectedNodeLabel(r)}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="ov-list">
              {connected.map((r) => {
                const seed =
                  r.kind === "file"
                    ? r.id.startsWith("file:")
                      ? r.id.slice("file:".length)
                      : r.label
                    : undefined;
                const open = (): void => {
                  props.onOpenBlast?.(seed);
                };
                return (
                  <button
                    key={r.id}
                    type="button"
                    className="ov-list__row ov-list__row--btn"
                    onClick={open}
                    disabled={!props.onOpenBlast}
                    title={`Open blast radius for ${connectedNodeLabel(r)}`}
                  >
                    <span className="ov-dot" style={{ background: r.color }} />
                    <span
                      className="ov-mono ov-ellipsis"
                      title={connectedNodeLabel(r)}
                    >
                      {connectedNodeLabel(r)}
                    </span>
                    <span className="ov-list__badge">{r.degree} links</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className="ov-empty">
            No dependency edges at the current graph zoom.
          </p>
        )}
      </article>
    </div>
  );
}
