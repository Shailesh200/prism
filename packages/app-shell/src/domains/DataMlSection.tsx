import type { DataMlAiDomainReport } from "@repo-prism/shared";
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
  sortedOverlayFindings,
  type DomainScreenProps,
} from "./shared.js";

export function DataMlSection(props: DomainScreenProps): ReactElement {
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

  const dataMlDomainReport: DataMlAiDomainReport | null =
    liveDomainReport?.domain === "data_ml_ai" ? liveDomainReport : null;

  const activeDomainReport =
    liveDomainReport?.domain === props.domainId ? liveDomainReport : null;

  const findings = useMemo(() => {
    if (dataMlDomainReport) return dataMlDomainReport.findings;
    return sortedOverlayFindings(overlay);
  }, [dataMlDomainReport, overlay]);

  const kindCounts = useMemo(
    () => overlayKindCounts(nodes, dataMlDomainReport?.kindCounts),
    [nodes, dataMlDomainReport],
  );

  const filtered = useMemo(
    () => filterOverlayNodes(nodes, filter),
    [nodes, filter],
  );

  const severeFindings = findings.filter(
    (f) => f.severity === "high" || f.severity === "medium",
  ).length;

  const tiles = [
    {
      label: "Detected Nodes",
      value: dataMlDomainReport?.nodeCount ?? nodes.length,
    },
    ...kindCounts
      .slice(0, 2)
      .map((k) => ({ label: kindLabel(k[0]), value: k[1] })),
    {
      label: "Findings",
      value: findings.length,
      warn: severeFindings > 0,
    },
  ].slice(0, 4);

  const analyzeSteps = overlayAnalyzeSteps(def, {});

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
                variant="generic"
              />
            }
          />
        ) : null
      }
    />
  );
}
