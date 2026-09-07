import { jobOriginLabel, type JobSummary } from "@repo-prism/app-shell";
import { Badge, Button } from "@repo-prism/ui";
import { type ReactElement } from "react";
import {
  jobsRelatedTo,
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
      <p className="job-lineage__label">Related jobs</p>
      <LineageList node={tree} currentId={props.job.id} onOpen={props.onOpen} />
    </nav>
  );
}

function LineageList(props: {
  readonly node: JobLineageNode;
  readonly currentId: string;
  readonly onOpen: (job: JobSummary) => void;
}): ReactElement {
  const current = props.node.job.id === props.currentId;
  const origin = jobOriginLabel(props.node.job.origin);
  return (
    <div className="job-lineage__node">
      {current ? (
        <span className="job-lineage__current">
          {lineageSummary(props.node.job)}
          {origin ? (
            <Badge tone="neutral" className="job-lineage__origin">
              {origin}
            </Badge>
          ) : null}
        </span>
      ) : (
        <Button
          size="sm"
          variant="tertiary"
          className="job-lineage__open"
          onClick={() => props.onOpen(props.node.job)}
        >
          {lineageSummary(props.node.job)}
          {origin ? ` · ${origin}` : ""}
        </Button>
      )}
      {props.node.children.length > 0 ? (
        <ul className="job-lineage__children">
          {props.node.children.map((child) => (
            <li key={child.job.id}>
              <LineageList
                node={child}
                currentId={props.currentId}
                onOpen={props.onOpen}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
