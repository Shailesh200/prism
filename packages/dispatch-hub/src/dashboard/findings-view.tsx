import { useEffect, useState, type ReactElement } from "react";
import { EmptyState } from "@repo-prism/ui";
import {
  formatPrismDate,
  jobNotePaths,
  MarkdownDoc,
  type JobSummary,
} from "@repo-prism/app-shell";
import { ArrowLeft } from "lucide-react";
import { findingWhenIso, findingsIndex } from "./findings.js";
import { findingsHash } from "./router.js";
import { getJson } from "./session.js";

type NoteFile = {
  readonly path: string;
  readonly text: string;
  readonly truncated?: boolean;
};

export function FindingsView(props: {
  readonly token: string;
  readonly jobs: readonly JobSummary[];
  readonly jobId?: string;
  readonly notePath?: string;
}): ReactElement {
  const listed = findingsIndex(props.jobs);
  const job =
    props.jobs.find((row) => row.id === props.jobId) ??
    listed.find((row) => row.id === props.jobId);
  const paths = job ? jobNotePaths(job) : [];
  const active =
    props.notePath && paths.includes(props.notePath)
      ? props.notePath
      : paths[0];

  if (!job) {
    return (
      <section className="console__panel">
        <p className="console__eyebrow">Dispatch</p>
        <h1 className="console__title">Findings</h1>
        <p className="console__lede">
          Full write-ups from finished jobs. Open one from a job summary, or
          pick it here.
        </p>
        {listed.length === 0 ? (
          <EmptyState>No job has left a write-up yet.</EmptyState>
        ) : (
          <ul className="findings-index">
            {listed.map((row) => {
              const first = jobNotePaths(row)[0];
              const when = findingWhenIso(row);
              const whenLabel = when ? formatPrismDate(when, "datetime") : "";
              return (
                <li key={`${row.workspacePath}:${row.id}`}>
                  <a
                    href={findingsHash({
                      job: row.id,
                      ...(first ? { note: first } : {}),
                      ...(row.workspacePath ? { repo: row.workspacePath } : {}),
                    })}
                  >
                    <span className="findings-index__row">
                      <strong>{row.title}</strong>
                      {when && whenLabel ? (
                        <time dateTime={when}>{whenLabel}</time>
                      ) : null}
                    </span>
                    <span className="findings-index__meta">
                      {row.workspaceLabel ?? row.workspacePath}
                    </span>
                    {first ? <code>{first}</code> : null}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <section className="console__panel findings-page">
      <header className="findings-page__head">
        <a className="findings-back" href={findingsHash()}>
          <ArrowLeft size={14} aria-hidden />
          Back
        </a>
        <h1 className="console__title">{job.title}</h1>
        <p className="console__lede">
          {job.workspaceLabel ?? job.workspacePath}
          {active ? (
            <>
              {" · "}
              <code>{active}</code>
            </>
          ) : null}
        </p>
      </header>
      {paths.length > 1 ? (
        <ul className="findings-files">
          {paths.map((path) => (
            <li key={path}>
              <a
                className={path === active ? "findings-files__on" : undefined}
                href={findingsHash({
                  job: job.id,
                  note: path,
                  ...(job.workspacePath ? { repo: job.workspacePath } : {}),
                })}
              >
                {path}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {active ? (
        <NoteBody
          token={props.token}
          jobId={job.id}
          workspace={job.workspacePath}
          path={active}
        />
      ) : (
        <EmptyState>This job did not leave a notes file.</EmptyState>
      )}
    </section>
  );
}

function NoteBody(props: {
  readonly token: string;
  readonly jobId: string;
  readonly workspace?: string;
  readonly path: string;
}): ReactElement {
  const [file, setFile] = useState<NoteFile | undefined>();
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams({ path: props.path });
    if (props.workspace) query.set("workspace", props.workspace);
    void getJson<NoteFile>(
      `/api/jobs/${encodeURIComponent(props.jobId)}/notes?${query}`,
      props.token,
    )
      .then((next) => {
        if (alive) {
          setFile(next);
          setError(undefined);
        }
      })
      .catch(() => {
        if (alive) {
          setFile(undefined);
          setError("Could not read that write-up.");
        }
      });
    return () => {
      alive = false;
    };
  }, [props.jobId, props.path, props.token, props.workspace]);
  if (error) return <EmptyState>{error}</EmptyState>;
  if (!file) return <p className="console__lede">Loading write-up…</p>;
  return (
    <article className="findings-doc">
      {file.truncated ? (
        <p className="console__lede">Showing the first part of a long file.</p>
      ) : null}
      <MarkdownDoc text={file.text} />
    </article>
  );
}
