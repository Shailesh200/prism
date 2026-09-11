import {
  PrismWakeScreen,
  probeSurfaceAwake,
  type JobWorkspaceChip,
} from "@repo-prism/app-shell";
import { FolderOpen } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { RepoSelect } from "./repo-select.js";
import { getJson } from "./session.js";

export function WakeView(props: {
  readonly token: string;
  readonly repos: readonly JobWorkspaceChip[];
  readonly repoFilter?: string;
  readonly playgroundUrl: string;
  readonly onRepoFilter: (path: string) => void;
  readonly onOpenDispatch: () => void;
  readonly onClose: () => void;
}): ReactElement {
  const value = props.repoFilter ?? props.repos[0]?.path ?? "all";
  const selected =
    props.repos.find((repo) => repo.path === value)?.label ??
    (value !== "all" ? value : null);
  const spectrumBlurb = selected
    ? `Maps, DNA, blast radius for ${selected}.`
    : "Maps, DNA, blast radius for the repo you pick.";
  const [spectrumLive, setSpectrumLive] = useState<boolean | undefined>();

  useEffect(() => {
    let alive = true;
    const probe = async (): Promise<void> => {
      const fromHealth = await getJson<{
        playground?: { url?: string; live?: boolean };
      }>("/api/healthz", props.token)
        .then((body) => body.playground)
        .catch(() => undefined);
      let live = fromHealth?.live;
      if (live === undefined) {
        live = await probeSurfaceAwake(fromHealth?.url ?? props.playgroundUrl);
      }
      if (alive) setSpectrumLive(live);
    };
    void probe();
    const id = window.setInterval(() => void probe(), 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [props.playgroundUrl, props.token]);

  return (
    <PrismWakeScreen
      here="dispatch"
      dispatchLive={true}
      spectrumLive={spectrumLive}
      spectrumBlurb={spectrumBlurb}
      onOpenDispatch={props.onOpenDispatch}
      onOpenSpectrum={() => window.open(props.playgroundUrl, "_blank")}
      onClose={props.onClose}
    >
      {props.repos.length > 0 ? (
        <div className="wake-repo">
          <RepoSelect
            token={props.token}
            label="Active repository"
            aria-label="Repository"
            value={value}
            onChange={props.onRepoFilter}
            repos={props.repos}
            includeAll
            jobsOnly={false}
            icon={<FolderOpen size={18} aria-hidden />}
          />
        </div>
      ) : null}
    </PrismWakeScreen>
  );
}
