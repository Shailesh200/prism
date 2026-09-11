import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  Button,
  CUSTOM_RANGE_PRESET,
  DateRangePicker,
  EmptyState,
  SearchableInput,
  isActivateTarget,
  listCursorDelta,
  pageShortcutBlocked,
  type DateRangeValue,
} from "@repo-prism/ui";
import {
  formatPrismDate,
  jobNotePaths,
  MarkdownDoc,
  type JobSummary,
  type JobWorkspaceChip,
} from "@repo-prism/app-shell";
import { ArrowLeft } from "lucide-react";
import { findingWhenIso, findingsIndex, findingsInView } from "./findings.js";
import {
  FLEET_RANGE_PRESETS,
  FLEET_RANGES,
  earliestJobStartMs,
  selectedRangeWindow,
  type FleetRange,
  type TimeWindow,
} from "./fleet.js";
import { findingsHash } from "./router.js";
import { RepoSelect } from "./repo-select.js";
import { getJson } from "./session.js";

type NoteFile = {
  readonly path: string;
  readonly text: string;
  readonly truncated?: boolean;
};

export function FindingsView(props: {
  readonly token: string;
  readonly jobs: readonly JobSummary[];
  readonly repos?: readonly JobWorkspaceChip[];
  readonly jobId?: string;
  readonly notePath?: string;
  readonly onHandOff?: (job: JobSummary, text: string) => void;
}): ReactElement {
  const [filter, setFilter] = useState("");
  const [repo, setRepo] = useState("all");
  const [range, setRange] = useState<FleetRange>("all");
  const [customWindow, setCustomWindow] = useState<TimeWindow | undefined>();
  const [nowMs] = useState(() => Date.now());
  const [cursor, setCursor] = useState(0);
  const filterRef = useRef<HTMLInputElement | null>(null);
  const timeWindow = customWindow ?? selectedRangeWindow(range, nowMs);
  const firstJobMs = earliestJobStartMs(props.jobs, nowMs);
  const rangeValue: DateRangeValue = {
    preset: customWindow ? CUSTOM_RANGE_PRESET : range,
    startMs: timeWindow.startMs,
    endMs: Number.isFinite(timeWindow.endMs) ? timeWindow.endMs : nowMs,
  };
  const allFindings = useMemo(() => findingsIndex(props.jobs), [props.jobs]);
  const listed = useMemo(
    () =>
      findingsInView(props.jobs, { filter, repo, range: timeWindow, nowMs }),
    [props.jobs, filter, repo, timeWindow, nowMs],
  );
  const findingRepos = useMemo(
    () =>
      (props.repos ?? []).map((row) => ({
        path: row.path,
        label: row.label,
        jobCount: allFindings.filter((job) => job.workspacePath === row.path)
          .length,
      })),
    [props.repos, allFindings],
  );
  const job =
    props.jobs.find((row) => row.id === props.jobId) ??
    listed.find((row) => row.id === props.jobId);
  const paths = job ? jobNotePaths(job) : [];
  const active =
    props.notePath && paths.includes(props.notePath)
      ? props.notePath
      : paths[0];

  useEffect(() => {
    if (job) return;
    const onKey = (event: KeyboardEvent): void => {
      if (pageShortcutBlocked(event)) return;
      if (event.key === "/") {
        event.preventDefault();
        filterRef.current?.focus();
        return;
      }
      const delta = listCursorDelta(event.key);
      if (delta !== 0) {
        event.preventDefault();
        setCursor((index) =>
          Math.min(listed.length - 1, Math.max(0, index + delta)),
        );
        return;
      }
      if (event.key === "Enter") {
        if (isActivateTarget(event.target)) return;
        const row = listed[cursor];
        if (!row) return;
        event.preventDefault();
        window.location.hash = findingsHash({
          job: row.id,
          ...(jobNotePaths(row)[0] ? { note: jobNotePaths(row)[0] } : {}),
          ...(row.workspacePath ? { repo: row.workspacePath } : {}),
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, job, listed]);

  if (!job) {
    return (
      <section className="console__panel">
        <p className="console__eyebrow">Dispatch</p>
        <h1 className="console__title">Findings</h1>
        <p className="console__lede">
          Full write-ups from finished jobs. Open one from a job summary, or
          pick it here.
        </p>
        <div className="fleet-toolbar findings-toolbar">
          <SearchableInput
            ref={filterRef}
            className="fleet-toolbar__filter"
            placeholder="Filter findings"
            value={filter}
            onChange={setFilter}
            aria-label="Filter findings"
          />
          <div className="fleet-toolbar__end">
            <DateRangePicker
              aria-label="Time range"
              className="fleet-toolbar__range-select"
              presets={FLEET_RANGE_PRESETS}
              value={rangeValue}
              nowMs={nowMs}
              {...(firstJobMs !== undefined ? { minMs: firstJobMs } : {})}
              presetWindow={(id, now) =>
                selectedRangeWindow(
                  (FLEET_RANGES.includes(id as FleetRange)
                    ? id
                    : "all") as FleetRange,
                  now,
                )
              }
              onChange={(next) => {
                if (
                  next.preset === CUSTOM_RANGE_PRESET ||
                  !FLEET_RANGES.includes(next.preset as FleetRange)
                ) {
                  setCustomWindow({
                    startMs: next.startMs,
                    endMs: next.endMs,
                  });
                  return;
                }
                setRange(next.preset as FleetRange);
                setCustomWindow(undefined);
              }}
            />
            <RepoSelect
              token={props.token}
              aria-label="Filter by repository"
              className="fleet-toolbar__repo-select"
              value={repo}
              onChange={setRepo}
              includeAll
              jobsOnly={false}
              repos={findingRepos}
            />
          </div>
        </div>
        {allFindings.length === 0 ? (
          <EmptyState>No job has left a write-up yet.</EmptyState>
        ) : listed.length === 0 ? (
          <EmptyState>No findings match these filters.</EmptyState>
        ) : (
          <ul className="findings-index">
            {listed.map((row, index) => {
              const first = jobNotePaths(row)[0];
              const when = findingWhenIso(row);
              const whenLabel = when ? formatPrismDate(when, "datetime") : "";
              return (
                <li key={`${row.workspacePath}:${row.id}`}>
                  <a
                    className={
                      index === cursor ? "findings-index__on" : undefined
                    }
                    aria-current={index === cursor ? "true" : undefined}
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
        {props.onHandOff ? (
          <Button
            variant="secondary"
            onClick={() =>
              props.onHandOff?.(
                job,
                [job.title, job.resultSummary, ...(job.notes ?? [])]
                  .filter(Boolean)
                  .join("\n"),
              )
            }
          >
            Hand to a teammate
          </Button>
        ) : null}
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
