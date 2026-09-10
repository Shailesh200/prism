import { Button } from "@repo-prism/ui";
import type { JobWorkspaceChip } from "@repo-prism/app-shell";
import { RepoSelect } from "./repo-select.js";
import type { ReactElement } from "react";

export function WakeView(props: {
  readonly token: string;
  readonly repos: readonly JobWorkspaceChip[];
  readonly repoFilter?: string;
  readonly consoleUrl: string;
  readonly playgroundUrl: string;
  readonly onRepoFilter: (path: string) => void;
  readonly onOpenConsole: () => void;
}): ReactElement {
  return (
    <div className="wake-layout">
      <h1>Prism is awake</h1>
      <p className="console__lede">
        Console and Playground are on this machine. The repo you pick retargets
        both.
      </p>
      {props.repos.length > 0 ? (
        <RepoSelect
          token={props.token}
          aria-label="Repository"
          value={props.repoFilter ?? props.repos[0]?.path ?? "all"}
          onChange={props.onRepoFilter}
          repos={props.repos}
          includeAll
          jobsOnly={false}
        />
      ) : null}
      <div className="wake-doors">
        <article className="wake-door">
          <h2>Console</h2>
          <p>Dispatch jobs</p>
          <code>{props.consoleUrl}</code>
          <div className="wake-door__actions">
            <Button variant="primary" onClick={props.onOpenConsole}>
              Open Console
            </Button>
          </div>
        </article>
        <article className="wake-door">
          <h2>Playground</h2>
          <p>Maps, DNA, blast radius for the selected repo</p>
          <code>{props.playgroundUrl}</code>
          <div className="wake-door__actions">
            <Button
              variant="primary"
              onClick={() => window.open(props.playgroundUrl, "_blank")}
            >
              Open Playground
            </Button>
          </div>
        </article>
      </div>
      <p className="console__lede">
        Playground follows the repo you pick here. Sleep parks both; wake starts
        both.
      </p>
    </div>
  );
}
