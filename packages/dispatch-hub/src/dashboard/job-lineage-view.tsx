import {
  jobBadgePulse,
  jobDisplayLabel,
  jobOriginLabel,
  type JobSummary,
} from "@repo-prism/app-shell";
import { Badge } from "@repo-prism/ui";
import { AlertTriangle, Check, X } from "lucide-react";
import { type ReactElement } from "react";
import { jobMeterBadgeTone } from "./fleet.js";
import {
  jobsRelatedTo,
  lineageDotKind,
  lineageRoot,
  lineageSummary,
  lineageTree,
  type JobLineageNode,
} from "./job-lineage.js";

export function JobLineage(props: {
  readonly job: JobSummary;
  readonly jobs: readonly JobSummary[];
  readonly onOpen: (job: JobSummary) => void;
}): ReactElement | null {
  const related = jobsRelatedTo(props.jobs, props.job);
  if (related.length <= 1) return null;
  const root = lineageRoot(related, props.job);
  const tree = lineageTree(related, root);
  return (
    <nav className="job-lineage" aria-label="Parent and child jobs">
      <p className="job-lineage__label">
        Related jobs
        <span className="job-lineage__count">
          {" "}
          · {related.length} {related.length === 1 ? "job" : "jobs"}
        </span>
      </p>
      <LineageList
        node={tree}
        currentId={props.job.id}
        onOpen={props.onOpen}
        depth={0}
      />
    </nav>
  );
}

function LineageList(props: {
  readonly node: JobLineageNode;
  readonly currentId: string;
  readonly onOpen: (job: JobSummary) => void;
  readonly depth: number;
}): ReactElement {
  const job = props.node.job;
  const current = job.id === props.currentId;
  const origin = jobOriginLabel(job.origin);
  const tone = jobMeterBadgeTone(job, Date.now());
  const kind = lineageDotKind(job.status);
  const label = lineageSummary(job);
  const body = (
    <>
      <span
        className={`job-lineage__dot job-lineage__dot--${tone}`}
        aria-hidden
      >
        {kind === "check" ? (
          <Check size={12} strokeWidth={3} />
        ) : kind === "x" ? (
          <X size={12} strokeWidth={3} />
        ) : kind === "alert" ? (
          <AlertTriangle size={12} strokeWidth={3} />
        ) : null}
      </span>
      <span className="job-lineage__title">{job.title}</span>
      {current ? <span className="job-lineage__you">You</span> : null}
      {origin ? <span className="job-lineage__origin">{origin}</span> : null}
      <Badge
        tone={tone}
        pulse={jobBadgePulse(job.status)}
        className="job-lineage__status"
      >
        {jobDisplayLabel(job)}
      </Badge>
    </>
  );
  return (
    <div className="job-lineage__branch" data-depth={props.depth}>
      {current ? (
        <span
          className="job-lineage__row job-lineage__row--current"
          aria-current="true"
          aria-label={label}
        >
          {body}
        </span>
      ) : (
        <button
          type="button"
          className="job-lineage__row"
          aria-label={label}
          onClick={() => props.onOpen(job)}
        >
          {body}
        </button>
      )}
      {props.node.children.length > 0 ? (
        <ul className="job-lineage__children">
          {props.node.children.map((child) => (
            <li key={child.job.id}>
              <LineageList
                node={child}
                currentId={props.currentId}
                onOpen={props.onOpen}
                depth={props.depth + 1}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
