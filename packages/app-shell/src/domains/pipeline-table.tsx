import { ExternalLink } from "lucide-react";
import { useState, type ReactElement } from "react";
import { Avatar } from "../Avatar.js";
import type { GithubWorkflowRun } from "../github-ci.js";

/** Readable status tag for GitHub Actions run status/conclusion. */
export function PipelineStatusTag(props: {
  status: string;
  conclusion: string | null;
}): ReactElement {
  const raw = ((props.conclusion ?? props.status) || "unknown").toLowerCase();
  const label = raw.replace(/_/g, " ");
  let tone: "ok" | "fail" | "cancel" | "progress" | "neutral" = "neutral";
  if (raw === "success") tone = "ok";
  else if (
    raw === "failure" ||
    raw === "timed_out" ||
    raw === "startup_failure" ||
    raw === "action_required"
  ) {
    tone = "fail";
  } else if (raw === "cancelled" || raw === "canceled" || raw === "skipped") {
    tone = "cancel";
  } else if (
    raw === "in_progress" ||
    raw === "queued" ||
    raw === "pending" ||
    raw === "waiting" ||
    raw === "requested" ||
    raw === "waiting_for_approval"
  ) {
    tone = "progress";
  }
  return (
    <span className={`dm-run-tag dm-run-tag--${tone}`} title={label}>
      {label}
    </span>
  );
}

/** Actor cell — GitHub avatar image (initials fallback). */
export function PipelineActor(props: {
  login: string | null;
  avatarUrl: string | null;
}): ReactElement {
  const [imgOk, setImgOk] = useState(true);
  if (!props.login) {
    return <span className="dm-pipe-actor dm-pipe-actor--empty">No actor</span>;
  }
  const showImg = Boolean(props.avatarUrl) && imgOk;
  return (
    <span className="dm-pipe-actor" title={`@${props.login}`}>
      {showImg ? (
        <img
          className="dm-pipe-actor__img"
          src={props.avatarUrl ?? undefined}
          alt=""
          width={24}
          height={24}
          onError={() => setImgOk(false)}
        />
      ) : (
        <Avatar name={props.login} size={24} />
      )}
    </span>
  );
}

/** Full-width Active Pipelines table. */
export function PipelineRunsTable(props: {
  runs: readonly GithubWorkflowRun[];
}): ReactElement {
  return (
    <div className="dm-pipe-table-wrap">
      <table className="dm-pipe-table">
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Run</th>
            <th scope="col">Branch</th>
            <th scope="col">Event</th>
            <th scope="col" className="dm-pipe-table__actor-h">
              Actor
            </th>
          </tr>
        </thead>
        <tbody>
          {props.runs.map((run) => {
            const title = run.displayTitle || run.name;
            return (
              <tr key={run.id}>
                <td>
                  <PipelineStatusTag
                    status={run.status}
                    conclusion={run.conclusion}
                  />
                </td>
                <td>
                  {run.htmlUrl ? (
                    <a
                      className="dm-pipe-table__link"
                      href={run.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`Open run on GitHub · ${title}`}
                    >
                      <span className="dm-pipe-table__name ov-ellipsis">
                        {title}
                      </span>
                      <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : (
                    <span className="dm-pipe-table__name ov-ellipsis">
                      {title}
                    </span>
                  )}
                </td>
                <td>
                  <span className="dm-pipe-table__branch ov-mono">
                    {run.headBranch || "—"}
                  </span>
                </td>
                <td>
                  <span className="dm-pipe-table__event ov-mono">
                    {run.event || "—"}
                  </span>
                </td>
                <td className="dm-pipe-table__actor">
                  <PipelineActor
                    login={run.actorLogin}
                    avatarUrl={run.actorAvatarUrl}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
