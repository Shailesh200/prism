import type { DnaReport } from "@prism/shared";
import { ArrowLeft, ArrowRight, Compass } from "lucide-react";
import type { ReactElement } from "react";
import { AppSidebar, type AppSidebarUser, type AppView } from "./AppSidebar.js";
import { shellNavVariant, shellRootClass } from "./shell-layout.js";
import { DOMAIN_CATALOG } from "./domain-catalog.js";
import { describeSignal, signalDetectionTip } from "./stack-signal-meta.js";

export type DomainsScreenProps = {
  readonly repoLabel: string;
  readonly branch?: string | undefined;
  readonly user?: AppSidebarUser | null;
  readonly dna: DnaReport | null;
  readonly onNavigate: (view: AppView) => void;
  readonly onOpenDomain: (domainId: string) => void;
};

/**
 * Domains explorer — lists stack domains detected in the repo (same set as
 * Codebase Profile). Opening a detected domain launches its dedicated screen.
 */
export function DomainsScreen(props: DomainsScreenProps): ReactElement {
  const domains = (() => {
    const base = [...(props.dna?.stack?.domains ?? [])];
    // Always offer DevOps from local CI overlays — Remote Git toggle is fetch-only.
    if (!base.includes("devops_platform")) {
      base.push("devops_platform");
    }
    return base;
  })();
  const signals = props.dna?.stack?.signals ?? [];
  const subtitle = [props.repoLabel, props.branch].filter(Boolean).join(" · ");
  const detectedCount = DOMAIN_CATALOG.filter((d) =>
    domains.includes(d.id),
  ).length;

  const confidence = (id: string): number =>
    signals
      .filter((s) => s.domain === id)
      .reduce((m, s) => Math.max(m, s.confidence), 0);

  const techSignals = (id: string) =>
    signals.filter((s) => s.domain === id).slice(0, 4);

  return (
    <div className={shellRootClass()}>
      <AppSidebar
        variant={shellNavVariant()}
        active="domains"
        repoLabel={props.repoLabel}
        user={props.user ?? null}
        onNavigate={props.onNavigate}
      />

      <div className="ov-main">
        <header className="ov-top">
          <div>
            <div className="ov-top__title">Domains</div>
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
          </div>
        </header>

        <div className="ov-scroll">
          <div className="dm-explore__intro">
            <Compass size={18} aria-hidden />
            <div>
              <p className="dm-explore__lead">
                {detectedCount > 0
                  ? `${detectedCount} domain${detectedCount === 1 ? "" : "s"} detected in this workspace`
                  : "No stack domains detected yet"}
              </p>
              <p className="dm-explore__sub">
                Same domains as Codebase Profile. Open a detected domain to run
                its opt-in analysis.
              </p>
            </div>
          </div>

          <div className="dm-explore__grid">
            {DOMAIN_CATALOG.map((d) => {
              const detected = domains.includes(d.id);
              const Icon = d.icon;
              const conf = confidence(d.id);
              const tech = techSignals(d.id);
              return (
                <article
                  key={d.id}
                  className="ov-card dm-explore__card"
                  data-on={detected ? "true" : "false"}
                >
                  <div className="dm-explore__head">
                    <span className="dm-explore__icon" aria-hidden>
                      <Icon size={18} />
                    </span>
                    <div className="dm-explore__titles">
                      <span className="dm-explore__name">{d.label}</span>
                      {detected ? (
                        <span className="dm-explore__badge">Detected</span>
                      ) : (
                        <span className="dm-explore__badge dm-explore__badge--off">
                          Not detected
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="dm-explore__desc">{d.description}</p>
                  {detected ? (
                    <>
                      <div className="dm-explore__meta">
                        <span className="ov-mono">
                          {Math.round(conf * 100)}% confidence
                        </span>
                        {tech.length > 0 ? (
                          <div className="dm-explore__stack" role="list">
                            {tech.map((s) => {
                              const meta = describeSignal(s.id, s.domain);
                              const TechIcon = meta.icon;
                              return (
                                <span
                                  key={s.id}
                                  role="listitem"
                                  className="dm-explore__stack-chip"
                                  title={signalDetectionTip(s)}
                                  aria-label={`${meta.category} ${meta.label}`}
                                >
                                  <TechIcon size={12} aria-hidden />
                                  <span className="dm-explore__stack-label">
                                    {meta.category} {meta.label}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="ov-btn ov-btn--primary dm-explore__open"
                        onClick={() => props.onOpenDomain(d.id)}
                      >
                        Open domain
                        <ArrowRight size={13} aria-hidden />
                      </button>
                    </>
                  ) : (
                    <p className="ov-empty dm-explore__empty">
                      No signals for this domain in the current workspace.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
