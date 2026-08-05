import { SearchableInput, Select } from "@repo-prism/ui";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Lock,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import {
  AUDIT_CATEGORIES,
  clearAuditLog,
  formatAuditDate,
  formatAuditTime,
  formatDuration,
  getAuditEntries,
  relativeAuditTime,
  subscribeAudit,
  type AuditCategory,
  type AuditEntry,
  type AuditStatus,
} from "./audit-log.js";

export type AuditLogsPanelProps = {
  repoLabel: string;
  root?: string | undefined;
  /** When opening from DNA "Check logs", pre-select this category filter. */
  initialCategory?: AuditCategory | "all";
};

type CategoryFilter = AuditCategory | "all";
type StatusFilter = AuditStatus | "all";

function useAuditEntries(): readonly AuditEntry[] {
  return useSyncExternalStore(subscribeAudit, getAuditEntries, getAuditEntries);
}

export function AuditLogsPanel(props: AuditLogsPanelProps): ReactElement {
  const entries = useAuditEntries();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>(
    props.initialCategory ?? "all",
  );
  const [status, setStatus] = useState<StatusFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (props.initialCategory) setCategory(props.initialCategory);
  }, [props.initialCategory]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (status !== "all" && e.status !== status) return false;
      if (!q) return true;
      const hay = [
        e.operation,
        e.target,
        e.command ?? "",
        e.output ?? "",
        e.category,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, query, category, status]);

  const onExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      workspace: props.root ?? props.repoLabel,
      note: "Session-local playground audit log — never uploaded.",
      entries: filtered,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prism-audit-${props.repoLabel.replace(/\W+/g, "-")}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="al">
      <div className="al-head">
        <div>
          <div className="al-crumb">
            <span>Settings</span>
            <ChevronRight size={14} aria-hidden />
            <span className="al-crumb__here">Audit Logs</span>
          </div>
          <h2 className="al-title">Audit Logs</h2>
          <p className="al-sub">
            Everything Prism did on this workspace in this browser session —
            local, transparent.
          </p>
        </div>
        <div className="al-head__actions">
          <button
            type="button"
            className="ov-btn ov-btn--ghost"
            onClick={clearAuditLog}
            disabled={entries.length === 0}
          >
            <Trash2 size={14} aria-hidden />
            Clear
          </button>
          <button
            type="button"
            className="ov-btn ov-btn--ghost"
            onClick={onExport}
            disabled={filtered.length === 0}
          >
            <Download size={14} aria-hidden />
            Export Log (JSON)
          </button>
        </div>
      </div>

      <div className="al-filters">
        <SearchableInput
          className="al-search"
          value={query}
          onChange={setQuery}
          placeholder="Filter logs…"
          spellCheck={false}
          aria-label="Filter audit logs"
        />
        <div className="al-chips" role="group" aria-label="Category">
          {AUDIT_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="al-chip"
              data-active={category === c.id ? "true" : "false"}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Select
          className="al-status"
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          aria-label="Status filter"
          options={[
            { value: "all", label: "All Statuses" },
            { value: "success", label: "Success" },
            { value: "warning", label: "Warning" },
            { value: "error", label: "Error" },
          ]}
        />
      </div>

      <div className="al-table">
        <div className="al-table__head" aria-hidden>
          <span>Time</span>
          <span>Category</span>
          <span>Operation</span>
          <span>Target</span>
          <span className="al-table__num">Duration</span>
          <span className="al-table__center">Status</span>
        </div>

        {filtered.length === 0 ? (
          <div className="al-empty">
            {entries.length === 0
              ? "No operations recorded yet. Indexing, health, git, domain overlays, and blast radius calls appear here as you use Prism."
              : "No entries match the current filters."}
          </div>
        ) : (
          <ul className="al-rows">
            {filtered.map((entry) => {
              const open = openId === entry.id;
              const expandable =
                Boolean(entry.command) ||
                Boolean(entry.output) ||
                (entry.diagnostics?.length ?? 0) > 0;
              return (
                <li
                  key={entry.id}
                  className="al-row"
                  data-open={open ? "true" : "false"}
                >
                  <button
                    type="button"
                    className="al-row__main"
                    disabled={!expandable}
                    aria-expanded={expandable ? open : undefined}
                    onClick={() => {
                      if (!expandable) return;
                      setOpenId(open ? null : entry.id);
                    }}
                  >
                    <span
                      className="al-row__time"
                      title={new Date(entry.at).toLocaleString()}
                    >
                      {expandable ? (
                        <ChevronRight
                          size={14}
                          aria-hidden
                          className="al-row__chev"
                          data-open={open ? "true" : "false"}
                        />
                      ) : (
                        <span className="al-row__chev-spacer" />
                      )}
                      <span className="al-row__date">
                        {formatAuditDate(entry.at)}
                      </span>
                      <span>{formatAuditTime(entry.at)}</span>
                      <span className="al-row__rel">
                        {relativeAuditTime(entry.at)}
                      </span>
                    </span>
                    <span>
                      <span className="al-cat" data-category={entry.category}>
                        {entry.category}
                      </span>
                    </span>
                    <span className="al-row__op" title={entry.operation}>
                      {entry.operation}
                    </span>
                    <span
                      className="ov-mono al-row__target"
                      title={entry.target}
                    >
                      {entry.target}
                    </span>
                    <span className="ov-mono al-table__num">
                      {formatDuration(entry.durationMs)}
                    </span>
                    <span className="al-table__center">
                      <StatusPill status={entry.status} />
                    </span>
                  </button>

                  {open && expandable ? (
                    <div className="al-detail">
                      {entry.command ? (
                        <DetailBlock label="Command" copyText={entry.command}>
                          <code className="al-detail__cmd">
                            {entry.command}
                          </code>
                        </DetailBlock>
                      ) : null}
                      {entry.output ? (
                        <DetailBlock label="Output" copyText={entry.output}>
                          <pre className="al-detail__out">{entry.output}</pre>
                        </DetailBlock>
                      ) : null}
                      {entry.diagnostics && entry.diagnostics.length > 0 ? (
                        <div className="al-detail__block">
                          <div className="al-detail__label">Diagnostics</div>
                          <ul className="al-diags">
                            {entry.diagnostics.map((d, i) => (
                              <li
                                key={`${entry.id}-d-${i}`}
                                className="al-diags__row"
                              >
                                <DiagIcon severity={d.severity} />
                                <div>
                                  <div className="al-diags__msg">
                                    {d.path ? (
                                      <code className="ov-mono">{d.path}</code>
                                    ) : null}
                                    {d.path ? " — " : null}
                                    {d.message}
                                  </div>
                                  {d.fix ? (
                                    <div className="al-diags__fix">
                                      Fix: {d.fix}
                                    </div>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="al-foot">
        <Lock size={14} aria-hidden />
        Logs are stored locally in this browser session and never uploaded. A
        durable audit trail will land in a future release.
      </p>
    </div>
  );
}

function StatusPill(props: { status: AuditStatus }): ReactElement {
  const Icon =
    props.status === "success"
      ? CheckCircle2
      : props.status === "warning"
        ? AlertTriangle
        : XCircle;
  return (
    <span className="al-status-pill" data-status={props.status}>
      <Icon size={12} aria-hidden />
      {props.status}
    </span>
  );
}

function DiagIcon(props: {
  severity: "info" | "warning" | "error";
}): ReactElement {
  if (props.severity === "error") {
    return <XCircle size={14} className="al-diags__icon al-diags__icon--err" />;
  }
  if (props.severity === "warning") {
    return (
      <AlertTriangle
        size={14}
        className="al-diags__icon al-diags__icon--warn"
      />
    );
  }
  return <CheckCircle2 size={14} className="al-diags__icon" />;
}

function DetailBlock(props: {
  label: string;
  copyText: string;
  children: ReactElement;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  return (
    <div className="al-detail__block">
      <div className="al-detail__label-row">
        <span className="al-detail__label">{props.label}</span>
        <button
          type="button"
          className="al-copy"
          onClick={() => {
            void navigator.clipboard.writeText(props.copyText).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          <Copy size={12} aria-hidden />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="al-detail__box">{props.children}</div>
    </div>
  );
}
