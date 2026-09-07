import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export type TableColumn<Row> = {
  readonly id: string;
  readonly header: string;
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
              return (
                <th key={column.id} className={column.className} scope="col">
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
                      {column.header}
                      {dir === "asc" ? (
                        <ArrowUp size={12} aria-hidden />
                      ) : dir === "desc" ? (
                        <ArrowDown size={12} aria-hidden />
                      ) : (
                        <ArrowUpDown size={12} aria-hidden />
                      )}
                    </button>
                  ) : (
                    column.header
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
                  {props.columns.map((column) => (
                    <td key={column.id} className={column.className}>
                      {column.render(row)}
                    </td>
                  ))}
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
