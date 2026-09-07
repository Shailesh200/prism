import { Button } from "@repo-prism/ui";
import { ChevronDown, ChevronRight, Copy, Pause, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { MarkdownDoc } from "./MarkdownDoc.js";
import {
  coalesceThinkingEntries,
  isModelSpeech,
} from "./job-console-coalesce.js";
import type { JobConsoleEntry, JobRunPhase } from "./jobs-types.js";

export type JobConsoleProps = {
  readonly entries: readonly JobConsoleEntry[];
  /** True while the job can still produce output. */
  readonly live: boolean;
  readonly loading?: boolean;
  readonly error?: string | undefined;
  /**
   * How many lines the job actually produced, and whether the host dropped
   * some. A console that quietly shows the last N lines looks like a complete
   * record of a short job — the bounded-list envelope already discloses this
   * for Intelligence tools, and the jobs surface owes the same (ADR-0048).
   */
  readonly totalCount?: number;
  readonly truncated?: boolean;
  /** Start collapsed. Live jobs stay open so new output is visible. */
  readonly defaultExpanded?: boolean;
};

type PhaseFilter = "all" | "thinking" | "tool" | "editing" | "errors";

const FILTERS: readonly { id: PhaseFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "thinking", label: "Thinking" },
  { id: "tool", label: "Tools" },
  { id: "editing", label: "Edits" },
  { id: "errors", label: "Errors" },
];

function matchesFilter(entry: JobConsoleEntry, filter: PhaseFilter): boolean {
  if (filter === "all") return true;
  if (filter === "errors") return entry.level === "error";
  return entry.phase === (filter as JobRunPhase);
}

function timeLabel(ts: string): string {
  const parsed = Date.parse(ts);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * What the console says about lines it is not showing.
 *
 * Returns undefined when everything the job produced is on screen — there is
 * no note to make, and adding one would be noise.
 */
export function consoleNote(
  page: {
    entries: readonly unknown[];
    totalCount?: number;
    truncated?: boolean;
  },
  shown: number,
  filtered: boolean,
): string | undefined {
  const held = page.entries.length;
  const total = page.totalCount;
  const parts: string[] = [];
  if (page.truncated && total !== undefined && total > held) {
    parts.push(`Showing the last ${held} of ${total} lines.`);
  } else if (page.truncated) {
    parts.push("Earlier lines were dropped.");
  }
  if (filtered && shown < held) {
    parts.push(`${shown} of ${held} match this filter.`);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/**
 * Terminal-style view of one job's activity.
 *
 * Follow is sticky rather than forced: scrolling up to read something must not
 * be yanked back by the next line, so follow turns itself off when the user
 * leaves the bottom and back on when they return.
 */
export function JobConsole(props: JobConsoleProps): ReactElement {
  const [filter, setFilter] = useState<PhaseFilter>("all");
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(props.defaultExpanded ?? true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const coalesced = useMemo(
    () => coalesceThinkingEntries(props.entries),
    [props.entries],
  );
  const visible = useMemo(
    () => coalesced.filter((entry) => matchesFilter(entry, filter)),
    [coalesced, filter],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setFollow(atBottom);
  }, []);

  useLayoutEffect(() => {
    if (!follow) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible, follow]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyAll = useCallback(() => {
    const text = visible
      .map((entry) => `${timeLabel(entry.ts)} ${entry.phase} ${entry.text}`)
      .join("\n");
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }, [visible]);

  const note = consoleNote(
    {
      entries: coalesced,
      ...(props.totalCount !== undefined
        ? { totalCount: props.totalCount }
        : {}),
      ...(props.truncated !== undefined ? { truncated: props.truncated } : {}),
    },
    visible.length,
    filter !== "all",
  );

  return (
    <div className={`job-console${expanded ? "" : " job-console--collapsed"}`}>
      <div className="job-console__bar">
        <Button
          type="button"
          variant="tertiary"
          className="job-console__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <ChevronDown size={14} aria-hidden />
          ) : (
            <ChevronRight size={14} aria-hidden />
          )}
          Console
          {coalesced.length > 0 ? (
            <span className="job-console__count">{coalesced.length}</span>
          ) : null}
        </Button>
        {expanded ? (
          <>
            <div
              className="job-console__filters"
              role="group"
              aria-label="Filter console"
            >
              {FILTERS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant="tertiary"
                  className="job-console__filter"
                  aria-pressed={filter === option.id}
                  onClick={() => setFilter(option.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="job-console__actions">
              {props.live ? (
                <Button
                  type="button"
                  variant="tertiary"
                  className="job-console__action"
                  aria-pressed={follow}
                  onClick={() => setFollow((value) => !value)}
                  title={follow ? "Pause auto-scroll" : "Follow new output"}
                >
                  {follow ? (
                    <Pause size={13} aria-hidden />
                  ) : (
                    <Play size={13} aria-hidden />
                  )}
                  {follow ? "Following" : "Paused"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="tertiary"
                className="job-console__action"
                onClick={copyAll}
                disabled={visible.length === 0}
              >
                <Copy size={13} aria-hidden />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </>
        ) : null}
      </div>

      {expanded ? (
        <>
          <div
            className="job-console__scroll"
            ref={scrollRef}
            onScroll={onScroll}
            role="log"
            aria-live={props.live && follow ? "polite" : "off"}
            aria-label="Job console output"
            tabIndex={0}
          >
            {props.error ? (
              <p className="job-console__empty job-console__empty--error">
                {props.error}
              </p>
            ) : visible.length === 0 ? (
              <p className="job-console__empty">
                {props.loading
                  ? "Loading console…"
                  : props.entries.length === 0
                    ? props.live
                      ? "Waiting for the teammate's first output…"
                      : "This job produced no console output."
                    : "No lines match this filter."}
              </p>
            ) : (
              <ol className="job-console__lines">
                {visible.map((entry, index) => {
                  const streaming =
                    props.live &&
                    index === visible.length - 1 &&
                    isModelSpeech(entry);
                  return (
                    <li
                      key={`${entry.ts}-${index}`}
                      className={`job-console__line job-console__line--${entry.level} job-console__line--${entry.phase}`}
                    >
                      <div className="job-console__meta">
                        <span className="job-console__time">
                          {timeLabel(entry.ts)}
                        </span>
                        <span
                          className={`job-console__phase job-console__phase--${entry.phase}`}
                        >
                          {entry.tool ?? entry.phase}
                        </span>
                      </div>
                      {streaming ? (
                        <p className="job-console__text job-console__text--stream">
                          {entry.text}
                          <span className="job-console__caret" aria-hidden />
                        </p>
                      ) : (
                        <MarkdownDoc
                          className="job-console__text"
                          text={entry.text}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Two different truncations can bite: the host capping its page, and
          this component capping its buffer. Both are stated, and the filter is
          named separately so "42 of 900" is never read as data loss. */}
          {note ? <p className="job-console__note">{note}</p> : null}

          {props.live && !follow && visible.length > 0 ? (
            <Button
              type="button"
              variant="tertiary"
              className="job-console__jump"
              onClick={() => setFollow(true)}
            >
              Jump to latest
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
