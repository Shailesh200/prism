import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Truncate } from "./Truncate.js";

export const TABLE_COLUMN_TYPES = [
  "text",
  "timestamp",
  "tag",
  "number",
  "action",
] as const;

export type TableColumnType = (typeof TABLE_COLUMN_TYPES)[number];

export type TableColumn<Row> = {
  readonly id: string;
  readonly header: string;
  /** Cell UI: stacked local time, tag, 2-line text, numeric, or a trailing action. */
  readonly type?: TableColumnType;
  /** Fixed column width so tags and hosts are not squeezed under `table-layout: fixed`. */
  readonly width?: string;
  /** Single-line ellipsis instead of a 2-line wrap (host names, short labels). */
  readonly nowrap?: boolean;
  /** Full cell copy for hover when the cell is ellipsized. */
  readonly tip?: (row: Row) => string;
  readonly sortable?: boolean;
  readonly className?: string;
  readonly render: (row: Row) => ReactNode;
  readonly sortValue?: (row: Row) => string | number;
};

export type TableSort = {
  readonly id: string;
  readonly dir: "asc" | "desc";
};

export type TableProps<Row> = {
  readonly columns: readonly TableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly sort?: TableSort;
  readonly onSort?: (sort: TableSort) => void;
  readonly selectedKey?: string;
  readonly onRowClick?: (row: Row) => void;
  readonly empty?: ReactNode;
  readonly className?: string;
};

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function tableColumnType(
  column: Pick<TableColumn<unknown>, "type">,
): TableColumnType {
  return column.type ?? "text";
}

export function tableColumnClassName(
  column: Pick<TableColumn<unknown>, "type" | "className" | "nowrap">,
): string {
  return [
    "prism-table__col",
    `prism-table__col--${tableColumnType(column)}`,
    column.nowrap ? "prism-table__col--nowrap" : "",
    column.className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function tableColumnStyle(
  column: Pick<TableColumn<unknown>, "width">,
): CSSProperties | undefined {
  if (!column.width) return undefined;
  if (column.width.trim().endsWith("%")) {
    return { width: column.width };
  }
  return {
    width: column.width,
    minWidth: column.width,
    maxWidth: column.width,
  };
}

function TableHeadLabel(props: {
  readonly header: string;
}): ReactElement | null {
  if (!props.header) return null;
  return <Truncate title={props.header}>{props.header}</Truncate>;
}

function tableCellBody<Row>(column: TableColumn<Row>, row: Row): ReactNode {
  const content = column.render(row);
  const tip = column.tip?.(row)?.trim();
  if (!tip) return content;
  return <Truncate title={tip}>{content}</Truncate>;
}

/** Local calendar day + 24h clock, stacked so the date never shares a line with the time. */
export function TableTimestamp(props: {
  readonly iso: string;
  readonly seconds?: boolean;
}): ReactElement {
  const at = Date.parse(props.iso);
  if (Number.isNaN(at)) {
    return <span className="prism-table__when">—</span>;
  }
  const d = new Date(at);
  const day = `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}${
    props.seconds ? `:${pad2(d.getSeconds())}` : ""
  }`;
  return (
    <time className="prism-table__when" dateTime={props.iso}>
      <span className="prism-table__when-day">{day}</span>
      <span className="prism-table__when-time">{time}</span>
    </time>
  );
}

export function TableNumber(props: {
  readonly children: ReactNode;
}): ReactElement {
  return <span className="prism-table__num">{props.children}</span>;
}

export function Table<Row>(props: TableProps<Row>): ReactElement {
  const wrapClass = ["prism-table-wrap", props.className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={wrapClass}>
      <table className="prism-table">
        <thead>
          <tr>
            {props.columns.map((column) => {
              const active = props.sort?.id === column.id;
              const dir = active ? props.sort?.dir : undefined;
              const type = tableColumnType(column);
              return (
                <th
                  key={column.id}
                  className={tableColumnClassName(column)}
                  data-type={type}
                  style={tableColumnStyle(column)}
                  scope="col"
                >
                  {column.sortable && props.onSort ? (
                    <button
                      type="button"
                      className="prism-table__sort"
                      aria-sort={
                        dir === "asc"
                          ? "ascending"
                          : dir === "desc"
                            ? "descending"
                            : "none"
                      }
                      onClick={() =>
                        props.onSort?.({
                          id: column.id,
                          dir: active && dir === "asc" ? "desc" : "asc",
                        })
                      }
                    >
                      <TableHeadLabel header={column.header} />
                      {dir === "asc" ? (
                        <ArrowUp size={12} aria-hidden />
                      ) : dir === "desc" ? (
                        <ArrowDown size={12} aria-hidden />
                      ) : (
                        <ArrowUpDown size={12} aria-hidden />
                      )}
                    </button>
                  ) : (
                    <TableHeadLabel header={column.header} />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {props.rows.length === 0 ? (
            <tr>
              <td colSpan={props.columns.length}>
                {props.empty ?? "None yet."}
              </td>
            </tr>
          ) : (
            props.rows.map((row) => {
              const key = props.rowKey(row);
              const clickable = Boolean(props.onRowClick);
              return (
                <tr
                  key={key}
                  className={
                    props.selectedKey === key
                      ? "prism-table__row--on"
                      : undefined
                  }
                  tabIndex={clickable ? 0 : undefined}
                  onClick={() => props.onRowClick?.(row)}
                  onKeyDown={(event) => {
                    if (!clickable) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      props.onRowClick?.(row);
                    }
                  }}
                >
                  {props.columns.map((column) => {
                    const type = tableColumnType(column);
                    const cellClass = [
                      "prism-table__cell",
                      `prism-table__cell--${type}`,
                      column.nowrap ? "prism-table__cell--nowrap" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td
                        key={column.id}
                        className={tableColumnClassName(column)}
                        data-type={type}
                        style={tableColumnStyle(column)}
                      >
                        <div className={cellClass}>
                          {tableCellBody(column, row)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function sortRows<Row>(
  rows: readonly Row[],
  columns: readonly TableColumn<Row>[],
  sort: TableSort | undefined,
): readonly Row[] {
  if (!sort) return rows;
  const column = columns.find((item) => item.id === sort.id);
  const valueOf = column?.sortValue;
  if (!valueOf) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    const cmp =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), undefined, {
            numeric: true,
            sensitivity: "base",
          });
    return sort.dir === "asc" ? cmp : -cmp;
  });
  return copy;
}
