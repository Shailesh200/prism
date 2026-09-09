import type {
  DevopsDomainReport,
  UtilityOverlayReport,
} from "@repo-prism/shared";
import {
  buildDevopsFindings,
  buildDevopsTiles,
  kindCountOf,
} from "@repo-prism/shared";
import { EmptyState, InfoTip, Input, ToggleGroup } from "@repo-prism/ui";
import {
  Activity,
  AlertTriangle,
  ExternalLink,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useAppShellClient } from "../client-context.js";
import { useConsentGranted } from "../consent-state.js";
import {
  matchRemoteWorkflowId,
  parseGithubRepoRef,
  type GithubWorkflowRun,
  type GithubWorkflowSummary,
} from "../github-ci.js";
import {
  loadIntegrationsState,
  loadRemoteRepos,
  removeRemoteRepo,
  upsertRemoteRepo,
  type RemoteDevopsRepo,
} from "../integrations-store.js";
import { OverlayDomainFrame } from "./DomainShell.js";
import { PipelineRunsTable } from "./pipeline-table.js";
import { useOverlaySession } from "./overlay-session.js";
import {
  OverlayReadyView,
  OverlaySurfaceCard,
  filterOverlayNodes,
} from "./overlay-ready.js";
import {
  nodePath,
  overlayAnalyzeSteps,
  overlayKindCounts,
  type DomainScreenProps,
  type Tile,
} from "./shared.js";

type CiDispatchInput = {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
};

function parseCiInputs(
  attrs: Record<string, unknown> | undefined,
): CiDispatchInput[] {
  const raw = attrs?.inputs;
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CiDispatchInput =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as CiDispatchInput).name === "string",
    );
  } catch {
    return [];
  }
}

const DEVOPS_KPI_TIPS: Record<string, string> = {
  "IaC Resources":
    "Terraform, Helm, Kubernetes manifests, and related infra files detected under the workspace (local heuristics).",
  Pipelines:
    "CI workflow definitions from .github/workflows plus any Other Repo CI workflows fetched when GitHub is connected.",
  Containers: "Dockerfiles and compose files detected in the repository tree.",
  Kubernetes:
    "Deployment / Service / Ingress / Kustomization YAML paths matched by name heuristics.",
};


export function DevopsSection(props: DomainScreenProps): ReactElement {
  const {
    def,
    overlay,
    status,
    lastRunAt,
    liveDomainReport,
    subtitle,
    nodes,
  } = useOverlaySession(props);
  const client = useAppShellClient();
  const [filter, setFilter] = useState("");

  // DevOps / GitHub live state
  const [remoteWorkflows, setRemoteWorkflows] = useState<
    GithubWorkflowSummary[]
  >([]);
  const [remoteRuns, setRemoteRuns] = useState<GithubWorkflowRun[]>([]);
  const [githubActor, setGithubActor] = useState<string | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [myTriggeredOnly, setMyTriggeredOnly] = useState(false);
  const [primaryRepoPrivate, setPrimaryRepoPrivate] = useState<boolean | null>(
    null,
  );
  const [wfBusy, setWfBusy] = useState<string | null>(null);
  const [wfResult, setWfResult] = useState<{
    id: string;
    ok: boolean;
    msg: string;
  } | null>(null);
  const [extraRepos, setExtraRepos] = useState<RemoteDevopsRepo[]>(() =>
    loadRemoteRepos(),
  );
  const [extraCi, setExtraCi] = useState<
    Record<
      string,
      {
        runs: GithubWorkflowRun[];
        workflows: GithubWorkflowSummary[];
        overlay: UtilityOverlayReport | null;
        error: string | null;
        busy: boolean;
      }
    >
  >({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addOk, setAddOk] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{
    owner: string;
    repo: string;
  } | null>(null);
  const [githubRefreshKey, setGithubRefreshKey] = useState(0);


  const githubAllowed = useConsentGranted("network.github");
  const integrations = loadIntegrationsState();
  const githubConn = integrations.github;
  const githubEnabled = githubConn?.enabled === true && githubAllowed;
  const githubToken = (githubConn?.config?.token ?? "").trim();
  const primaryOwner = (githubConn?.config?.owner ?? "").trim();
  const primaryRepo = (githubConn?.config?.repo ?? "").trim();
  /** Trigger forms: connected + network; private repos also need a token. */
  const triggersEnabled =
    githubEnabled && (primaryRepoPrivate !== true || githubToken !== "");

  useEffect(() => {
    if (props.domainId !== "devops_platform" || !githubEnabled) {
      setRemoteWorkflows([]);
      setRemoteRuns([]);
      setGithubError(null);
      setPrimaryRepoPrivate(null);
      return;
    }
    const owner = primaryOwner;
    const repo = primaryRepo;
    const token = githubToken;
    if (!owner || !repo) {
      setGithubError("Configure GitHub owner/repo under Integrations.");
      return;
    }
    let cancelled = false;
    setGithubBusy(true);
    setGithubError(null);
    void (async () => {
      const cfg = { owner, repo, ...(token ? { token } : {}) };
      if (
        !client.fetchGithubWorkflows ||
        !client.fetchGithubWorkflowRuns ||
        !client.fetchGithubRepo
      ) {
        if (!cancelled) {
          setGithubError("GitHub CI is not available in this host.");
          setGithubBusy(false);
        }
        return;
      }
      const [wf, runs, login, info] = await Promise.all([
        client.fetchGithubWorkflows(cfg),
        client.fetchGithubWorkflowRuns(cfg),
        token && client.fetchGithubAuthenticatedLogin
          ? client.fetchGithubAuthenticatedLogin(token)
          : Promise.resolve(null),
        client.fetchGithubRepo(cfg),
      ]);
      if (cancelled) return;
      if (wf.ok) setRemoteWorkflows(wf.workflows);
      else setGithubError(wf.error);
      if (runs.ok) setRemoteRuns(runs.runs);
      else if (!wf.ok) {
        /* already set */
      } else setGithubError(runs.error);
      if (info.ok) setPrimaryRepoPrivate(info.repo.private);
      setGithubActor(login);
      setGithubBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    props.domainId,
    githubEnabled,
    primaryOwner,
    primaryRepo,
    githubToken,
    githubRefreshKey,
    client,
  ]);

  const refreshExtraRepo = async (entry: RemoteDevopsRepo): Promise<void> => {
    const key = `${entry.owner}/${entry.repo}`;
    const token = (entry.token ?? githubToken).trim();
    if (!githubEnabled) {
      setExtraCi((prev) => ({
        ...prev,
        [key]: {
          runs: [],
          workflows: [],
          overlay: null,
          error: "Enable GitHub + Allow network integrations first.",
          busy: false,
        },
      }));
      return;
    }
    setExtraCi((prev) => ({
      ...prev,
      [key]: {
        runs: prev[key]?.runs ?? [],
        workflows: prev[key]?.workflows ?? [],
        overlay: prev[key]?.overlay ?? null,
        error: null,
        busy: true,
      },
    }));
    const cfg = {
      owner: entry.owner,
      repo: entry.repo,
      ...(token ? { token } : {}),
    };
    try {
      let overlay: UtilityOverlayReport | null = null;
      if (client.stageDevopsRemote) {
        const staged = await client.stageDevopsRemote({
          owner: entry.owner,
          repo: entry.repo,
          ...(token ? { token } : {}),
        });
        overlay = staged.overlay;
      }
      if (!client.fetchGithubWorkflows || !client.fetchGithubWorkflowRuns) {
        setExtraCi((prev) => ({
          ...prev,
          [key]: {
            runs: [],
            workflows: [],
            overlay,
            error: "GitHub CI is not available in this host.",
            busy: false,
          },
        }));
        return;
      }
      const [wf, runs] = await Promise.all([
        client.fetchGithubWorkflows(cfg),
        client.fetchGithubWorkflowRuns(cfg),
      ]);
      setExtraCi((prev) => ({
        ...prev,
        [key]: {
          runs: runs.ok ? runs.runs : [],
          workflows: wf.ok ? wf.workflows : [],
          overlay,
          error: !wf.ok ? wf.error : !runs.ok ? runs.error : null,
          busy: false,
        },
      }));
    } catch (err: unknown) {
      setExtraCi((prev) => ({
        ...prev,
        [key]: {
          runs: prev[key]?.runs ?? [],
          workflows: prev[key]?.workflows ?? [],
          overlay: prev[key]?.overlay ?? null,
          error: err instanceof Error ? err.message : String(err),
          busy: false,
        },
      }));
    }
  };

  useEffect(() => {
    if (props.domainId !== "devops_platform" || !githubEnabled) return;
    for (const entry of extraRepos) {
      // Skip remotes that duplicate the primary Integrations owner/repo.
      if (
        entry.owner.toLowerCase() === primaryOwner.toLowerCase() &&
        entry.repo.toLowerCase() === primaryRepo.toLowerCase()
      ) {
        continue;
      }
      void refreshExtraRepo(entry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh on list/gate changes
  }, [
    props.domainId,
    githubEnabled,
    extraRepos,
    primaryOwner,
    primaryRepo,
    githubRefreshKey,
  ]);

  // After a local Analyze completes, refresh primary + remote Actions data.
  useEffect(() => {
    if (
      props.domainId !== "devops_platform" ||
      props.status !== "ready" ||
      !props.overlay
    ) {
      return;
    }
    setGithubRefreshKey((k) => k + 1);
  }, [props.domainId, props.status, props.overlay?.generatedAt]);


  const devopsDomainReport: DevopsDomainReport | null =
    liveDomainReport?.domain === "devops_platform" ? liveDomainReport : null;

  const activeDomainReport =
    liveDomainReport?.domain === props.domainId ? liveDomainReport : null;

  const findings = useMemo(() => {
    if (devopsDomainReport) return devopsDomainReport.findings;
    return buildDevopsFindings(overlay);
  }, [devopsDomainReport, overlay]);

  const kindCounts = useMemo(
    () => overlayKindCounts(nodes, devopsDomainReport?.kindCounts),
    [nodes, devopsDomainReport],
  );

  const ciNodes = useMemo(() => nodes.filter((n) => n.kind === "ci"), [nodes]);
  const iacNodes = useMemo(() => nodes.filter((n) => n.kind !== "ci"), [nodes]);
  const kindCount = (kind: string): number => kindCountOf(nodes, kind);

  const devopsTiles = useMemo(() => {
    if (devopsDomainReport) return devopsDomainReport.tiles;
    return buildDevopsTiles(nodes);
  }, [devopsDomainReport, nodes]);

  const filtered = useMemo(
    () => filterOverlayNodes(nodes, filter),
    [nodes, filter],
  );
  const surfaceRows = filtered.filter((n) => n.kind !== "ci");
  const surfaceTotal = iacNodes.length;
  const compCounts = kindCounts.filter(([k]) => k !== "ci");

  const tiles: Tile[] = [
    {
      label: "IaC Resources",
      value: devopsTiles?.iacResources ?? iacNodes.length,
      tip: DEVOPS_KPI_TIPS["IaC Resources"]!,
    },
    {
      label: "Pipelines",
      value: devopsTiles?.pipelines ?? ciNodes.length,
      tip: DEVOPS_KPI_TIPS.Pipelines!,
    },
    {
      label: "Containers",
      value: devopsTiles?.containers ?? kindCount("container"),
      tip: DEVOPS_KPI_TIPS.Containers!,
    },
    {
      label: "Kubernetes",
      value: devopsTiles?.kubernetes ?? kindCount("kubernetes"),
      tip: DEVOPS_KPI_TIPS.Kubernetes!,
    },
  ];

  const filteredRuns = useMemo(() => {
    if (!myTriggeredOnly) return remoteRuns;
    if (githubActor) {
      return remoteRuns.filter(
        (r) =>
          r.actorLogin !== null &&
          r.actorLogin.toLowerCase() === githubActor.toLowerCase(),
      );
    }
    return remoteRuns.filter((r) => r.event === "workflow_dispatch");
  }, [remoteRuns, myTriggeredOnly, githubActor]);


  /**
   * Trigger a GitHub Actions workflow_dispatch / repository_dispatch.
   * Uses numeric workflow id when known; falls back to basename. Owner/repo
   * come from the card (primary Integrations or an added remote).
   */
  const dispatchWorkflow = async (
    event: { readonly currentTarget: HTMLFormElement; preventDefault(): void },
    workflowPath: string,
    nodeId: string,
    kind: "workflow_dispatch" | "repository_dispatch",
    opts?: {
      owner?: string;
      repo?: string;
      token?: string;
      workflowId?: number;
      workflows?: readonly GithubWorkflowSummary[];
    },
  ): Promise<void> => {
    event.preventDefault();
    const owner = (opts?.owner ?? primaryOwner).trim();
    const repo = (opts?.repo ?? primaryRepo).trim();
    const token = (opts?.token ?? githubToken).trim();
    if (!owner || !repo) {
      setWfResult({
        id: nodeId,
        ok: false,
        msg: "Configure GitHub owner/repo under Integrations.",
      });
      return;
    }
    if (primaryRepoPrivate === true && !token && !opts?.token) {
      setWfResult({
        id: nodeId,
        ok: false,
        msg: "Private repo — add a GitHub token under Integrations to dispatch.",
      });
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const preferredRef = (props.branch ?? "main").trim() || "main";
    const workflows = opts?.workflows ?? remoteWorkflows;
    const workflowId =
      opts?.workflowId ?? matchRemoteWorkflowId(workflowPath, workflows);
    setWfBusy(nodeId);
    setWfResult(null);
    try {
      if (!client.dispatchGithubWorkflow) {
        setWfResult({
          id: nodeId,
          ok: false,
          msg: "GitHub dispatch is not available in this host.",
        });
        return;
      }
      if (kind === "workflow_dispatch") {
        const inputs: Record<string, string> = {};
        for (const [k, v] of data.entries()) {
          if (typeof v === "string" && v !== "") inputs[k] = v;
        }
        const result = await client.dispatchGithubWorkflow({
          owner,
          repo,
          ...(token ? { token } : {}),
          kind: "workflow_dispatch",
          ...(workflowId !== undefined ? { workflowId } : {}),
          workflowPath,
          ref: preferredRef,
          inputs,
        });
        if (!result.ok) {
          setWfResult({ id: nodeId, ok: false, msg: result.error });
          return;
        }
        setWfResult({
          id: nodeId,
          ok: true,
          msg: `Dispatched on ${result.ref}. Refreshing Active Pipelines…`,
        });
      } else {
        const eventType = String(data.get("__event_type") ?? "").trim();
        const result = await client.dispatchGithubWorkflow({
          owner,
          repo,
          ...(token ? { token } : {}),
          kind: "repository_dispatch",
          eventType: eventType || "prism-trigger",
        });
        if (!result.ok) {
          setWfResult({ id: nodeId, ok: false, msg: result.error });
          return;
        }
        setWfResult({
          id: nodeId,
          ok: true,
          msg: `Dispatched event on ${owner}/${repo}. Refreshing Active Pipelines…`,
        });
      }
      setGithubRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      setWfResult({
        id: nodeId,
        ok: false,
        msg: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setWfBusy(null);
    }
  };

  const onTestAddConnection = async (): Promise<void> => {
    setAddError(null);
    setAddOk(null);
    const parsed = parseGithubRepoRef(addUrl);
    if (!parsed) {
      setAddError("Enter a GitHub URL or owner/repo.");
      return;
    }
    if (!githubEnabled) {
      setAddError(
        "Enable Integrations · GitHub and Settings → Allow network integrations first.",
      );
      return;
    }
    setTestBusy(true);
    try {
      const token = githubToken.trim();
      if (!client.testGithubRepoConnection) {
        setAddError("GitHub CI is not available in this host.");
        return;
      }
      const result = await client.testGithubRepoConnection({
        owner: parsed.owner,
        repo: parsed.repo,
        ...(token ? { token } : {}),
      });
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      setAddOk(
        `Connected to ${result.repo.owner}/${result.repo.repo} (${result.workflows.length} workflow${result.workflows.length === 1 ? "" : "s"}, default branch ${result.repo.defaultBranch}).`,
      );
    } finally {
      setTestBusy(false);
    }
  };

  const onConfirmAddRepo = async (): Promise<void> => {
    setAddError(null);
    const parsed = parseGithubRepoRef(addUrl);
    if (!parsed) {
      setAddError("Enter a GitHub URL or owner/repo.");
      return;
    }
    if (
      parsed.owner.toLowerCase() === primaryOwner.toLowerCase() &&
      parsed.repo.toLowerCase() === primaryRepo.toLowerCase()
    ) {
      setAddError(
        "That repo is already the primary Integrations GitHub connection.",
      );
      return;
    }
    setAddBusy(true);
    try {
      const token = githubToken.trim() || undefined;
      if (!client.testGithubRepoConnection) {
        setAddError("GitHub CI is not available in this host.");
        return;
      }
      const test = await client.testGithubRepoConnection({
        owner: parsed.owner,
        repo: parsed.repo,
        ...(token ? { token } : {}),
      });
      if (!test.ok) {
        setAddError(test.error);
        return;
      }
      const next = upsertRemoteRepo({
        owner: parsed.owner,
        repo: parsed.repo,
      });
      setExtraRepos(next);
      setAddModalOpen(false);
      setAddUrl("");
      setAddOk(null);
      await refreshExtraRepo({
        owner: parsed.owner,
        repo: parsed.repo,
      });
    } finally {
      setAddBusy(false);
    }
  };


  const analyzeSteps = overlayAnalyzeSteps(def, {});

  return (
    <OverlayDomainFrame
      screen={props}
      def={def}
      subtitle={subtitle}
      overlay={overlay}
      status={status}
      analyzeSteps={analyzeSteps}
      extras={
        <>
      {addModalOpen ? (
        <div
          className="dna-modal-backdrop"
          role="presentation"
          onClick={() => setAddModalOpen(false)}
        >
          <div
            className="dna-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dm-add-repo-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dna-modal__head">
              <h2 id="dm-add-repo-title" className="dna-modal__title">
                Add Workflow from different Repo
              </h2>
              <button
                type="button"
                className="dna-modal__close"
                aria-label="Close"
                onClick={() => setAddModalOpen(false)}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="dna-modal__note">
              Prism stages DevOps files (workflows, Docker, k8s/helm/deploy)
              under <span className="ov-mono">.prism/remote-ci/</span> and lists
              live Actions runs — no full index of the foreign repo. Uses the
              token from Integrations · GitHub when present.
            </p>
            <label className="dm-pipe__field">
              <span className="dm-pipe__field-k">
                Repository URL or owner/repo
              </span>
              <Input
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                placeholder="https://github.com/org/repo or org/repo"
                aria-label="Repository URL"
              />
            </label>
            {addError ? <p className="dm-idle__err">{addError}</p> : null}
            {addOk ? <p className="dm-pipe__trigger-ok">{addOk}</p> : null}
            <div className="dna-modal__foot">
              <button
                type="button"
                className="ov-btn ov-btn--ghost"
                disabled={testBusy || addBusy}
                onClick={() => void onTestAddConnection()}
              >
                {testBusy ? "Testing…" : "Test connection"}
              </button>
              <button
                type="button"
                className="ov-btn ov-btn--primary"
                disabled={testBusy || addBusy}
                onClick={() => void onConfirmAddRepo()}
              >
                {addBusy ? "Adding…" : "Add repo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeConfirm ? (
        <div
          className="dna-modal-backdrop"
          role="presentation"
          onClick={() => setRemoveConfirm(null)}
        >
          <div
            className="dna-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dm-remove-repo-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dna-modal__head">
              <h2 id="dm-remove-repo-title" className="dna-modal__title">
                <AlertTriangle size={16} aria-hidden />
                Remove {removeConfirm.owner}/{removeConfirm.repo}?
              </h2>
              <button
                type="button"
                className="dna-modal__close"
                aria-label="Close"
                onClick={() => setRemoveConfirm(null)}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="dna-modal__note">
              This removes the repo from DevOps Pipelines in this workspace.
              Live run listings stop, and staged files under{" "}
              <span className="ov-mono">.prism/remote-ci/</span> for this repo
              are no longer shown. You can add it again anytime.
            </p>
            <div className="dna-modal__foot">
              <button
                type="button"
                className="ov-btn ov-btn--ghost"
                onClick={() => setRemoveConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ov-btn ov-btn--danger"
                onClick={() => {
                  const { owner, repo } = removeConfirm;
                  const key = `${owner}/${repo}`;
                  const next = removeRemoteRepo(owner, repo);
                  setExtraRepos(next);
                  setExtraCi((prev) => {
                    const copy = { ...prev };
                    delete copy[key];
                    return copy;
                  });
                  setRemoveConfirm(null);
                }}
              >
                Remove repo
              </button>
            </div>
          </div>
        </div>
      ) : null}

        </>
      }
      ready={
        overlay ? (
          <OverlayReadyView
            def={def}
            overlay={overlay}
            lastRunAt={lastRunAt}
            activeDomainReport={activeDomainReport}
            tiles={tiles}
            findings={findings}
            compCounts={compCounts}
            runbarTools={
              <span className="dm-runbar__tools">
                <button
                  type="button"
                  className="ov-btn ov-btn--secondary"
                  onClick={() => {
                    setAddModalOpen(true);
                    setAddError(null);
                    setAddOk(null);
                  }}
                  disabled={!githubEnabled}
                  title={
                    githubEnabled
                      ? "Add CI from another GitHub repository"
                      : "Connect GitHub + allow network first"
                  }
                >
                  <Plus size={12} aria-hidden />
                  Add Workflow from different Repo
                </button>
              </span>
            }
            surface={
              <OverlaySurfaceCard
                def={def}
                filter={filter}
                onFilter={setFilter}
                surfaceRows={surfaceRows}
                surfaceTotal={surfaceTotal}
                variant="generic"
              />
            }
            extras={
                  <>
                    <article className="ov-card card-span-all dm-ci-board">
                      <div className="ov-card__head">
                        <span className="ov-card__title">
                          <Workflow
                            size={14}
                            className="ov-card__icon"
                            aria-hidden
                          />
                          Pipelines by repo
                          <InfoTip label="Pipelines by repo">
                            Each accordion is one GitHub repo: Active Pipelines
                            (live runs) plus CI/CD workflows and triggers.
                          </InfoTip>
                        </span>
                        <span className="ov-card__meta">
                          {1 +
                            extraRepos.filter(
                              (r) =>
                                !(
                                  r.owner.toLowerCase() ===
                                    primaryOwner.toLowerCase() &&
                                  r.repo.toLowerCase() ===
                                    primaryRepo.toLowerCase()
                                ),
                            ).length}{" "}
                          repo
                          {1 +
                            extraRepos.filter(
                              (r) =>
                                !(
                                  r.owner.toLowerCase() ===
                                    primaryOwner.toLowerCase() &&
                                  r.repo.toLowerCase() ===
                                    primaryRepo.toLowerCase()
                                ),
                            ).length ===
                          1
                            ? ""
                            : "s"}
                        </span>
                      </div>
                      <div className="dm-ci-columns">
                        <details open className="dm-ci-accord">
                          <summary className="dm-ci-accord__summary">
                            <span className="dm-ci-accord__title ov-ellipsis">
                              {primaryOwner && primaryRepo
                                ? `${primaryOwner}/${primaryRepo}`
                                : props.repoLabel || "Current repo"}
                            </span>
                            <span className="dm-ci-accord__meta">
                              {filteredRuns.length} run
                              {filteredRuns.length === 1 ? "" : "s"} ·{" "}
                              {ciNodes.length} workflow
                              {ciNodes.length === 1 ? "" : "s"}
                            </span>
                          </summary>
                          <div className="dm-ci-accord__body dm-ci-accord__split">
                            <section className="dm-ci-section">
                              <h3 className="dm-ci-section__title">
                                <Activity size={13} aria-hidden />
                                Active Pipelines
                              </h3>
                              {githubEnabled ? (
                                <>
                                  <div className="dm-pipe__filter">
                                    <ToggleGroup
                                      aria-label="Pipeline filter"
                                      options={[
                                        { id: "all", label: "All runs" },
                                        { id: "mine", label: "My triggered" },
                                      ]}
                                      value={myTriggeredOnly ? "mine" : "all"}
                                      onChange={(id) =>
                                        setMyTriggeredOnly(id === "mine")
                                      }
                                    />
                                  </div>
                                  {githubError ? (
                                    <p className="dm-idle__err">
                                      {githubError}
                                    </p>
                                  ) : null}
                                  {filteredRuns.length > 0 ? (
                                    <PipelineRunsTable
                                      runs={filteredRuns.slice(0, 24)}
                                    />
                                  ) : (
                                    <EmptyState>
                                      {githubBusy
                                        ? "Fetching runs…"
                                        : myTriggeredOnly
                                          ? "No runs match the My triggered filter."
                                          : "No recent workflow runs returned."}
                                    </EmptyState>
                                  )}
                                </>
                              ) : (
                                <div className="dm-active">
                                  <Plug size={18} aria-hidden />
                                  <div>
                                    <p className="dm-active__title">
                                      Live runs need GitHub + network
                                    </p>
                                    <p className="dm-active__body">
                                      Enable Integrations · GitHub and Settings
                                      → Allow network integrations.
                                    </p>
                                    <button
                                      type="button"
                                      className="ov-btn ov-btn--ghost dm-active__cta"
                                      onClick={() =>
                                        props.onNavigate("integrations")
                                      }
                                    >
                                      <ExternalLink size={13} aria-hidden />
                                      Open Integrations
                                    </button>
                                  </div>
                                </div>
                              )}
                            </section>

                            <section className="dm-ci-section">
                              <h3 className="dm-ci-section__title">
                                <Workflow size={13} aria-hidden />
                                CI/CD Pipelines
                              </h3>
                              <div className="dm-pipes">
                                {ciNodes.map((n) => {
                                  const events = String(n.attrs?.events ?? "")
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                                  const jobs = String(n.attrs?.jobs ?? "")
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                                  const dispatchers = String(
                                    n.attrs?.dispatchers ?? "",
                                  )
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                                  const canTrigger =
                                    n.attrs?.canTrigger === true;
                                  const inputs = parseCiInputs(n.attrs);
                                  const dispatchTypes = String(
                                    n.attrs?.dispatchTypes ?? "",
                                  )
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                                  const hasWorkflowDispatch =
                                    dispatchers.includes("workflow_dispatch");
                                  const hasRepoDispatch = dispatchers.includes(
                                    "repository_dispatch",
                                  );
                                  const repoLabel =
                                    typeof n.attrs?.repo === "string" &&
                                    n.attrs.repo
                                      ? String(n.attrs.repo)
                                      : props.repoLabel;
                                  return (
                                    <div key={n.id} className="dm-pipe">
                                      <div className="dm-pipe__head">
                                        <span className="dm-pipe__name ov-ellipsis">
                                          {n.label}
                                        </span>
                                        <span className="dm-pipe__prov">
                                          GitHub · {repoLabel}
                                        </span>
                                      </div>
                                      <span
                                        className="dm-pipe__file ov-mono ov-ellipsis"
                                        title={nodePath(n.attrs)}
                                      >
                                        {nodePath(n.attrs)}
                                      </span>
                                      {events.length > 0 ? (
                                        <div className="dm-pipe__row">
                                          <span className="dm-pipe__k">on</span>
                                          <div className="dm-pipe__tags">
                                            {events.map((e) => (
                                              <span
                                                key={e}
                                                className={`dm-pipe__ev${
                                                  e === "workflow_dispatch" ||
                                                  e === "repository_dispatch"
                                                    ? " dm-pipe__ev--dispatch"
                                                    : ""
                                                }`}
                                              >
                                                {e}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                      {jobs.length > 0 ? (
                                        <div className="dm-pipe__row">
                                          <span className="dm-pipe__k">
                                            jobs
                                          </span>
                                          <div className="dm-pipe__tags">
                                            {jobs.map((j) => (
                                              <span
                                                key={j}
                                                className="dm-pipe__job"
                                              >
                                                {j}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                      <div className="dm-pipe__trigger">
                                        {canTrigger && hasWorkflowDispatch ? (
                                          <form
                                            onSubmit={(e) =>
                                              void dispatchWorkflow(
                                                e,
                                                nodePath(n.attrs),
                                                n.id,
                                                "workflow_dispatch",
                                              )
                                            }
                                          >
                                            <div className="dm-pipe__trigger-h">
                                              Trigger · workflow_dispatch
                                            </div>
                                            {inputs.length > 0 ? (
                                              <div className="dm-pipe__inputs">
                                                {inputs.map((inp) => (
                                                  <label
                                                    key={inp.name}
                                                    className="dm-pipe__field"
                                                  >
                                                    <span className="dm-pipe__field-k">
                                                      {inp.name}
                                                      {inp.required ? " *" : ""}
                                                    </span>
                                                    {inp.type === "boolean" ? (
                                                      <select
                                                        className="dm-pipe__ctrl"
                                                        name={inp.name}
                                                        disabled={
                                                          !triggersEnabled
                                                        }
                                                        defaultValue={
                                                          inp.default === "true"
                                                            ? "true"
                                                            : "false"
                                                        }
                                                        aria-label={inp.name}
                                                      >
                                                        <option value="false">
                                                          false
                                                        </option>
                                                        <option value="true">
                                                          true
                                                        </option>
                                                      </select>
                                                    ) : (
                                                      <input
                                                        className="dm-pipe__ctrl"
                                                        type="text"
                                                        name={inp.name}
                                                        disabled={
                                                          !triggersEnabled
                                                        }
                                                        defaultValue={
                                                          inp.default ?? ""
                                                        }
                                                        placeholder={
                                                          inp.default ??
                                                          inp.description ??
                                                          inp.type
                                                        }
                                                        aria-label={inp.name}
                                                      />
                                                    )}
                                                  </label>
                                                ))}
                                              </div>
                                            ) : (
                                              <p className="dm-pipe__trigger-note">
                                                No inputs declared — triggers
                                                as-is.
                                              </p>
                                            )}
                                            <button
                                              type="submit"
                                              className="ov-btn ov-btn--primary dm-pipe__run"
                                              disabled={
                                                !triggersEnabled ||
                                                wfBusy === n.id
                                              }
                                              title={
                                                triggersEnabled
                                                  ? "Dispatch this workflow on the current branch"
                                                  : primaryRepoPrivate ===
                                                        true && !githubToken
                                                    ? "Private repo — add a GitHub token under Integrations"
                                                    : "Connect GitHub under Integrations + allow network to trigger workflows"
                                              }
                                            >
                                              <Play size={13} aria-hidden />
                                              {wfBusy === n.id
                                                ? "Triggering…"
                                                : "Trigger workflow"}
                                            </button>
                                          </form>
                                        ) : null}
                                        {canTrigger && hasRepoDispatch ? (
                                          <form
                                            onSubmit={(e) =>
                                              void dispatchWorkflow(
                                                e,
                                                nodePath(n.attrs),
                                                n.id,
                                                "repository_dispatch",
                                              )
                                            }
                                          >
                                            <div className="dm-pipe__trigger-h">
                                              Trigger · repository_dispatch
                                            </div>
                                            {dispatchTypes.length > 0 ? (
                                              <label className="dm-pipe__field">
                                                <span className="dm-pipe__field-k">
                                                  event type
                                                </span>
                                                <select
                                                  className="dm-pipe__ctrl"
                                                  name="__event_type"
                                                  disabled={!triggersEnabled}
                                                  aria-label="repository_dispatch type"
                                                >
                                                  {dispatchTypes.map((t) => (
                                                    <option key={t} value={t}>
                                                      {t}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>
                                            ) : (
                                              <p className="dm-pipe__trigger-note">
                                                Accepts repository_dispatch
                                                events (types not declared).
                                              </p>
                                            )}
                                            <button
                                              type="submit"
                                              className="ov-btn ov-btn--ghost dm-pipe__run"
                                              disabled={
                                                !triggersEnabled ||
                                                wfBusy === n.id
                                              }
                                              title={
                                                triggersEnabled
                                                  ? "Send a repository_dispatch event"
                                                  : "Connect GitHub under Integrations + allow network to dispatch events"
                                              }
                                            >
                                              <Play size={13} aria-hidden />
                                              {wfBusy === n.id
                                                ? "Dispatching…"
                                                : "Dispatch event"}
                                            </button>
                                          </form>
                                        ) : null}
                                        {canTrigger && wfResult?.id === n.id ? (
                                          <p
                                            className={
                                              wfResult.ok
                                                ? "dm-pipe__trigger-ok"
                                                : "dm-idle__err"
                                            }
                                          >
                                            {wfResult.msg}
                                          </p>
                                        ) : null}
                                        {!canTrigger ? (
                                          <p className="dm-pipe__trigger-note">
                                            No manual dispatcher — runs on{" "}
                                            {events.length > 0
                                              ? events.join(", ")
                                              : "configured events"}
                                            . Add{" "}
                                            <span className="ov-mono">
                                              workflow_dispatch
                                            </span>{" "}
                                            to enable a Trigger form.
                                          </p>
                                        ) : null}
                                        {canTrigger && !triggersEnabled ? (
                                          <button
                                            type="button"
                                            className="dm-linkbtn"
                                            onClick={() =>
                                              props.onNavigate("integrations")
                                            }
                                          >
                                            <ExternalLink
                                              size={12}
                                              aria-hidden
                                            />
                                            {primaryRepoPrivate === true &&
                                            !githubToken
                                              ? "Add GitHub token in Integrations"
                                              : "Connect GitHub in Integrations"}
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}

                                {ciNodes.length === 0 ? (
                                  <EmptyState>
                                    No CI/CD workflows detected under
                                    .github/workflows.
                                  </EmptyState>
                                ) : null}
                              </div>
                            </section>
                          </div>
                        </details>

                        {extraRepos
                          .filter(
                            (r) =>
                              !(
                                r.owner.toLowerCase() ===
                                  primaryOwner.toLowerCase() &&
                                r.repo.toLowerCase() ===
                                  primaryRepo.toLowerCase()
                              ),
                          )
                          .map((entry) => {
                            const key = `${entry.owner}/${entry.repo}`;
                            const state = extraCi[key];
                            const runs = state?.runs ?? [];
                            const filteredExtraRuns = myTriggeredOnly
                              ? githubActor
                                ? runs.filter(
                                    (r) =>
                                      r.actorLogin !== null &&
                                      r.actorLogin.toLowerCase() ===
                                        githubActor.toLowerCase(),
                                  )
                                : runs.filter(
                                    (r) => r.event === "workflow_dispatch",
                                  )
                              : runs;
                            const remoteCiNodes =
                              state?.overlay?.graph.nodes.filter(
                                (n) => n.kind === "ci",
                              ) ?? [];
                            const entryToken = (
                              entry.token ?? githubToken
                            ).trim();
                            const entryTriggers =
                              githubEnabled &&
                              (entryToken !== "" ||
                                primaryRepoPrivate !== true);
                            const wfCount =
                              remoteCiNodes.length > 0
                                ? remoteCiNodes.length
                                : (state?.workflows.length ?? 0);
                            return (
                              <details
                                key={`ci:${key}`}
                                open
                                className="dm-ci-accord"
                              >
                                <summary className="dm-ci-accord__summary">
                                  <span className="dm-ci-accord__title ov-ellipsis">
                                    {entry.owner}/{entry.repo}
                                  </span>
                                  <span className="dm-ci-accord__meta">
                                    {filteredExtraRuns.length} run
                                    {filteredExtraRuns.length === 1 ? "" : "s"}{" "}
                                    · {wfCount} workflow
                                    {wfCount === 1 ? "" : "s"}
                                  </span>
                                </summary>
                                <div className="dm-ci-accord__body dm-ci-accord__split">
                                  <div className="dm-ci-accord__actions">
                                    <button
                                      type="button"
                                      className="dm-linkbtn"
                                      onClick={() =>
                                        void refreshExtraRepo(entry)
                                      }
                                      disabled={state?.busy === true}
                                    >
                                      <RefreshCw size={12} aria-hidden />
                                      {state?.busy ? "Refreshing…" : "Refresh"}
                                    </button>
                                    <button
                                      type="button"
                                      className="dm-linkbtn"
                                      onClick={() =>
                                        setRemoveConfirm({
                                          owner: entry.owner,
                                          repo: entry.repo,
                                        })
                                      }
                                    >
                                      <X size={12} aria-hidden />
                                      Remove
                                    </button>
                                  </div>

                                  <section className="dm-ci-section">
                                    <h3 className="dm-ci-section__title">
                                      <Activity size={13} aria-hidden />
                                      Active Pipelines
                                    </h3>
                                    <div className="dm-pipe__filter">
                                      <ToggleGroup
                                        aria-label={`Pipeline filter · ${entry.owner}/${entry.repo}`}
                                        options={[
                                          { id: "all", label: "All runs" },
                                          {
                                            id: "mine",
                                            label: "My triggered",
                                          },
                                        ]}
                                        value={myTriggeredOnly ? "mine" : "all"}
                                        onChange={(id) =>
                                          setMyTriggeredOnly(id === "mine")
                                        }
                                      />
                                    </div>
                                    {state?.error ? (
                                      <p className="dm-idle__err">
                                        {state.error}
                                      </p>
                                    ) : null}
                                    {filteredExtraRuns.length > 0 ? (
                                      <PipelineRunsTable
                                        runs={filteredExtraRuns.slice(0, 24)}
                                      />
                                    ) : (
                                      <EmptyState>
                                        {state?.busy
                                          ? "Fetching runs…"
                                          : myTriggeredOnly
                                            ? "No runs match the My triggered filter."
                                            : "No recent workflow runs returned."}
                                      </EmptyState>
                                    )}
                                  </section>

                                  <section className="dm-ci-section">
                                    <h3 className="dm-ci-section__title">
                                      <Workflow size={13} aria-hidden />
                                      CI/CD Pipelines
                                    </h3>
                                    <div className="dm-pipes">
                                      {remoteCiNodes.length > 0
                                        ? remoteCiNodes.map((n) => {
                                            const events = String(
                                              n.attrs?.events ?? "",
                                            )
                                              .split(",")
                                              .map((s) => s.trim())
                                              .filter(Boolean);
                                            const canTrigger =
                                              n.attrs?.canTrigger === true;
                                            const dispatchers = String(
                                              n.attrs?.dispatchers ?? "",
                                            )
                                              .split(",")
                                              .map((s) => s.trim())
                                              .filter(Boolean);
                                            const hasWorkflowDispatch =
                                              dispatchers.includes(
                                                "workflow_dispatch",
                                              );
                                            const path = nodePath(n.attrs);
                                            const wid = matchRemoteWorkflowId(
                                              path,
                                              state?.workflows ?? [],
                                            );
                                            return (
                                              <div
                                                key={`${key}:${n.id}`}
                                                className="dm-pipe"
                                              >
                                                <div className="dm-pipe__head">
                                                  <span className="dm-pipe__name ov-ellipsis">
                                                    {n.label}
                                                  </span>
                                                  <span className="dm-pipe__prov">
                                                    GitHub · {entry.owner}/
                                                    {entry.repo}
                                                  </span>
                                                </div>
                                                <span className="dm-pipe__file ov-mono ov-ellipsis">
                                                  {path}
                                                </span>
                                                {events.length > 0 ? (
                                                  <div className="dm-pipe__row">
                                                    <span className="dm-pipe__k">
                                                      on
                                                    </span>
                                                    <div className="dm-pipe__tags">
                                                      {events.map((e) => (
                                                        <span
                                                          key={e}
                                                          className="dm-pipe__ev"
                                                        >
                                                          {e}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  </div>
                                                ) : null}
                                                {canTrigger &&
                                                hasWorkflowDispatch ? (
                                                  <form
                                                    className="dm-pipe__trigger"
                                                    onSubmit={(e) =>
                                                      void dispatchWorkflow(
                                                        e,
                                                        path,
                                                        `${key}:${n.id}`,
                                                        "workflow_dispatch",
                                                        {
                                                          owner: entry.owner,
                                                          repo: entry.repo,
                                                          ...(entryToken
                                                            ? {
                                                                token:
                                                                  entryToken,
                                                              }
                                                            : {}),
                                                          ...(wid !== undefined
                                                            ? {
                                                                workflowId: wid,
                                                              }
                                                            : {}),
                                                          workflows:
                                                            state?.workflows ??
                                                            [],
                                                        },
                                                      )
                                                    }
                                                  >
                                                    <button
                                                      type="submit"
                                                      className="ov-btn ov-btn--primary dm-pipe__run"
                                                      disabled={
                                                        !entryTriggers ||
                                                        wfBusy ===
                                                          `${key}:${n.id}`
                                                      }
                                                    >
                                                      <Play
                                                        size={13}
                                                        aria-hidden
                                                      />
                                                      {wfBusy ===
                                                      `${key}:${n.id}`
                                                        ? "Triggering…"
                                                        : "Trigger workflow"}
                                                    </button>
                                                    {wfResult?.id ===
                                                    `${key}:${n.id}` ? (
                                                      <p
                                                        className={
                                                          wfResult.ok
                                                            ? "dm-pipe__trigger-ok"
                                                            : "dm-idle__err"
                                                        }
                                                      >
                                                        {wfResult.msg}
                                                      </p>
                                                    ) : null}
                                                  </form>
                                                ) : null}
                                              </div>
                                            );
                                          })
                                        : (state?.workflows ?? []).map((wf) => (
                                            <div
                                              key={`${key}:wf:${wf.id}`}
                                              className="dm-pipe"
                                            >
                                              <div className="dm-pipe__head">
                                                <span className="dm-pipe__name ov-ellipsis">
                                                  {wf.name}
                                                </span>
                                                <span className="dm-pipe__prov">
                                                  GitHub · {entry.owner}/
                                                  {entry.repo}
                                                </span>
                                              </div>
                                              <span className="dm-pipe__file ov-mono ov-ellipsis">
                                                {wf.path || wf.state}
                                              </span>
                                            </div>
                                          ))}
                                      {remoteCiNodes.length === 0 &&
                                      (state?.workflows.length ?? 0) === 0 ? (
                                        <EmptyState>
                                          {state?.busy
                                            ? "Staging DevOps files…"
                                            : "No workflows staged yet."}
                                        </EmptyState>
                                      ) : null}
                                    </div>
                                  </section>
                                </div>
                              </details>
                            );
                          })}
                      </div>
                      <p className="dm-note">
                        One accordion per repo. Inside each: Active Pipelines
                        and CI/CD triggers sit together side-by-side.
                      </p>
                    </article>

                    <p className="dm-note">
                      Argo CD and Jenkins connectors live under{" "}
                      <button
                        type="button"
                        className="dm-linkbtn"
                        onClick={() => props.onNavigate("integrations")}
                      >
                        Integrations
                      </button>{" "}
                      (roadmap pills until live).
                    </p>
                  </>

            }
          />
        ) : null
      }
    />
  );
}
