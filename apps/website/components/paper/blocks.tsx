import type { ReactNode } from "react";
import { CopyButton } from "./copy-button";
import { Rich } from "./rich";

export function CommandBar({
  command,
  note,
}: {
  command: string;
  note?: string;
}) {
  return (
    <div className="cmd" role="group" aria-label="Command">
      <span className="p" aria-hidden="true">
        $
      </span>
      <span className="cmd-text">{command}</span>
      <CopyButton value={command} label="Copy command" />
      {note ? (
        <small style={{ color: "var(--cdim)", fontFamily: "var(--sans)" }}>
          {note}
        </small>
      ) : null}
    </div>
  );
}

export function Window({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`vis dark ${className}`}>
      <div className="bar">
        <i />
        <i />
        <i />
        <b>{title}</b>
      </div>
      <div className="body">{children}</div>
    </div>
  );
}

export function Terminal({
  title = "~/repo",
  command,
  lines,
}: {
  title?: string;
  command?: string;
  lines: ReactNode[];
}) {
  return (
    <Window title={title}>
      {command ? (
        <span className="ln">
          <span className="d">$ </span>
          {command}
        </span>
      ) : null}
      {lines.map((line, index) => (
        <span className="ln" key={index}>
          {line}
        </span>
      ))}
    </Window>
  );
}

export type ChatItem = {
  who: "you" | "prism" | "agent";
  label?: string;
  body: ReactNode;
};

export function Chat({ title, items }: { title: string; items: ChatItem[] }) {
  return (
    <Window title={title}>
      {items.map((item, index) => (
        <div className={`bub ${item.who}`} key={index}>
          <span className="who">
            {item.label ??
              (item.who === "you"
                ? "You"
                : item.who === "prism"
                  ? "Prism"
                  : "Agent")}
          </span>
          {item.body}
        </div>
      ))}
    </Window>
  );
}

export function ToolChip({ name }: { name: string }) {
  return <span className="tl">{name}</span>;
}

export function ConfigBlock({
  path,
  lang,
  code,
  note,
}: {
  path: string;
  lang: string;
  code: string;
  note?: ReactNode;
}) {
  return (
    <div className="cfg">
      <div className="cfg-h">
        <span className="lang">{lang}</span>
        <span className="path">{path}</span>
        <CopyButton value={code} label="Copy" className="copy" />
      </div>
      <pre>
        <code
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            whiteSpace: "pre",
            color: "inherit",
          }}
        >
          {code}
        </code>
      </pre>
      {note ? (
        <div
          className="cfg-f"
          style={{
            padding: "10px 20px 14px",
            borderTop: "1px solid #ffffff14",
            color: "var(--cdim)",
            font: "13.5px var(--sans)",
          }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}

export function InfoCallout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="info">
      <div className="ii" aria-hidden="true">
        <svg
          viewBox="0 0 20 20"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 9v5M10 6.3v.2" />
        </svg>
      </div>
      <div>
        <b>{title}</b>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="table-scroll">
      <table className="t">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PointGrid({
  items,
}: {
  items: Array<{ title: string; text: string }>;
}) {
  return (
    <div className="grid3">
      {items.map((item) => (
        <div className="card fx" key={item.title}>
          <h3 className="t">{item.title}</h3>
          <p>
            <Rich text={item.text} />
          </p>
        </div>
      ))}
    </div>
  );
}

export function ReviewCard() {
  return (
    <Window title="Cursor · review">
      <div className="rvw">
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "var(--cdim)",
            font: "12.5px var(--mono)",
            marginBottom: 8,
          }}
        >
          <ToolChip name="review_changes" />
          <span>working tree</span>
        </div>
        <div className="rv-risk">
          <span
            className="d"
            style={{ font: "600 11px var(--mono)", letterSpacing: ".1em" }}
          >
            RISK
          </span>
          <span className="meter" aria-hidden="true">
            <i style={{ width: "40%" }} />
          </span>
          <b style={{ color: "#fff", font: "600 18px var(--mono)" }}>mid</b>
          <span className="pill warn">Moderate Impact</span>
        </div>
        <div className="rv-stats">
          <span>
            changed <b>3</b>
          </span>
          <span>
            affected <b>11</b>
          </span>
          <span>
            tests <b>2</b>
          </span>
        </div>
        <p style={{ margin: "12px 0 0" }}>
          <span className="y">totals.ts</span> is widely used. Read it before
          you push. <span className="g">prism review --fail-on mid</span> exits
          1 at or above this band.
        </p>
      </div>
    </Window>
  );
}
