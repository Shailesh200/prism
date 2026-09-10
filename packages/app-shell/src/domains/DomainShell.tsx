import { ArrowLeft, Loader2, Play, RefreshCw } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import type { UtilityOverlayReport } from "@repo-prism/shared";
import {
  AppSidebar,
  type AppSidebarUser,
  type AppView,
} from "../AppSidebar.js";
import { shellNavVariant, shellRootClass } from "../shell-layout.js";
import type {
  DomainDef,
  DomainOverlayStatus,
  DomainScreenProps,
} from "./shared.js";

export type DomainShellProps = {
  repoLabel: string;
  user?: AppSidebarUser | null;
  onNavigate: (view: AppView) => void;
  title: string;
  subtitle: string;
  headerActions?: ReactNode;
  children: ReactNode;
  extras?: ReactNode;
};

export function DomainShell(props: DomainShellProps): ReactElement {
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
            <div className="ov-top__title">{props.title}</div>
            <div className="ov-top__sub">{props.subtitle}</div>
          </div>
          <div className="ov-top__actions">
            <button
              type="button"
              className="ov-btn ov-btn--ghost"
              onClick={() => props.onNavigate("domains")}
            >
              <ArrowLeft size={13} aria-hidden />
              Back to Domains
            </button>
            {props.headerActions}
          </div>
        </header>

        <div className="ov-scroll">{props.children}</div>
      </div>
      {props.extras}
    </div>
  );
}

export function OverlayAnalyzeButton(props: {
  kind: string;
  onRun: (kind: string) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className="ov-btn ov-btn--primary"
      onClick={() => props.onRun(props.kind)}
    >
      <RefreshCw size={13} aria-hidden />
      Analyze
    </button>
  );
}

export function OverlayLoading(props: {
  def: DomainDef;
  analyzeSteps: readonly string[];
  onCancel?: (() => void) | undefined;
}): ReactElement {
  return (
    <>
      <div className="dm-runbar dm-runbar--busy" role="status">
        <Loader2 size={14} aria-hidden className="bw-spin" />
        <span>Analyzing {props.def.title}…</span>
        <span className="dm-runbar__steps" aria-label="Steps running">
          {props.analyzeSteps.join(" · ")}
        </span>
        {props.onCancel ? (
          <span className="dm-runbar__tools">
            <button
              type="button"
              className="dm-linkbtn"
              onClick={props.onCancel}
            >
              Cancel
            </button>
          </span>
        ) : null}
      </div>
      <section className="ov-kpis" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <article key={i} className="ov-stat">
            <span className="sk sk-line sk-line--sm" />
            <span className="sk sk-line sk-line--xl" />
          </article>
        ))}
      </section>
      <div className="card-masonry" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <article key={i} className="ov-card dm-skel__card">
            <span className="sk sk-line sk-title" />
            <span className="sk sk-line" />
            <span className="sk sk-line" />
            <span className="sk sk-line sk-line--sm" />
          </article>
        ))}
      </div>
    </>
  );
}

export function OverlayDomainFrame(props: {
  screen: DomainScreenProps;
  def: DomainDef;
  subtitle: string;
  overlay: UtilityOverlayReport | null;
  status: DomainOverlayStatus;
  analyzeSteps: readonly string[];
  ready: ReactNode;
  extras?: ReactNode;
}): ReactElement {
  const canRun = props.def.kind !== null;
  return (
    <DomainShell
      repoLabel={props.screen.repoLabel}
      user={props.screen.user ?? null}
      onNavigate={props.screen.onNavigate}
      title={props.def.title}
      subtitle={props.subtitle}
      headerActions={
        props.status === "ready" && props.overlay && canRun ? (
          <OverlayAnalyzeButton
            kind={props.def.kind!}
            onRun={props.screen.onRun}
          />
        ) : null
      }
      extras={props.extras}
    >
      {props.status === "loading" ? (
        <OverlayLoading
          def={props.def}
          analyzeSteps={props.analyzeSteps}
          onCancel={props.screen.onCancel}
        />
      ) : props.status !== "ready" || props.overlay === null ? (
        <OverlayIdle
          def={props.def}
          status={props.status}
          onRun={props.screen.onRun}
        />
      ) : (
        props.ready
      )}
    </DomainShell>
  );
}

export function OverlayIdle(props: {
  def: DomainDef;
  status: DomainOverlayStatus;
  onRun: (kind: string) => void;
}): ReactElement {
  const Icon = props.def.icon;
  const canRun = props.def.kind !== null;
  return (
    <div className="dm-idle">
      <div className="dm-idle__card">
        <span className="dm-idle__icon" aria-hidden>
          <Icon size={26} />
        </span>
        <h2 className="dm-idle__title">{props.def.title}</h2>
        <p className="dm-idle__desc">{props.def.description}</p>
        <p className="dm-idle__privacy">
          Runs locally on demand — no network, no code leaves your machine.
        </p>
        {canRun ? (
          <button
            type="button"
            className="ov-btn ov-btn--primary dm-idle__run"
            onClick={() => props.onRun(props.def.kind!)}
          >
            <Play size={14} aria-hidden />
            Analyze
          </button>
        ) : (
          <span className="dm-idle__soon">
            {props.def.labNote ?? "Coming soon"}
          </span>
        )}
        <p className="dm-idle__sources">
          <span className="dm-idle__sources-k">What this reads</span>
          {props.def.sources}
        </p>
        {props.status === "error" ? (
          <p className="dm-idle__err">
            Analysis failed — check the repository path and try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}
