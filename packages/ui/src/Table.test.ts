import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Table,
  TableTimestamp,
  tableColumnClassName,
  tableColumnStyle,
  tableColumnType,
} from "./Table.js";

describe("Table column types", () => {
  it("defaults to text and stamps type classes on the column", () => {
    expect(tableColumnType({})).toBe("text");
    expect(tableColumnClassName({ type: "timestamp" })).toBe(
      "prism-table__col prism-table__col--timestamp",
    );
    expect(
      tableColumnClassName({ type: "text", nowrap: true, className: "host" }),
    ).toBe(
      "prism-table__col prism-table__col--text prism-table__col--nowrap host",
    );
  });

  it("renders timestamp, tag, text, and number cells from the type prop", () => {
    const html = renderToStaticMarkup(
      createElement(Table, {
        rowKey: (row: { id: string }) => row.id,
        rows: [{ id: "1" }],
        columns: [
          {
            id: "when",
            header: "Started",
            type: "timestamp",
            render: () =>
              createElement(TableTimestamp, {
                iso: "2026-09-12T11:48:16.000Z",
                seconds: true,
              }),
          },
          {
            id: "kind",
            header: "Kind",
            type: "tag",
            render: () => "Chat",
          },
          {
            id: "title",
            header: "Title",
            type: "text",
            render: () => "this chat",
          },
          {
            id: "lists",
            header: "Lists",
            type: "number",
            render: () => "2",
          },
        ],
      }),
    );
    expect(html).toContain('data-type="timestamp"');
    expect(html).toContain("prism-table__col--timestamp");
    expect(html).toContain("prism-table__cell--timestamp");
    expect(html).toContain("prism-table__col--tag");
    expect(html).toContain("prism-table__cell--text");
    expect(html).toContain("prism-table__col--number");
  });

  it("caps explicit column width and shows overflow copy on hover", () => {
    expect(tableColumnStyle({ width: "5.5rem" })).toEqual({
      width: "5.5rem",
      minWidth: "5.5rem",
      maxWidth: "5.5rem",
    });
    expect(tableColumnStyle({ width: "38%" })).toEqual({ width: "38%" });
    const html = renderToStaticMarkup(
      createElement(Table, {
        rowKey: (row: { id: string }) => row.id,
        rows: [{ id: "1", title: "CLI SARIF root-object contract" }],
        columns: [
          {
            id: "title",
            header: "Then focused",
            type: "text",
            width: "5.5rem",
            tip: (row: { title: string }) => row.title,
            render: (row: { title: string }) => row.title,
          },
        ],
      }),
    );
    expect(html).toContain("prism-truncate");
    expect(html).toContain("CLI SARIF root-object contract");
    expect(html).toContain("Then focused");
  });
});

describe("TableTimestamp", () => {
  it("stacks local day and time instead of sharing one nowrap line", () => {
    const html = renderToStaticMarkup(
      createElement(TableTimestamp, {
        iso: "2026-09-12T11:48:16.000Z",
        seconds: true,
      }),
    );
    expect(html).toContain("prism-table__when-day");
    expect(html).toContain("prism-table__when-time");
    expect(html).toMatch(/<span class="prism-table__when-day">/);
    expect(html).toMatch(/prism-table__when-time">\d{2}:\d{2}:\d{2}</);
    expect(html).not.toContain("prism-table__when-day prism-table__when-time");
  });
});
