import type {
  DomainReport,
  DomainReportDomain,
  GraphNodeDto,
  UtilityOverlayReport,
} from "@repo-prism/shared";
import { useEffect, useState } from "react";
import { useAppShellClient } from "../client-context.js";
import type { AppShellClient } from "../client.js";
import {
  DOMAINS,
  domainSubtitle,
  type DomainDef,
  type DomainOverlayStatus,
  type DomainScreenProps,
} from "./shared.js";
import {
  domainStoreKey,
  readStore,
  writeStore,
  type OverlaySnapshot,
} from "./store.js";

export type OverlaySession = {
  def: DomainDef;
  client: AppShellClient;
  overlay: UtilityOverlayReport | null;
  status: DomainOverlayStatus;
  lastRunAt: number | null;
  liveDomainReport: DomainReport | null;
  subtitle: string;
  nodes: GraphNodeDto[];
};

export function useOverlaySession(props: DomainScreenProps): OverlaySession {
  const def = DOMAINS[props.domainId] ?? DOMAINS.backend!;
  const client = useAppShellClient();
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  // Analyze-only-on-click: fall back to the last locally-cached overlay run so
  // reopening a domain shows last-synced data instead of re-running (#14).
  const overlayCacheKey = domainStoreKey(
    props.repoLabel,
    props.domainId,
    "overlay",
  );
  const [cachedOverlay, setCachedOverlay] = useState<OverlaySnapshot | null>(
    () => readStore<OverlaySnapshot>(overlayCacheKey),
  );
  // On open the host reports "idle" (no auto-run). If we have a cached run,
  // surface it as "ready" so the user sees last-synced data with a timestamp
  // and can re-analyse on demand. "loading"/"error" keep host semantics.
  const useCached =
    !props.overlay && props.status === "idle" && !!cachedOverlay;
  const overlay = props.overlay ?? (useCached ? cachedOverlay!.overlay : null);
  const status: DomainOverlayStatus = useCached ? "ready" : props.status;

  const [liveDomainReport, setLiveDomainReport] = useState<DomainReport | null>(
    props.domainReport ?? null,
  );

  // A fresh overlay run from the host → persist it and mark "just now".
  useEffect(() => {
    if (props.status === "ready" && props.overlay) {
      const at = Date.now();
      setLastRunAt(at);
      const snapshot: OverlaySnapshot = { overlay: props.overlay, at };
      setCachedOverlay(snapshot);
      writeStore(overlayCacheKey, snapshot);
    }
  }, [
    props.status,
    props.overlay?.generatedAt,
    props.overlay?.summary,
    overlayCacheKey,
  ]);

  // Restore the cached run's "last run" label when the host has no live overlay.
  useEffect(() => {
    if (!props.overlay && cachedOverlay) {
      setLastRunAt(cachedOverlay.at);
    }
  }, [props.overlay, cachedOverlay]);

  // Re-read the cached overlay whenever the domain/repo changes (open ≠ re-run).
  useEffect(() => {
    setCachedOverlay(readStore<OverlaySnapshot>(overlayCacheKey));
  }, [overlayCacheKey]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setLiveDomainReport(props.domainReport ?? null);
  }, [props.domainReport]);

  useEffect(() => {
    const fetchReport = client.fetchDomainReport;
    if (!fetchReport) return;
    const domain = props.domainId as DomainReportDomain;
    let cancelled = false;
    void fetchReport({ domain })
      .then((report) => {
        if (!cancelled && report) setLiveDomainReport(report);
      })
      .catch(() => {
        /* keep host / local fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [client, props.domainId, props.repoLabel]);

  const subtitle = domainSubtitle(props.repoLabel, props.branch);
  const nodes = overlay?.graph.nodes ?? [];

  return {
    def,
    client,
    overlay,
    status,
    lastRunAt,
    liveDomainReport,
    subtitle,
    nodes,
  };
}
